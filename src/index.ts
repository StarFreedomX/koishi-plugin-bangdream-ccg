import {Context, h, Random, Schema, Time, Logger} from 'koishi'
import {exec} from "child_process";
import * as XLSX from 'xlsx';
import {} from '@koishijs/cache'
import * as fs from 'fs'
//import * as os from 'os';

export const ccgLogger = new Logger('bangdream-ccg');

export const inject = ['cache']

//这里会用到一个表单的两个key，一个key为pre，记为缓存1；另一个key为run，记为缓存2
declare module '@koishijs/cache' {
  interface Tables {
    [key: `bangdream_ccg_${string}`]: Song;//储存歌曲信息
  }
}

/**
 * 具体实现思路（参考kumo的cck）：
 * 初始化：
 *        从Tsugu仓库获取nickname_song.xlsx(只下载一次，后续全用本地的)(暂未实现)
 *        检测插件目录是否有nickname_song.xlsx，若有，将插件目录下的nickname_song.xlsx移动到data中持久保存
 *
 * 每次触发：
 *    start:
 *        判断是否已经开始
 *        如果已经开始，直接return
 *
 *        如果未开始，那么执行下列步骤
 *        从bestdori获取bandId.json、songInfo.json
 *        将对象1的属性复制到对象2中，并将对象2存入缓存的表为"bangdream_ccg_{gid}"的key为run的项中
 *        发送temp.mp3
 *        修改isStarted为true//ps:最新版本采用直接删除
 *        监听回复(reply流程)
 *        同时
 *        {
 *        执行一次随机挑选
 *        把挑选的结果记录在对象1中，并把对象1存入缓存的表为"bangdream_ccg_{gid}"的key为pre的项中
 *        从bestdori下载歌曲
 *        生成文件temp.mp3
 *        }
 *    reply:
 *        监听器监听消息
 *        判断是否为当前群组
 *        每次接收消息判断是否正确
 *            判断正确的方法：从cache读取当前群组的answers并且存为局部变量
 *        若正确，则取消监听，发送答案正确提示，并修改isStarted为true
 *        若消息为ccg stop，则取消监听，发送停止游戏提示
 *        若消息为ccg answer，则取消监听，发送答案
 *        若消息为ccg tips，则发送[乐队名称、歌曲字符长度]中的一个作为提示
 *        (不正确且不是指令会不响应)
 *
 *
 * 具体实现流程：*是否运行中使用缓存2的isCompleted判断
 *      插件运行->收到ccg指令->是否运行中--否->检查是否存在nickname_song.xlsx--有->获取json->检查缓存01是否有歌曲--无->随机一首歌放到缓存02区
 *                            └-是->已经在运行中           └-无->报错                    └-有->01复制一份到02->发送缓存02的歌曲片段<-┘
 *                                                                                        随机一首歌放到01缓存<-┘
 *      插件运行->收到ccg [option]->是否运行中--是->//待实现
 *                                  └-否->不在运行中
 *
 *      插件运行->收到ccg.stop->是否运行中--是->发送停止消息，释放缓存
 *                              └-否->不在运行中
 *
 *      插件运行->收到ccg.answer->是否运行中--是->发送答案，释放缓存
 *                              └-否->不在运行中
 *
 *      插件运行->收到ccg.add->执行addNickname()，输出返回值添加成功/失败
 *
 *      插件运行->收到ccg.tips->是否运行中--是->执行提示代码，输出
 *                              └-否->不在运行中
 *
 *      插件运行->收到ccg.clear->删除数据库缓存->返回消息
 *
 */
export const name = 'bangdream-ccg';

export const usage = `
<h1>邦多利猜猜歌</h1>
<h2>歌曲数据来源于bestdori.com</h2>

<h4>开发中，有问题可以到GitHub提issue<del>(114514年后才会解决)</del></h4>
<h2>Notice</h2>
* 本项目需提前安装并配置FFmpeg<br/>
* 目前只在单个群聊做过测试<br/>
* 如果遇到assets中的nickname_song.xlsx丢失需要自行到本仓库下载<br/>
* 不要随意删除cache的文件，如果由于文件未找到而报错，可以手动前往数据库或通过指令ccg.clear清除缓存<br/>
<br/>
<h2>Advanced</h2>
关于配置项songFileId,占位符如下：<br/>
{songName}=>歌曲名<br/>
{songId}=>歌曲id<br/>
{bandName}=>乐队名<br/>
{bandId}=>乐队id<br/>

<h2>Thanks</h2>
<h4>开发过程中参考插件koishi-plugin-cck(作者kumoSleeping)</h4>
`

export const assetsUrl : string = `${__dirname}/../assets`;

export let cacheUrl : string;
export let dataUrl : string;

//export const SONG_ID_KEYS = Object.keys(songInfoJson);

export interface Song {
  bandId: string;
  bandName: string;
  songId: string;
  songName: string;
  songLength: number;
  selectedSecond: number;
  answers: string[];
  isComplete: boolean;
  tips: string[];
}

export interface nicknameExcelElement {
  Id: number;
  Title: string;
  Nickname: string;
}

export interface nicknameJson{
  [songId: string]: nicknameJsonElement;
}

export interface nicknameJsonElement {
    title: string;
    nicknames: string[];
    //这个ignore是用来记录仓库别名的删除数据的，因为不会直接操作仓库别名，所以在更新时具有持久性
    nicknamesIgnore: string[];
}

