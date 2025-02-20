import {Context, Random, Schema, h, Time} from 'koishi'
import {exec} from "child_process";
import * as XLSX from 'xlsx';
import * as songInfoJson from '../assets/songInfo.json';
import * as bandIdJson from '../assets/bandId.json';
import path from "path";
import {clearTimeout} from "node:timers";

export const name = 'bangdream-ccg';


export const assetsUrl = `${__dirname}\\..\\assets`;
export const SONG_ID_KEYS = Object.keys(songInfoJson);


export interface Config {
  audioLength: number;
}

export const Config: Schema<Config> = Schema.object({
  audioLength: Schema.number().default(5).description("发送音频的长度"),
})

export function apply(ctx: Context, cfg: Config) {
  let isStarted: boolean = false;
  let answers : string[] = [];
  // write your plugin here
  ctx.command('猜猜歌 [option:string]')
    .alias('ccg')
    .action(async ({session}, option) => {
      if (!option) {
        if (isStarted) return session.text("已经开始了哦");
        isStarted = true;
        let selectedKey: string;
        do {
          selectedKey = Random.pick(SONG_ID_KEYS);
        } while (selectedKey < "1000");
        let selectedSong = songInfoJson[selectedKey];
        console.log(selectedKey);
        //console.log(selectedSong);
        let selectedBandName: string = bandIdJson[selectedSong["bandId"]]["bandName"][0];
        let selectedSongName: string = selectedSong["musicTitle"][0];
        let selectedSongLength: number = selectedSong["length"];
        let selectedSecond: number = Random.int(0, Math.floor(selectedSongLength) - 5);
        const songNickname = await readExcelFile(`${assetsUrl}\\nickname_song.xlsx`);
        answers = [selectedSongName];
        let nicknames = songNickname.find(item => item.Id == selectedKey);
        if (nicknames) answers.concat(nicknames.Nickname.split(','));

        console.log(answers);

        await trimAudio(`${assetsUrl}\\songs\\bgm${padToThreeDigits(selectedKey)}.mp3`,
          `${assetsUrl}\\cache\\temp.mp3`,
          `${selectedSecond}`,
          `${selectedSecond + cfg.audioLength}`);
        await session.send(h.audio(`${assetsUrl}\\cache\\temp.mp3`));
      }
      // 设置超时机制
      let timeoutId: NodeJS.Timeout;
      const dispose = ctx.on('message', async (session2) => {
        // 检查是否在当前群组中
        if (session2.guildId !== session2.guildId) return;
        //console.log("receive");
        // 检查回复是否正确
        if (session2.content == 'ccg stop'){
          clearTimeout(timeoutId);
          dispose();
          await session.send("已停止监听");
          isStarted=false;
        }
        if (session2.content == 'ccg answer'){
          clearTimeout(timeoutId);
          dispose();
          await session.send(`好吧，那么答案是${answers[0]}`);
          isStarted=false;
        }
        if (answers.some(alias => alias == session2.content)) {
          clearTimeout(timeoutId);
          dispose(); // 取消监听
          await session2.send(`恭喜 ${h.quote(session2.messageId)} 猜对了！答案是：${session2.content}`);
          isStarted = false;
        }
      });

      // 设置超时时间
      timeoutId = setTimeout(() => {
        dispose(); // 取消监听
        session.send(`时间到！答案是：${answers[0]}`);
      }, 5 * 60 * Time.second);

    })
}


async function runFFmpegCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`FFmpeg error: ${error}`);
        reject(error);
      } else {
        //console.log(`FFmpeg output: ${stdout}`);
        resolve();
      }
    });
  });
}

// 示例：裁剪音频文件
async function trimAudio(input: string, output: string, startTime: string, endTime: string) {
  const command = `ffmpeg -i ${input} -ss ${startTime} -to ${endTime} -c copy ${output} -y`;
  //console.log(command);
  await runFFmpegCommand(command);
}


function padToThreeDigits(numStr: string): string {
  return numStr.padStart(3, '0');
}

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

// 测试
//console.log(padToThreeDigits("1"));   // 输出：001
//console.log(padToThreeDigits("10"));  // 输出：010
//console.log(padToThreeDigits("100")); // 输出：100

// 使用示例
//trimAudio("input.mp3", "output.mp3", "00:00:00", "00:00:10").then(() => {
//  console.log("音频裁剪完成");
//});
//trimAudio(assetsUrl + 'songs\\bgm001.mp3', assetsUrl + 'cache\\temp.mp3', "00:00:00", "00:00:10").then(() => {
//  console.log("音频裁剪完成");
//});
