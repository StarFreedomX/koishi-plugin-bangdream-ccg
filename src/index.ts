import {Context, h, Random, Schema, sleep, Time} from 'koishi'
import {exec} from "child_process";
import * as XLSX from 'xlsx';
import {} from '@koishijs/cache'
import * as fs from 'fs'
import {json} from "node:stream/consumers";
//import * as songInfoJson from '../assets/songInfo.json';
//import * as bandIdJson from '../assets/bandId.json';
//import path from "path";
//import {clearTimeout} from "node:timers";

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
 *        从Tsugu仓库获取nickname_song.xlsx(只下载一次，后续全用本地的)
 *
 * 每次触发：
 *    start:
 *        判断是否已经开始
 *        如果已经开始，直接return
 *        如果未开始，那么执行下列步骤
 *        从bestdori获取bandId.json、songInfo.json
 *        将对象1的属性复制到对象2中，并将对象2存入缓存的表为"bangdream_ccg_{gid}"的key为run的项中
 *        发送temp.mp3
 *        修改isStarted为true
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
 *  更多需求：
 *      1.不区分大小写   +
 *      2.指令添加别名  +
 *      3.忽略空格      +
 *      4.忽略全半角     x
 *
 *
 * 具体实现流程：*是否运行中使用缓存2的isCompleted判断
 *      插件运行->收到ccg指令->是否运行中--否->检查是否存在nickname_song.xlsx--有->获取json->检查缓存01是否有歌曲--无->随机一首歌放到缓存02区
 *                            └-是->已经在运行中           └-无->报错                    └-有->01复制一份到02->发送缓存02的歌曲片段<-┘
 *                                                                                        随机一首歌放到01缓存<-┘
 *      插件运行->收到ccg [option]->是否运行中--是->option是否符合answer--是->发送成功消息，设置缓存2的isCompleted为true
 *                                  └-否->不在运行中      └-否->不回答
 *
 *      插件运行->收到ccg.stop->是否运行中--是->发送停止消息，设置isCompleted为true
 *                              └-否->不在运行中
 *
 *      插件运行->收到ccg.stop->是否运行中--是->发送答案，设置isCompleted为true
 *                              └-否->不在运行中
 *
 *      插件运行->收到ccg.add->执行addNickname()，输出返回值添加成功/失败
 *
 */
export const name = 'bangdream-ccg';

export const usage = `
<h1>邦多利猜猜歌</h1>
<h2>歌曲数据来源于bestdori.com</h2>
<h2>Notice</h2>
<h4>开发中，有问题可以到GitHub提issue<del>(114514年后才会解决)</del></h4>
<h2>Thanks</h2>
<h4>开发过程中参考插件koishi-plugin-cck(作者kumoSleeping)</h4>
`

export const assetsUrl = `${__dirname}\\..\\assets`;

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
}

export interface limitInfo {

}

export interface nicknameExcelElement {
  Id: number;
  Title: string;
  Nickname: string;
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
  alwaysUseLocalJson: boolean;
  songInfoUrl: string;
  bandIdUrl: string;
  songFileUrl: string
  nickname: boolean;
  //nicknameUrl: string;
  //saveSongFile: boolean;
  defaultSongNameServer: number;

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
    idGuess: Schema.boolean().default(true).description("是否允许使用歌曲id猜歌"),
    nickname: Schema.boolean().default(true).description("是否启用别名匹配"),
    //saveSongFile: Schema.boolean().default(false).description("是否保存歌曲到本地（会占用一定的存储空间，但可以使已下载歌曲无需再次下载，执行速度更快）"),
    saveJson: Schema.boolean().default(true).description("是否保存json至本地（这使得由于网络波动等原因获取json文件失败时，使用本地json）"),
    alwaysUseLocalJson: Schema.boolean().default(false).description("是否优先使用本地json"),
  }).description('基础配置'),
  Schema.object({
    songInfoUrl: Schema.string().default("https://bestdori.com/api/songs/all.7.json").description("歌曲信息地址，默认url来源于bestdori.com"),
    bandIdUrl: Schema.string().default("https://bestdori.com/api/bands/all.1.json").description("乐队信息地址，默认url来源于bestdori.com"),
    songFileUrl: Schema.string().default("https://bestdori.com/assets/jp/sound/bgm{songId}_rip/bgm{songId}.mp3").description("歌曲下载地址，花括号内的songId对应实际的songId被替换"),
    //nicknameUrl: Schema.string().default("https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx").description("别名数据表来源，默认为Tsugu机器人仓库"),
  }).description('高级配置'),
])