enum Servers {
  JP = 1,
  EN = 2,
  ZH_TW = 4,
  ZH_CN = 8,
  KR = 16,
}

export interface Config {
  serverLimit: number;
  //cd: number;
  audioLength: number;
  idGuess: boolean;
  saveJson: boolean;
  timeout: number;
  alwaysUseLocalJson: boolean;
  songInfoUrl: string;
  bandIdUrl: string;
  songFileUrl: string
  nickname: boolean;
  //nicknameUrl: string;
  //saveSongFile: boolean;
  defaultSongNameServer: number;
  FFmpegPath: string;
}

export const Config = Schema.intersect([
  Schema.object({
    serverLimit: Schema.bitset(Servers).required().description("服务器选择，至少选择一个"),
    defaultSongNameServer: Schema.union([
      Schema.const(0).description('JP'),
      Schema.const(1).description('EN'),
      Schema.const(2).description('ZH_TW'),
      Schema.const(3).description('ZH_CN'),
      Schema.const(4).description('KR'),
    ]).default(0).description("默认歌曲名称服务器，显示答案时默认使用该项配置的服务器歌曲名称"),
    //cd: Schema.number().default(5).description("冷却时间，建议设置为大于5s，否则可能预下载失败"),
    audioLength: Schema.number().default(5).description("发送音频的长度"),
    timeout: Schema.number().default(300).description("猜歌超时时间，单位秒"),
    idGuess: Schema.boolean().default(true).description("是否允许使用歌曲id猜歌"),
    nickname: Schema.boolean().default(true).description("是否启用别名匹配"),
    //saveSongFile: Schema.boolean().default(false).description("是否保存歌曲到本地（会占用一定的存储空间，但可以使已下载歌曲无需再次下载，执行速度更快）"),
    saveJson: Schema.boolean().default(true).description("是否保存json至本地（这使得由于网络波动等原因获取json文件失败时，使用本地json）"),
    alwaysUseLocalJson: Schema.boolean().default(false).description("是否优先使用本地json"),
  }).description('基础配置'),
  Schema.object({
    FFmpegPath: Schema.string().description("FFmpeg路径，当控制台出现Pipe报错则需要手动配置，否则留空即可"),
    songInfoUrl: Schema.string().default("https://bestdori.com/api/songs/all.7.json").description("歌曲信息地址，默认url来源于bestdori.com"),
    bandIdUrl: Schema.string().default("https://bestdori.com/api/bands/all.1.json").description("乐队信息地址，默认url来源于bestdori.com"),
    songFileUrl: Schema.string().default("https://bestdori.com/assets/jp/sound/bgm{songId}_rip/bgm{songId}.mp3").description("歌曲下载地址，花括号内的songId对应实际的songId被替换"),
    //nicknameUrl: Schema.string().default("https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx").description("别名数据表来源，默认为Tsugu机器人仓库"),
  }).description('高级配置'),
])


