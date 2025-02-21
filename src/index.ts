import {Context, Random, Schema, h, Time, Database, Universal} from 'koishi'
import {exec} from "child_process";
import * as XLSX from 'xlsx';
import * as songInfoJson from '../assets/songInfo.json';
import * as bandIdJson from '../assets/bandId.json';
import path from "path";
import {clearTimeout} from "node:timers";
import { } from '@koishijs/cache'
export const inject = ['cache']

declare module '@koishijs/cache' {
  interface Tables {
    [key: `bangdream_cck__${string}`]: Universal.GuildMember

  }
}
export const name = 'bangdream-ccg';

/**
 * 具体实现思路（参考kumo的cck）：
 * 初始化：
 *        从bestdori获取bandId.json、songInfo.json到同目录下
 *        从Tsugu仓库获取nickname_song.xlsx
 *        {
 *        执行一次随机挑选
 *        把挑选的结果记录在对象1中并存入缓存的key为"bangdream_ccg_{guildId}_01"的项中
 *        从bestdori下载歌曲
 *        生成文件temp.mp3
 *        }
 * 每次触发：
 *    start:
 *        判断是否已经开始
 *        如果已经开始，直接return
 *        如果未开始，那么执行下列步骤
 *        将对象1的属性复制到对象2中，并将对象2存入缓存的key为"bangdream_ccg_{guildId}_02"的项中
 *        发送temp.mp3
 *        修改isStarted为true
 *        监听回复(reply流程)
 *        同时
 *        {
 *        执行一次随机挑选
 *        把挑选的结果记录在对象1中并存入数据表key为{guildId}01的项中
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
 */
export const assetsUrl = `${__dirname}\\..\\assets`;
export const SONG_ID_KEYS = Object.keys(songInfoJson);

export interface Song {
  bandId: string;
  bandName: string;
  songId: string;
  songName: string;
  songLength: number;
  selectedSecond: number;
  answers: string[];
}

export const Song = {

}


export interface Config {
  cd: number;
  audioLength: number;
  songInfoUrl: string;
  bandIdUrl: string;
  nickname: boolean;
  nicknameUrl: string;
}

export const Config: Schema<Config> = Schema.object({
  cd: Schema.number().default(5).description("冷却时间，建议设置为大于5s，否则可能预下载失败"),
  audioLength: Schema.number().default(5).description("发送音频的长度"),
  songInfoUrl: Schema.string().default("https://bestdori.com/api/songs/all.7.json").description("歌曲信息地址，默认url来源于bestdori.com"),
  bandIdUrl: Schema.string().default("https://bestdori.com/api/bands/all.1.json").description("乐队信息地址，默认url来源于bestdori.com"),
  nickname: Schema.boolean().default(true).description("是否启用别名匹配"),
  nicknameUrl: Schema.string().default("").description("别名数据表来源，默认为Tsugu机器人仓库"),
})

export function apply(ctx: Context, cfg: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))

  ctx.command("ccg <option:string>")




  /*
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
 * 裁剪音频文件
 * @param input 输入url
 * @param output 输出url
 * @param startTime 起始时间字符串，可以是纯数字也可以00:00:05格式
 * @param endTime 结束时间字符串
 */
async function trimAudio(input: string, output: string, startTime: string, endTime: string) {
  const command = `ffmpeg -i ${input} -ss ${startTime} -to ${endTime} -c copy ${output} -y`;
  //console.log(command);
  await runCommand(command);
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
export async function readExcelFile(filePath: string): Promise<any[]> {
  // 读取Excel文件
  const workbook = XLSX.readFile(filePath);
  // 获取工作表的名字
  const sheetName = workbook.SheetNames[0];
  // 获取工作表
  const worksheet = workbook.Sheets[sheetName];
  // 将工作表转换为JSON并返回
  return XLSX.utils.sheet_to_json(worksheet);
}