export function apply(ctx: Context, cfg: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))


  /*async function init() {
    //初始化json
    /*const songInfoJson: JSON = await ctx.http.get(cfg.songInfoUrl);
    const bandIdJson: JSON = await ctx.http.get(cfg.bandIdUrl);
    fs.writeFileSync(__dirname + "/songInfo.json", JSON.stringify(songInfoJson, null, 2));
    fs.writeFileSync(__dirname + "/bandId.json", JSON.stringify(bandIdJson, null, 2));*/
  /*const nicknamePath: string = __dirname + "/nickname_song.xlsx"
  try {
    if (fs.existsSync(nicknamePath)) {
      console.log(`文件已存在，跳过下载: ${nicknamePath}`);
      return;
    } else {
      console.log("待下载：" + cfg.nicknameUrl)
      const response = await ctx.http.get(cfg.nicknameUrl);
      console.log("download success");
      // 将文件内容写入本地
      fs.writeFileSync(nicknamePath, Buffer.from(response, 'binary'));
      console.log(`文件已保存到: ${nicknamePath}`);
    }
  } catch (error) {
    console.error('下载文件时出错:', error.message);
  }

}*/

  ctx.command("ccg [option:text]")
    .alias("猜猜歌")
    .usage('发送ccg开始猜歌游戏，发送ccg [option:text]参与猜歌')
    .example('ccg : 开始猜歌游戏')
    .example('ccg Fire Bird : 猜歌曲是"Fire Bird"')
    .example('ccg 秋妈妈 : 猜歌曲是"秋妈妈"')
    .action(async ({session}, option) => {
      if (!session) {
        return;
      }

      //没有带参数，进入启动流程
      if (!option) {
        console.log('start01');
        detectedXlsx(ctx, cfg);
        console.log('start02');
        //start
        //获取是否在进行中
        let runSongInfo = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
        if (!runSongInfo || runSongInfo.isComplete) {//不在进行中有两种情况，一个是数据库条目不存在，另一个是数据库条目的song对象被标记为已完成。
          //进入启动流程

          //判断缓存1是否有歌曲，如果没有，那么先生成在发送，存入缓存2；如果有，直接发送，并将缓存1的内容转移到缓存2
          let readySong = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'pre');
          console.log('start03');
          session.send("语音发送中...")
          const JSONs = await initJson(cfg);  //初始化json
          console.log('start04');
          if (!readySong) { //这里没有获取到，那么需要生成一个
            const song = await handleSong(JSONs, ctx, cfg, session.gid.replace(/:/g,'_'));
            //存入缓存2
             ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', song, Time.day);
            console.log("已存入缓存2:");
            console.log(song);
          } else {
            //读取缓存1的内容
            const preSong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'pre');
            //存入缓存2
             ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', preSong, Time.day);
            console.log("已存入缓存2:");
            console.log(preSong);
          }
          console.log('start05');
          //发送语音消息
          const audio = h.audio(`${assetsUrl}\\cache\\temp_${session.gid.replace(':','_')}.mp3`)
          console.log('start06');

          await session.send(audio);
          console.log('start07');
          //这里已经发送完毕，缓存2已经准备好了题目的信息
          //接下来需要处理的是缓存1，提前准备好下一次的题目
          const preSong = await handleSong(JSONs, ctx, cfg, session.gid.replace(/:/g,'_'));
          await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'pre', preSong, Time.day);
          console.log("已存入缓存1:");
          console.log(preSong);
        } else {
          //已经开始，return结束
          return session.text('.alreadyRunning');
        }
      }else{
        //带了参数，是猜歌的
        //先判断是否已经结束猜歌
        let readySong: Song  = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
        if (!readySong || readySong.isComplete) {
          console.log("还没开始")
          return;
        }
        //这里是正式猜歌流程
        //答案正确
        if (readySong.answers.some(alias => betterDistinguish(alias) == betterDistinguish(option))){
          readySong.isComplete = true;
          ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', readySong, Time.day);
          return session.text(".answer",{
            selectedKey: readySong.songId,
            selectedBandName: readySong.bandName,
            selectedSongName: readySong.songName,
            answers: readySong.answers.toString(),
            selectedSecond: readySong.selectedSecond,
          })
        }
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
      readySong.isComplete = true;
      await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run',readySong, Time.day);
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
      readySong.isComplete = true;
      await ctx.cache.set(`bangdream_ccg_${session.gid}`, 'run', readySong, Time.day);
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
        return session.text(".songNotFound",{songId: songId});
      }
      return await addNickname(songId, songInfo.songName, nickname.replace(/,/g,'，'));//这里由于半角逗号是分隔符，所以不能直接存入半角逗号，应该存入全角逗号（仍能）匹配
    });

  ctx.command("ccg.del <songId:number> <nickname:text>")
    .usage('为歌曲删除别名')
    .example('ccg del 2 sb : 为id为2的歌曲删除别名"sb"')
    .userFields(['authority'])
    .action(async ({session}, songId, nickname) => {
      if ((!songId) || (!nickname)) {
        return session.text(".delOptionErr");
      }
      const JSONs: JSON[] = await initJson(cfg)
      const songInfo: Song = await getSongInfoById(`${songId}`, JSONs[0], JSONs[1], cfg);
      if (!songInfo) {
        return session.text(".songNotFound",{songId: songId});
      }
      return await delNickName(songId, nickname);
    })

  ctx.command("ccg.tips")
    .usage('获取当前游戏提示')
    .action(async ({session}) => {
      //判断缓存2是否有歌曲，以及是否已经结束
      let readySong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
      if (!readySong || readySong.isComplete) {
        return session.text(".notRunning");
      }
      const runningSong: Song = await ctx.cache.get(`bangdream_ccg_${session.gid}`, 'run');
      return session.text(".tips",{bandName: runningSong.bandName});
    })

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
      const answers = (await getNicknames(songId)).toString()
      if (!answers) {
        return session.text(".songNotFound",{songId: songId});
      }
      //console.log(await getNicknames(songId));
      return session.text(".returnList", {
        songId: songId,
        answers: (await getNicknames(songId)).toString(),
      })
    })

  //测试
  //ctx.command("test [option:text]")
    //.action(async ({session}, option) => {
      //await init();
      //测试readExcelFile读取后的json内容
      //console.log(await readExcelFile("E:\\MyKoishiCode\\bangdream-ccg\\external\\bangdream-ccg\\assets\\nickname_song.xlsx"))
      //console.log(await readExcelFile(assetsUrl + "\\nickname_song.xlsx"))
      //await addNickname(6 ,"114514","1145141919810");
      /*await ctx.cache.set(`bangdream_ccg_${session.gid}`, "pre", {
        bandId: "1",
        bandName: "114514",
        songId: "45",
        songName: "4444",
        songLength: "120",
        selectedSecond: "20",
        answers: ["1","4","5"],
        isComplete: false,
      }, Time.day);*/
      //const songInfo = await ctx.cache.get(`bangdream_ccg_${session.gid}`,"run");
      //console.log(songInfo);
      //console.log(await fetchJson(cfg.bandIdUrl));
      //console.log(cfg.serverLimit);
      //console.log((cfg.serverLimit>>0) % 2);
      //console.log((cfg.serverLimit>>1) % 2);
      //console.log((cfg.serverLimit>>2) % 2);
      //console.log((cfg.serverLimit>>3) % 2);
      //console.log((cfg.serverLimit>>4) % 2);
      /*
      const songInfoJson = await fetchJson(cfg.songInfoUrl);
      const bandIdJson = await fetchJson(cfg.bandIdUrl);
      console.log(await getSongInfoAndGenerate('1', songInfoJson, bandIdJson, cfg));
       */
      /*const JSONs = await initJson(cfg);  //初始化json
      const song = await getRandomSong(JSONs[0], JSONs[1], cfg);  //随机获取一首歌
      const songFileUrl = turnSongFileUrl(song, cfg);   //转换url
      await fetchFileAndSave(songFileUrl, `${assetsUrl}\\cache\\[full]temp.mp3`, ctx)
      await trimAudio(
        `${assetsUrl}\\cache\\[full]temp.mp3`,
        `${assetsUrl}\\cache\\temp.mp3`,
        `${song.selectedSecond}`,
        `${song.selectedSecond + cfg.audioLength}`)
      console.log(songFileUrl)
      console.log(song);*/
      //console.log(session)
      //console.log(option);
      //return betterDistinguish(option);
      /*const map = new Map([
        ['key1','value1'],
        ['key2','value2'],
      ])
      map.forEach((key) => {})*/
      //return await delNickName(1,'114514')
      //const a = ['a','b'];
      //const b = [];
      //const c = a.concat(b);
      //console.log(a);
      //console.log(b);
      //console.log(c);
    //});


  /*
  弃用的实现方法——需要手动下载歌曲文件
  let isStarted: boolean = false;
  let answers : string[] = [];
  let selectedBandName : string = '';
  let selectedKey: string;
  let selectedSongName : string;
  let selectedSecond: number
  // write your plugin here


  ctx.command('猜猜歌 [option:string]')
    .alias('ccg')
    .action(async ({session}, option) => {
      if (!option) {
        if (isStarted) return session.text("已经开始了哦");
        isStarted = true;

        do {
          selectedKey = Random.pick(SONG_ID_KEYS);
        } while (selectedKey < "1000");
        let selectedSong = songInfoJson[selectedKey];
        console.log(selectedKey);
        //console.log(selectedSong);
        selectedBandName = bandIdJson[selectedSong["bandId"]]["bandName"][0];
        selectedSongName = selectedSong["musicTitle"][0];
        let selectedSongLength: number = selectedSong["length"];
        selectedSecond = Random.int(0, Math.floor(selectedSongLength) - 5);
        const songNickname = await readExcelFile(`${assetsUrl}\\nickname_song.xlsx`);
        answers = [selectedSongName];
        let nicknames = songNickname.find(item => item.Id == selectedKey);
        if (nicknames) nicknames = nicknames.Nickname;
        console.log(answers);
        console.log(nicknames);
        if (nicknames) answers = answers.concat(nicknames.split(','));

        console.log(answers);

        await trimAudio(`${assetsUrl}\\songs\\bgm${padToThreeDigits(selectedKey)}.mp3`,
          `${assetsUrl}\\cache\\temp.mp3`,
          `${selectedSecond}`,
          `${selectedSecond + cfg.audioLength}`);
        await session.send(h.audio(`${assetsUrl}\\cache\\temp.mp3`));
      }
        const dispose = ctx.on('message', async (session) => {
          // 检查是否在当前群组中
          if (session.guildId !== session.guildId) return;
          if (!isStarted) return;
          //console.log("receive");
          // 检查回复是否正确
          if (session.content == 'ccg stop') {
            dispose();
            isStarted = false;
            await session.send("已停止监听")
            return;
          }
          if (session.content == 'ccg answer') {
            dispose();
            isStarted = false;
            await session.send(`好吧，那么答案如下：
歌曲id:${selectedKey}
乐队：${selectedBandName}
歌曲名:${selectedSongName}
关键词:${answers}
截取时间点${selectedSecond}s`);

          }
          if (answers.some(alias => alias == session.content)) {
            dispose(); // 取消监听
            isStarted = false;
            await session.send(`${h.quote(session.messageId)} 答案正确！
歌曲id:${selectedKey}
乐队：${selectedBandName}
歌曲名:${selectedSongName}
关键词:${answers}`);

          }
        });



    })*/


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
  console.log(selectedKey);
  //console.log(selectedSong);
  //乐队名
  const selectedBandName = bandIdJson[selectedSong["bandId"]]["bandName"][0];
  //歌曲名
  const selectedSongName = selectedSong["musicTitle"][cfg.defaultSongNameServer];
  const selectedSongLength: number = selectedSong["length"];
  let selectedSecond = Random.int(0, Math.floor(selectedSongLength) - cfg.audioLength);
  let answers = [selectedSongName];
  if(cfg.idGuess){
    answers = answers.concat(selectedKey);
  }

  answers = answers.concat(await getNicknames(Number(selectedKey)));

  const songInfo: Song = {
    bandId: selectedSong["bandId"].toString(),
    bandName: selectedBandName,
    songId: selectedKey,
    songName: selectedSongName,
    songLength: selectedSongLength,
    selectedSecond: selectedSecond,
    answers: answers,
    isComplete: false,
  };
  console.log(answers);
  console.log(selectedKey);
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
  try {
    // 发起网络请求并等待响应
    const response = await fetch(url);

    // 检查响应状态
    if (!response.ok) {
      throw new Error(`HTTP error! Fetch ${url} Failed, status: ${response.status}`);
    }

    // 解析 JSON 数据并返回
    return await response.json();
  } catch (error) {
    // 处理错误情况
    throw new Error(`Fetching and parsing JSON error:\n${error}`);
  }
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
  console.log(localPath);
  const dir = localPath.substring(0, localPath.lastIndexOf('\\'));
  console.log(dir);
  await fs.promises.mkdir(dir, { recursive: true });
  fs.writeFileSync(localPath, buffer);
  console.log('文件下载完成');

  //console.log('test02')
}