export function apply(ctx: Context, cfg: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))

  //初始化，检测当前的应用目录
  dataUrl = `${ctx.baseDir}/data/bangdream-ccg`;
  cacheUrl = `${ctx.baseDir}/cache/bangdream-ccg`;
  fs.mkdirSync(dataUrl, {recursive: true});
  fs.mkdirSync(cacheUrl, {recursive: true});
  console.log('目录初始化成功');

  //console.log(fs.existsSync(`${assetsUrl}/nickname_song.xlsx`))
  if (fs.existsSync(`${assetsUrl}/nickname_song.xlsx`)){
    console.log('copying & removing')
    fs.copyFileSync(`${assetsUrl}/nickname_song.xlsx`, `${dataUrl}/nickname_song.xlsx`);
    //fs.copyFileSync(`${assetsUrl}/nickname_song.xlsx`, `${assetsUrl}/nickname_song.xlsx`);
    fs.rmSync(`${assetsUrl}/nickname_song.xlsx`);
  }




  ctx.command("ccg [option:text]")
    .alias("猜猜歌")
    .usage('发送ccg开始猜歌游戏，发送消息参与猜歌')
    .example('ccg : 开始猜歌游戏')
    .example('Fire Bird : 猜歌曲是"Fire Bird"')
    .example('秋妈妈 : 猜歌曲是"秋妈妈"')
    .example('1 : 猜歌曲id是1的歌曲')
    .example('ccg.add -h : 查询ccg add子指令')
    .action(async ({session}, option) => {
      if (!session) {
        return;
      }

      //没有带参数，进入启动流程
      if (!option) {
        //console.log('start01');
        //detectedXlsx(ctx, cfg);
        //console.log('start02');
        //start
        //获取是否在进行中
        let runSongInfo = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
        if (!runSongInfo || runSongInfo.isComplete) {
          //进入启动流程

          //判断缓存1是否有歌曲，如果没有，那么先生成在发送，存入缓存2；如果有，直接发送，并将缓存1的内容转移到缓存2
          let readySong = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'pre');
          //console.log('start03');
          session.send("语音发送中...")
          const JSONs = await initJson(cfg);  //初始化json
          //console.log('start04');
          const existCache = fs.existsSync(`${cacheUrl}/[full]temp_${session.gid.replace(/:/g, '_')}.mp3`) &&
            fs.existsSync(`${cacheUrl}/temp_${session.gid.replace(/:/g, '_')}.mp3`);
          //console.log(existCache);
          if (!readySong || !existCache) { //这里没有获取到缓存1的内容，那么需要生成一个直接放到缓存2
            const song = await handleSong(JSONs, ctx, cfg, session.gid.replace(/:/g, '_'));
            //存入缓存2
            ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', song, Time.day);
            console.log(`缓存情况:${!!readySong}`);
            console.log(`文件情况:${existCache}`);
            console.log("已生成并存入缓存2:");
            console.log(song);
          } else {
            //读取缓存1的内容
            const preSong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'pre');
            //存入缓存2
            ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', preSong, Time.day);
            console.log("已存入缓存2:");
            console.log(preSong);
          }
          //console.log('start05');
          //try {
            //发送语音消息
            const audio = h.audio(`${cacheUrl}/temp_${session.gid.replace(':', '_')}.mp3`)
            //console.log('start06');

            await session.send(audio);
            console.log('发送成功');
          //}catch (error){
           // console.error(error);
          //}
          //console.log('start07');
          //这里加入监听代码
          const dispose = ctx.channel(session.channelId).middleware(async (session, next) => {
            const readySong = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
            if (!readySong || readySong.isComplete) {
              dispose();
              return next();
            } else if (readySong.answers.some(alias => betterCompare(alias, session.content))) {
              dispose();
              disposeTimer();
              //console.log('complete')
              await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'run');
              await session.send(session.text("commands.ccg.messages.answer", {
                selectedKey: readySong.songId,
                selectedBandName: readySong.bandName,
                selectedSongName: readySong.songName,
                answers: readySong.answers.toString(),
                selectedSecond: readySong.selectedSecond,
              }))
            } else {
              return next();
            }
          })

          const disposeTimer = ctx.setTimeout(async () => {

            let readySong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
            if (readySong && !readySong.isComplete) {
              await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'run');
              dispose();
              await session.send(session.text("commands.ccg.messages.timeout", {
                selectedKey: readySong.songId,
                selectedBandName: readySong.bandName,
                selectedSongName: readySong.songName,
                answers: readySong.answers.toString(),
                selectedSecond: readySong.selectedSecond,
              }));
            }
          }, cfg.timeout * 1000)


          //这里已经发送完毕，缓存2已经准备好了题目的信息
          //接下来需要处理的是缓存1，提前准备好下一次的题目
          const preSong = await handleSong(JSONs, ctx, cfg, session.gid.replace(/:/g, '_'));
          await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'pre', preSong, Time.day);
          console.log("已存入缓存1:");
          console.log(preSong);
        } else {
          //已经开始，return结束
          return session.text('.alreadyRunning');
        }
      } else {


      }


    });

  ctx.command('ccg.answer')
    .usage('结束游戏，并查看当前游戏答案')
    .action(async ({session}) => {
      //判断缓存2是否有歌曲，以及是否已经结束
      let readySong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
      if (!readySong || readySong.isComplete) {
        return session.text(".notRunning");
      }
      //readySong.isComplete = true;
      //await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run',readySong, Time.day);
      await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'run');
      return session.text('.answer', {
        selectedKey: readySong.songId,
        selectedBandName: readySong.bandName,
        selectedSongName: readySong.songName,
        answers: readySong.answers.toString(),
        selectedSecond: readySong.selectedSecond,
      })
    })

  ctx.command('ccg.stop')
    .usage('结束游戏')
    .action(async ({session}) => {
      //return session.text('.alreadyRunning');
      //判断缓存2是否有歌曲，以及是否已经结束
      let readySong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
      if (!readySong || readySong.isComplete) {
        return session.text(".notRunning");
      }
      //readySong.isComplete = true;
      //await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', readySong, Time.day);
      await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'run');
      return session.text('.stopComplete')
    });

  ctx.command("ccg.add <songId:number> <nickname:text>")
    .usage('为歌曲添加别名')
    .example('ccg.add 4 泪滴 : 为id为4的歌曲添加别名"泪滴"')
    .action(async ({session}, songId, nickname) => {
      if ((!songId) || (!nickname)) {
        return session.text(".addOptionErr");
      }
      const JSONs: JSON[] = await initJson(cfg)
      const songInfo: Song = await getSongInfoById(`${songId}`, JSONs[0], JSONs[1], cfg);
      if (!songInfo) {
        return session.text(".songNotFound", {songId: songId});
      }
      return await addNickname(songId, songInfo.songName, nickname.replace(/,/g, '，'));//这里由于半角逗号是分隔符，所以不能直接存入半角逗号，应该存入全角逗号（仍能）匹配
    });

  ctx.command("ccg.del <songId:number> <nickname:text>")
    .usage('为歌曲删除别名')
    .example('ccg.del 2 sb : 为id为2的歌曲删除别名"sb"')
    .userFields(['authority'])
    .action(async ({session}, songId, nickname) => {
      if ((!songId) || (!nickname)) {
        return session.text(".delOptionErr");
      }
      const JSONs: JSON[] = await initJson(cfg)
      const songInfo: Song = await getSongInfoById(`${songId}`, JSONs[0], JSONs[1], cfg);
      if (!songInfo) {
        return session.text(".songNotFound", {songId: songId});
      }
      return await delNickName(songId, nickname, songInfo);
    })

  ctx.command("ccg.tips [option:text]")
    .usage('获取当前游戏提示')
    .action(async ({session}, option) => {
        //判断缓存2是否有歌曲，以及是否已经结束
        let readySong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
        if (!readySong || readySong.isComplete) {
          return session.text(".notRunning");
        }
        const runningSong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');

        const tips = runningSong.tips;
        //console.log(tips);
        if (!tips) {
          return session.text(".noMoreTips");
        }

      let newTips = [];
      let selectedElement : string;
        //不带参数
        if (!option) {
          const selectedIndex = Random.int(tips.length);
          for (let i = 0; i < tips.length; i++) {
            if (i == selectedIndex) {
              selectedElement = tips[i];
              continue;
            }
            newTips.push(tips[i]);
          }

        } else {
          let tipsIndex = -1;
          if(['band', '乐队', '0'].some(name => betterCompare(name, option))){
            tipsIndex = 0;
          }else if(['EX谱面难度', '定级', 'difficulty', '难度', 'ex', '1'].some(name => betterCompare(name, option))){
            tipsIndex = 1;
          }else if(['bpm', '2'].some(name => betterCompare(name, option))){
            tipsIndex = 2;
          }else if(['歌曲类型', '类型', 'tag', '3'].some(name => betterCompare(name, option))){
            tipsIndex = 3;
          }else if(['发布时间', '时间', 'time', '4'].some(name => betterCompare(name, option))){
            tipsIndex = 4;
          }else if ('all' == option){
            tipsIndex = -2;
          }else{
            tipsIndex = -1;
          }
          let tipsElementIndex : number;
          if (tipsIndex > -1 && (tipsElementIndex = tips.findIndex(tipsElement => tipsElement.includes(['乐队', 'EX谱面难度', 'Bpm', '歌曲类型', '服发布时间'][tipsIndex]))) != -1){
            for (let i = 0; i < tips.length; i++) {
              if (i == tipsElementIndex) {
                selectedElement = tips[i];
                continue;
              }
              newTips.push(tips[i]);
            }
          }else if (tipsIndex == -2){
            selectedElement = '';
            for (let i = 0; i < tips.length; i++) {
                selectedElement += tips[i] + '\n';
            }
          }else if (tipsIndex == -1){
            newTips = tips;
          }
        }
      runningSong.tips = newTips;
      await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', runningSong);

      if (!selectedElement) {
        return session.text(".noMoreTips");
      }
      return session.text(".tips", {tips: selectedElement});

      }
    )


  ctx.command("ccg.clear")
    .usage('清除数据库缓存')
    .userFields(['authority'])
    .action(async ({session}) => {
      await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'run');
      await ctx.cache.delete(`bangdream_ccg_${session.gid}`, 'pre');
      return session.text('.delCompleted');
    })

  ctx.command("ccg.list <songId:number>")
    .usage('根据id查看别名列表')
    .example('ccg.list 1 : 查看id为1的歌曲的别名列表')
    .action(async ({session}, songId) => {
      if (!songId) {
        return "请指定歌曲id";
      }
      const nicknames = await getNicknames(songId, 3);
      const answers = (nicknames)?(nicknames).toString() : undefined;
      if (!answers) {
        return session.text(".songNotFound", {songId: songId});
      }
      //console.log(await getNicknames(songId));
      return session.text(".returnList", {
        songId: songId,
        answers: answers
      })
    })

  //测试
  /*
  ctx.command("test [option:text]")
  .action(async ({session}, option) => {
    //await writeJSON('{"1":"test"}',dataUrl + '/temp.json')
    console.log("finish")
  });*/

}

/**
 * 通过一个Key(也同时是歌曲Id)来获取歌曲的所有信息
 * 方法内自带随机选点，返回的Song对象包含已经选好的信息
 * 方法内自带裁切程序，文件放在assets中
 * @param selectedKey 歌曲Id
 * @param songInfoJson 歌曲信息json文件
 * @param bandIdJson 乐队信息json文件
 * @param cfg 配置表单
 */
async function getSongInfoById(selectedKey: string, songInfoJson: JSON, bandIdJson: JSON, cfg: Config): Promise<Song> {
  //获取歌曲信息
  const selectedSong = songInfoJson[selectedKey];
  //console.log(selectedKey);
  //console.log(selectedSong);
  //乐队名
  const selectedBandName = bandIdJson[selectedSong["bandId"]]["bandName"][0];
  //歌曲名
  const selectedSongNames = selectedSong["musicTitle"];
  const selectedSongLength: number = selectedSong["length"];
  let selectedSecond = Random.int(0, Math.floor(selectedSongLength) - cfg.audioLength);
  let answers = selectedSongNames.filter((item: string) => item != null && item != "");
  if (cfg.idGuess) {
    answers = answers.concat(selectedKey);
  }

  answers = answers.concat(await getNicknames(Number(selectedKey), 3));

  const songExpertLevel: number = selectedSong["difficulty"]["3"]["playLevel"];
  const songBpm: number = selectedSong["bpm"]["3"][0]["bpm"];
  const songTag: string = selectedSong["tag"];
  const songTimeArray = selectedSong["publishedAt"];
  let server = cfg.serverLimit;
  //console.log(`server: ${server}`);
  const serverName = ['日服', '国际服', '台服', '国服', '韩服'];
  let songTime: string = '';
  for (let i = 0; server && i < 5; i++) {
    if (server % 2 && songTimeArray[i]) {
      //console.log('server:+++++++++++'+server);
      const newDate = new Date(Number(songTimeArray[i]));
      //console.log(newDate);
      songTime += (`${serverName[i]}发布时间:${newDate.getFullYear()}年\n`);
    }
    server = server >> 1;
  }
  const songTips: string[] = [`乐队:${selectedBandName}`, `EX谱面难度:${songExpertLevel}`, `Bpm:${songBpm}`, `歌曲类型:${songTag}`, `${songTime}`];


  const songInfo: Song = {
    bandId: selectedSong["bandId"].toString(),
    bandName: selectedBandName,
    songId: selectedKey,
    songName: selectedSongNames[cfg.defaultSongNameServer],
    songLength: selectedSongLength,
    selectedSecond: selectedSecond,
    answers: answers,
    isComplete: false,
    tips: songTips
  };
  //console.log(answers);
  //console.log(selectedKey);
  return songInfo;

}