/**
 * 执行命令
 * @param command 要执行的命令
 */
async function runCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command error: ${error}`);
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
  fs.writeFile(path, jsonString, (err) => {
    if (err) {
      console.error(`Error writing JSON to ${path}`, err);
    } else {
      console.log('JSON data is written to file');
    }
  });
}

/**
 * 裁剪音频文件
 * @param input 输入url
 * @param output 输出url
 * @param startTime 起始时间字符串，可以是纯数字也可以00:00:05格式
 * @param endTime 结束时间字符串
 */
async function trimAudio(input: string, output: string, startTime: string, endTime: string) {
  const command = `ffmpeg -i ${input} -ss ${startTime} -to ${endTime} -acodec pcm_s16le -c copy ${output} -y`;
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
  await fetchFileAndSave(songFileUrl, `${assetsUrl}\\cache\\[full]temp_${gid}.mp3`, ctx);
  //裁切音频
  await trimAudio(
    `${assetsUrl}\\cache\\[full]temp_${gid}.mp3`,
    `${assetsUrl}\\cache\\temp_${gid}.mp3`,
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
  const output: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);
  return output;
}

/**
 * 为歌曲添加别名
 * @param songId 歌曲id
 * @param title 歌曲名称
 * @param nickname 要添加的别名
 */
async function addNickname(songId: number, title: string, nickname: string) {
  // 读取Excel文件
  const workbook = XLSX.readFile(assetsUrl + '\\nickname_song.xlsx');
  // 获取第一个工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  const nicknameJson: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);

  //读取excel
  //let nicknameJson = await readExcelFile(assetsUrl + "/nickname_song.xlsx");

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
    }else{
      appendSong.Nickname = nickname;
    }
    console.log(appendSong);
  } else {
    const index = nicknameJson.findIndex(item => item.Id > songId);

    let appending: nicknameExcelElement = {
      Id: songId,
      Title: title,
      Nickname: nickname,
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
  newWorksheet['!cols'].push({wch: 10}, {wch: 50}, {wch: 150});
  //右对齐
  //newWorksheet['!cols'][0] = { wch: 10, align: { horizontal: 'right' } };
  console.log(newWorksheet);
  XLSX.writeFile(workbook, assetsUrl + "\\nickname_song.xlsx")
  return '别名添加成功';
  /*
    // 读取 Excel 文件
    const workbook = XLSX.readFile('example.xlsx');
    const sheetName = workbook.SheetNames[0]; // 获取第一个工作表的名称
    const worksheet = workbook.Sheets[sheetName];

  // 将工作表转换为 JSON 格式
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // 找到标题行，确定列索引
    let idColIndex, titleColIndex, nicknameColIndex;
    const headerRow = data[0];
    headerRow.forEach((header, index) => {
      if (header === 'id') idColIndex = index;
      if (header === 'Title') titleColIndex = index;
      if (header === 'Nickname') nicknameColIndex = index;
    });

  // 检查是否找到所有必要的列
    if (idColIndex === undefined || titleColIndex === undefined || nicknameColIndex === undefined) {
      throw new Error('未找到必要的列（id, Title, Nickname）');
    }

  // 查找或创建对应的行
    let found = false;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const currentId = row[idColIndex];
      if (currentId === songId) {
        // 找到对应的行，追加 Nickname
        let currentNickname = row[nicknameColIndex] || '';
        if (currentNickname) {
          currentNickname += `,${nickname}`;
        } else {
          currentNickname = nickname;
        }
        row[nicknameColIndex] = currentNickname;
        found = true;
        break;
      }
    }

  // 如果未找到对应的行，创建新行
    if (!found) {
      const newRow = Array(headerRow.length).fill(''); // 创建与标题行相同长度的空行
      newRow[idColIndex] = songId;
      newRow[titleColIndex] = title;
      newRow[nicknameColIndex] = nickname;
      data.push(newRow);
    }

  // 将修改后的数据写回工作表
    const newWorksheet = XLSX.utils.json_to_sheet(data, { skipHeader: true });
    workbook.Sheets[sheetName] = newWorksheet;

  // 保存文件
    XLSX.writeFile(workbook, 'example_modified.xlsx');
    console.log('文件已保存');*/
}

async function getNicknames(songId: number) {
  const songNickname = await readExcelFile(`${assetsUrl}\\nickname_song.xlsx`);
  let answers: string[] = [];
  let nicknamesExcelItem = songNickname.find(item => item.Id == Number(songId));


  if (nicknamesExcelItem) {     //有对应Id的行
    //获取对应行的Nickname，可能有也可能是undefined
    const nicknames = nicknamesExcelItem.Nickname;
    //检测是否已经存在nicknames
    if (nicknames) {
      answers = nicknames.split(',');
    }
  }

  return answers;
}

/**
 * 删除别名
 * @param songId 歌曲Id
 * @param nickname 别名
 */
async function delNickName(songId: number, nickname: string) {
  // 读取Excel文件
  const workbook = XLSX.readFile(assetsUrl + '\\nickname_song.xlsx');
  // 获取第一个工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  const nicknameJson: nicknameExcelElement[] = XLSX.utils.sheet_to_json(worksheet);

  //读取excel
  //let nicknameJson = await readExcelFile(assetsUrl + "/nickname_song.xlsx");

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
  newWorksheet['!cols'].push({wch: 10}, {wch: 50}, {wch: 150});
  //右对齐
  //newWorksheet['!cols'][0] = { wch: 10, align: { horizontal: 'right' } };
  console.log(newWorksheet);
  XLSX.writeFile(workbook, assetsUrl + "\\nickname_song.xlsx")
  return '别名删除成功！';
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
      songInfoJson = require(assetsUrl + "\\songInfo.json");
      bandIdJson = require(assetsUrl + "\\bandId.json");
    } catch (e) {
      console.error("读取本地json文件异常，将从远程仓库获取");
      console.error(e);
      try {
        songInfoJson = await fetchJson(cfg.songInfoUrl);
        bandIdJson = await fetchJson(cfg.bandIdUrl);
        console.log('读取json文件完成')
        if (cfg.saveJson) {
          writeJSON(JSON.stringify(songInfoJson), assetsUrl + '\\songInfo.json');
          writeJSON(JSON.stringify(bandIdJson), assetsUrl + '\\bandId.json');
        }
      } catch (e) {
        console.error("远程Json文件获取异常");
        console.error(e);
      }

    }
  } else {
    try {
      //获取json
      songInfoJson = await fetchJson(cfg.songInfoUrl);
      bandIdJson = await fetchJson(cfg.bandIdUrl);
      console.log('读取json文件完成')
      //保存副本到本地
      //程序运行到此处已经成功读取了json
      // 写入文件(函数内已经做了异常处理)
      if (cfg.saveJson) {
        writeJSON(JSON.stringify(songInfoJson), assetsUrl + '\\songInfo.json');
        writeJSON(JSON.stringify(bandIdJson), assetsUrl + '\\bandId.json');
      }
    } catch (e) {
      console.error("Json文件获取异常，将使用本地json");
      console.error(e);
      try {
        songInfoJson = require(assetsUrl + "\\songInfo.json");
        bandIdJson = require(assetsUrl + "\\bandId.json");
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
async function detectedXlsx(ctx: Context, cfg:Config){
  //检查nickname_song.xlsx，如果没有，那么下载
  const fs = require('fs');
  if (!fs.existsSync(`${assetsUrl}\\nickname_song.xlsx`)) {
    console.error("未找到nickname_song.xlsx文件")
    return;
  }
}

/**
 * 忽略全半角
 * @param str
 */
function betterDistinguish(str: string) {
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
    console.log(`key: ${key} ; value: ${value}`);
    const regex = new RegExp(`${key}`,'g');
    console.log(regex);
    str = str.replace(regex, value);
  })
  console.log(str)
  return str;
}