/**
 * 随机获取一首歌（符合配置的条件）
 * @param songInfoJson 歌曲信息json
 * @param bandIdJson 乐队信息json
 * @param cfg 配置表单
 */
async function getRandomSong(songInfoJson: JSON, bandIdJson: JSON, cfg: Config): Promise<Song> {
  let selectedKey: string;
  do {
    selectedKey = Random.pick(Object.keys(songInfoJson))
    //筛选服务器
    if (
      ((cfg.serverLimit >> 0) % 2 && songInfoJson[selectedKey]['musicTitle'][0]) ||       //日服
      ((cfg.serverLimit >> 3) % 2 && songInfoJson[selectedKey]['musicTitle'][3]) ||       //国服
      ((cfg.serverLimit >> 1) % 2 && songInfoJson[selectedKey]['musicTitle'][1]) ||       //国际服
      ((cfg.serverLimit >> 2) % 2 && songInfoJson[selectedKey]['musicTitle'][2]) ||       //台服
      ((cfg.serverLimit >> 4) % 2 && songInfoJson[selectedKey]['musicTitle'][4]))        //韩服
      break;
  } while (true);
  return getSongInfoById(selectedKey, songInfoJson, bandIdJson, cfg);

}

/**
 * 从特定url获取json，并返回json对象
 * @param url json文件的url
 */
async function fetchJson(url: string): Promise<JSON> {
  //try {
  // 发起网络请求并等待响应
  const response = await fetch(url);

  // 检查响应状态
  if (!response.ok) {
    throw new Error(`HTTP error! Fetch ${url} Failed, status: ${response.status}`);
  }

  // 解析 JSON 数据并返回
  return await response.json();
}

/**
 * 从特定url下载文件，并保存到本地目录下
 * @param fileUrl 文件网络地址
 * @param localPath 文件保存路径
 * @param ctx Content
 */
async function fetchFileAndSave(fileUrl: string, localPath: string, ctx: Context) {
  //console.log('test01');
  const responseType: 'arraybuffer' = 'arraybuffer';
  const config = {
    responseType
  };
  const fs = require('fs');
  // koishi内置网络服务，使用 ctx.http 发起请求时，返回的结果是直接解构出来的
  const arrayBuffer = await ctx.http.get(fileUrl, config);
  const buffer = Buffer.from(arrayBuffer);
  // 检查目录是否存在，不存在则创建
  //console.log(localPath);
  const dir = localPath.substring(0, localPath.lastIndexOf('/'));
  //console.log(dir);
  await fs.promises.mkdir(dir, {recursive: true});
  fs.writeFileSync(localPath, buffer);

}

/**
 * 执行命令
 * @param command 要执行的命令
 */
async function runCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error/*, stdout, stderr*/) => {
      if (error) {
        console.error(`Command error: ${error}`);
        ccgLogger.error('命令执行发生错误:\n' + error);
        reject(error);
      } else {
        //console.log(`Command output: ${stdout}`);
        resolve();
      }
    });
  });
}

/**
 * 写入json文件
 * @param jsonString 待写入的json字符串
 * @param path 保存路径
 */
async function writeJSON(jsonString: string, path: string) {
  return fs.promises.writeFile(path, jsonString);
}

/**
 * 裁剪音频文件
 * @param FFmpegPath FFmpeg路径
 * @param input 输入url
 * @param output 输出url
 * @param startTime 起始时间字符串，可以是纯数字也可以00:00:05格式
 * @param endTime 结束时间字符串
 */
async function trimAudio(FFmpegPath: string, input: string, output: string, startTime: string, endTime: string) {
  //const platform = os.platform()
  //const arch = os.arch()
  const command = `${FFmpegPath} -i ${input} -ss ${startTime} -to ${endTime} -acodec pcm_s16le -c copy ${output} -y`;
  //console.log(command);
  await runCommand(command);
}

/**
 * 完成歌曲的处理，包括筛选、下载、裁切、获取信息
 * @param JSONs json数组，按照[songInfoJson, bandIdJson]传入
 * @param ctx Context
 * @param cfg Config
 * @param gid session的gid
 */
async function handleSong(JSONs: JSON[], ctx: Context, cfg: Config, gid: string) {
  const song = await getRandomSong(JSONs[0], JSONs[1], cfg);  //随机获取一首歌
  //转换为实际歌曲文件地址
  const songFileUrl = turnSongFileUrl(song, cfg);
  //保存文件
  await fetchFileAndSave(songFileUrl, `${cacheUrl}/[full]temp_${gid}.mp3`, ctx);
  const FFmpegPath = cfg.FFmpegPath ? cfg.FFmpegPath : 'ffmpeg.exe';
  if (FFmpegPath) {}
  //裁切音频
  await trimAudio(FFmpegPath,
    `${cacheUrl}/[full]temp_${gid}.mp3`,
    `${cacheUrl}/temp_${gid}.mp3`,
    `${song.selectedSecond}`,
    `${song.selectedSecond + cfg.audioLength}`);
  return song;
}

/**
 * 补0，用于匹配文件名(bgm001.mp3)
 * @param numStr 传入数字
 * @return 传出补0后数字
 */
function padToThreeDigits(numStr: string): string {
  return numStr.padStart(3, '0');
}

/**
 * 读取Excel文件
 * @param filePath 文件目录
 */
async function readExcelFile(filePath: string): Promise<nicknameExcelElement[]> {
  // 读取Excel文件
  const workbook = XLSX.readFile(filePath);
  // 获取工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  return XLSX.utils.sheet_to_json(worksheet);
}

/**
 * 为歌曲添加别名
 * @param songId 歌曲id
 * @param title 歌曲名称
 * @param nickname 要添加的别名
 */
async function addNickname(songId: number, title: string, nickname: string) {
  /*
  // 读取Excel文件
  const workbook = XLSX.readFile(`${dataUrl}/nickname_song.xlsx'`);
  // 获取第一个工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  const nicknameJson: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);


  let appendSong = nicknameJson.find(item => item.Id == songId);

  if (appendSong) {
    //console.log(appendSong);
    //appendSong.Nickname = appendSong.Nickname ? appendSong.Nickname + ',' + nickname : nickname;
    if (appendSong.Nickname) {
      if (appendSong.Nickname.split(',').some(item => item === nickname)) {
        return "别名已存在!";
      } else {
        appendSong.Nickname += `,${nickname}`;
      }
    } else {
      appendSong.Nickname = nickname;
    }
    //console.log(appendSong);
  } else {
    const index = nicknameJson.findIndex(item => item.Id > songId);

    let appending: nicknameExcelElement = {
      Id: songId,
      Title: title,
      Nickname: nickname,
      '这列写备注（吐槽），C列的内容如果有中文逗号会像这样标红': ''
    }
    // 如果没有找到更大的Id，说明应该添加到数组末尾
    if (index === -1) {
      nicknameJson.push(appending);
    } else {
      // 否则，在找到的位置插入新对象
      nicknameJson.splice(index, 0, appending);
    }


  }
  const newWorksheet = XLSX.utils.json_to_sheet(nicknameJson, {skipHeader: false});
  //const workbook = XLSX.utils.book_new();
  //XLSX.utils.book_append_sheet(workbook, newWorksheet, 'Sheet1');
  workbook.Sheets[sheetName] = newWorksheet;

  // 设置列宽
  if (!newWorksheet['!cols']) {
    newWorksheet['!cols'] = [];
  }
  //列宽
  newWorksheet['!cols'].push({wch: 10}, {wch: 50}, {wch: 65}, {wch: 55});
  //右对齐
  //newWorksheet['!cols'][0] = { wch: 10, align: { horizontal: 'right' } };
  //console.log(newWorksheet);
  XLSX.writeFile(workbook, `${dataUrl}/nickname_song.xlsx`)
  return '别名添加成功';
*/





  const nicknameLocalPath = `${dataUrl}/nicknameLocal.json`
  const EXIST = fs.existsSync(nicknameLocalPath);
  let nicknameLocalJson : nicknameJson;

  //初始化
  if (EXIST) {
    //这里不用required，否则在文件被写入的时候无法及时改变状态或触发模块重载
    const readJson = await fs.promises.readFile(nicknameLocalPath, 'utf-8');
    try{
      nicknameLocalJson = JSON.parse(readJson ? readJson : "{}");
    }catch(e){
      ccgLogger.error(`json格式错误 : ${readJson} `);
      ccgLogger.error(e)
      return "添加失败，请检查日志";
    }
  }else {
    nicknameLocalJson = {};
  }
  console.log("start:")
  console.log(nicknameLocalJson);
  const oldNicknameLocalJson = JSON.stringify(nicknameLocalJson);
  const appendSong : nicknameJsonElement = nicknameLocalJson[songId];
  if (appendSong) {
    if (appendSong["nicknames"]) {
      if (appendSong["nicknames"].some(item => item === nickname)) {
        return "别名已存在!";
      } else {
        appendSong["nicknames"].push(nickname);
      }
    } else {
      appendSong["nicknames"] = [nickname];
    }
  }else{
    nicknameLocalJson[songId] = {
      title: title,
      nicknames: [nickname],
      nicknamesIgnore: [],
    };
  }
  //xlsx查重
  if ((await getNicknames(songId, 1)).some(item => betterCompare(item, nickname))) {
    return "别名已存在！"
  }
  await writeJSON(JSON.stringify(nicknameLocalJson), `${dataUrl}/nicknameLocal.json`);
  //fs.writeFileSync(`${dataUrl}/nicknameLocal.json`, JSON.stringify(nicknameLocalJson));
  console.log("end:");
  console.log(nicknameLocalJson);
  if (oldNicknameLocalJson == JSON.stringify(nicknameLocalJson)) {
    ccgLogger.warn(`json信息:${nicknameLocalJson},可能不符合所需要的json格式`);
    return "添加失败，请检查日志";
  }
  return "别名添加成功！";
}

/**
 * 根据歌曲id获取别名列表
 *
 * 实现：
 *    读取仓库别名和本地别名列表
 *    把仓库别名里的符合ignore的别名禁用
 *    返回两个别名列表相连的结果
 *
 * @param songId 歌曲id
 * @param option 选项, 1为仅xlsx，2为仅local，3为全部
 */
async function getNicknames(songId: number, option: number) {
  let answers: string[] = [];
  if(option == 1 || option == 3){
    const songNickname = await readExcelFile(`${dataUrl}/nickname_song.xlsx`);

    let nicknamesExcelItem = songNickname.find(item => item.Id == Number(songId));


    if (nicknamesExcelItem) {     //有对应Id的行
      //获取对应行的Nickname，可能有也可能是undefined
      const nicknames = nicknamesExcelItem.Nickname;
      //检测是否已经存在nicknames
      if (nicknames) {
        answers = nicknames.split(',');
      }
    }
  }
  if (option == 2 || option == 3) {
    const nicknameLocalPath = `${dataUrl}/nicknameLocal.json`
    const EXIST = fs.existsSync(nicknameLocalPath);
    let nicknameLocalJson: nicknameJson;
    //初始化
    if (EXIST) {
      //这里不用required，否则在文件被写入的时候无法及时改变状态或触发模块重载
      const readJson = await fs.promises.readFile(nicknameLocalPath, 'utf-8');
      console.log("json:" + readJson);
      try {
        nicknameLocalJson = JSON.parse(readJson ? readJson : "{}");
      } catch (e) {
        ccgLogger.error(`json格式错误 : ${readJson} `);
        ccgLogger.error(e)
        return ["发生错误，请检查日志"]
      }
      //直接返回
      if (!nicknameLocalJson || !nicknameLocalJson[songId] || !nicknameLocalJson[songId].nicknames) {
        return answers;
      }
      if (nicknameLocalJson[songId].nicknamesIgnore && nicknameLocalJson[songId].nicknamesIgnore.length > 0) {
        //筛选出没有被禁用的仓库别名
        answers = answers.filter(items => !nicknameLocalJson[songId].nicknamesIgnore.some(ignore => ignore === items))
      }
      //合并两个别名列表
      console.log(answers)
      return answers.concat(nicknameLocalJson[songId].nicknames);
    } else {
      return answers;
    }
  }
  //这一步是进行了xlsx没进行local的出口
  return answers;
}

/**
 * 删除别名
 * @param songId 歌曲Id
 * @param nickname 别名
 * @param songInfo 歌曲信息
 */
async function delNickName(songId: number, nickname: string, songInfo: Song) {
  /*// 读取Excel文件
  const workbook = XLSX.readFile(`${dataUrl}/nickname_song.xlsx`);
  // 获取第一个工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  const nicknameJson: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);

  const delSong: nicknameExcelElement = nicknameJson.find(item => item.Id == songId);
  if (!delSong) {
    return '未找到该别名';
  }
  let nicknameStr = delSong.Nickname;
  if (!nicknameStr) {
    return '未找到该别名';
  }
  const nicknames: string[] = nicknameStr.split(',');
  const newNicknames = nicknames.filter(item => item !== nickname);
  if (nicknames.length === newNicknames.length) {
    return '未找到该别名';
  }
  delSong.Nickname = newNicknames.join(',');


  const newWorksheet = XLSX.utils.json_to_sheet(nicknameJson, {skipHeader: false});
  //const workbook = XLSX.utils.book_new();
  //XLSX.utils.book_append_sheet(workbook, newWorksheet, 'Sheet1');
  workbook.Sheets[sheetName] = newWorksheet;

  // 设置列宽
  if (!newWorksheet['!cols']) {
    newWorksheet['!cols'] = [];
  }
  //列宽
  newWorksheet['!cols'].push({wch: 10}, {wch: 50}, {wch: 65}, {wch: 55});
  //右对齐
  //newWorksheet['!cols'][0] = { wch: 10, align: { horizontal: 'right' } };
  //console.log(newWorksheet);
  XLSX.writeFile(workbook, `${dataUrl}/nickname_song.xlsx`)
  return '别名删除成功！';*/



  const nicknameLocalPath = `${dataUrl}/nicknameLocal.json`
  const EXIST = fs.existsSync(nicknameLocalPath);
  let nicknameLocalJson : nicknameJson;
  //初始化
  if (EXIST) {
    //这里不用required，否则在文件被写入的时候无法及时改变状态或触发模块重载
    const readJson = await fs.promises.readFile(nicknameLocalPath, 'utf-8');
    try{
      nicknameLocalJson = JSON.parse(readJson ? readJson : "{}");
    }catch(e){
      ccgLogger.error(`json格式错误 : ${readJson} `);
      ccgLogger.error(e)
      return "添加失败，请检查日志"
    }

    //防止出现undefined访问错误
    if (nicknameLocalJson && nicknameLocalJson[songId] && nicknameLocalJson[songId].nicknames) {
      //循环筛选，即执行删除操作
      const newNicknames = nicknameLocalJson[songId].nicknames.filter(item => !betterCompare(item, nickname));
      //长度变了，说明删除成功
      if (nicknameLocalJson[songId].nicknames.length !== newNicknames.length) {
        nicknameLocalJson[songId].nicknames = newNicknames;
        await writeJSON(JSON.stringify(nicknameLocalJson), nicknameLocalPath);
        return "别名删除成功";
      }
    }
  }else{
    await writeJSON("{}", nicknameLocalPath);
  }
  // 读取Excel文件
  const workbook = XLSX.readFile(`${dataUrl}/nickname_song.xlsx`);
  // 获取第一个工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  const nicknameJson: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);

  const delSong: nicknameExcelElement = nicknameJson.find(item => item.Id == songId);
  if (!delSong) {
    return '未找到该别名';
  }
  let nicknameStr = delSong.Nickname;
  if (!nicknameStr) {
    return '未找到该别名';
  }
  const nicknames: string[] = nicknameStr.split(',');
  if (nicknames.some(item => item === nickname)) {
    const element = nicknameLocalJson[songId];
    //元素不存在，不能直接调用它的nicknameIgnore
    if (!element) {
      nicknameLocalJson[songId] = {
        title: songInfo.songName,
        nicknames: [],
        nicknamesIgnore: [nickname],
      }
    }else{
      //直接调用
      const hadIgnored = nicknameLocalJson[songId].nicknamesIgnore;
      if (hadIgnored && hadIgnored.length > 0) {
        if (nicknameLocalJson[songId].nicknamesIgnore.some(item => item === nickname)){
          return "未找到该别名";
        }
        nicknameLocalJson[songId].nicknamesIgnore.push(nickname);
      }else{
        nicknameLocalJson[songId].nicknamesIgnore = [nickname];
      }
    }
    await writeJSON(JSON.stringify(nicknameLocalJson), nicknameLocalPath);
    return "别名删除成功";
  }else{
    return "未找到该别名";
  }
}

/**
 * 初始化，根据配置获取对应json
 * @param cfg 配置表单
 */
async function initJson(cfg: Config) {
  let songInfoJson: JSON;
  let bandIdJson: JSON;
  //json处理操作
  if (cfg.alwaysUseLocalJson) {
    try {
      songInfoJson = require(`${dataUrl}/songInfo.json`);
      bandIdJson = require(`${dataUrl}/bandId.json`);
    } catch (e) {
      console.error("读取本地json文件异常，将从远程仓库获取");
      console.error(e);
      try {
        songInfoJson = await fetchJson(cfg.songInfoUrl);
        bandIdJson = await fetchJson(cfg.bandIdUrl);
        //console.log('读取json文件完成')
        if (cfg.saveJson) {
          writeJSON(JSON.stringify(songInfoJson), `${dataUrl}/songInfo.json`);
          writeJSON(JSON.stringify(bandIdJson), `${dataUrl}/bandId.json`);
        }
      } catch (e) {
        console.error("远程Json文件获取异常");
        console.error(e);
      }

    }
  } else {
    try {
      //获取json
      const songInfoJsonPromise = await fetchJson(cfg.songInfoUrl);
      const bandIdJsonPromise = await fetchJson(cfg.bandIdUrl);

      [songInfoJson, bandIdJson] = await Promise.all([songInfoJsonPromise, bandIdJsonPromise]);
      //console.log('读取json文件完成')
      //保存副本到本地
      //程序运行到此处已经成功读取了json
      // 写入文件(函数内已经做了异常处理)
      if (cfg.saveJson) {
        writeJSON(JSON.stringify(songInfoJson), `${dataUrl}/songInfo.json`);
        writeJSON(JSON.stringify(bandIdJson), `${dataUrl}/bandId.json`);
      }
    } catch (e) {
      console.error("Json文件获取异常，将使用本地json");
      console.error(e);
      try {
        songInfoJson = require(`${dataUrl}/songInfo.json`);
        bandIdJson = require(`${dataUrl}/bandId.json`);
      } catch (e) {
        console.error("读取本地json文件异常");
        console.error(e);
        return;
      }
    }
  }
  return [songInfoJson, bandIdJson];
}

/**
 * 转换字符串，把其中的占位符更换为对应的值
 * @param song song对象
 * @param cfg 配置表单
 */
function turnSongFileUrl(song: Song, cfg: Config): string {
  return cfg.songFileUrl         //转换占位符
    .replace(/\{songId}/g, padToThreeDigits(song.songId))
    .replace(/\{songName}/g, song.songName)
    .replace(/\{bandId}/g, song.bandId)
    .replace(/\{bandName}/g, song.bandName);
}

/**
 * 检测xlsx文件是否存在
 * @param ctx
 * @param cfg
 */
async function detectedXlsx(ctx: Context, cfg: Config) {
  //检查nickname_song.xlsx
  const fs = require('fs');
  if (!fs.existsSync(`${dataUrl}/nickname_song.xlsx`)) {
    console.error("未找到nickname_song.xlsx文件")
  }
}

/**
 * 忽略全半角
 * @param str
 */
function betterDistinguish(str: string) {
  str += '';
  str = str.toLowerCase().replace(/\s+/g, '');
  const reflectMap: Map<string, string> = new Map([
    ['，', ','],
    ['：', ':'],
    ['？', '?'],
    ['《', '<'],
    ['》', '>'],
    ['‘', "'"],
    ['’', "'"],
    ['“', '"'],
    ['”', '"'],
    ['；', ';'],
    ['！', '!'],
    ['、', ','],
    ['。', '.'],
    ['（', '('],
    ['）', ')'],
    ['【', '['],
    ['】', ']'],
    ['―', ''],
    ['', ''],
    ['', ''],
  ]);

  reflectMap.forEach((value: string, key: string) => {
    //console.log(`key: ${key} ; value: ${value}`);
    const regex = new RegExp(`${key}`, 'g');
    //console.log(regex);
    str = str.replace(regex, value);
  })
  //console.log(str)
  return str;
}

function betterCompare(str1: string, str2:string): boolean {
  return betterDistinguish(str1) == betterDistinguish(str2);
}
