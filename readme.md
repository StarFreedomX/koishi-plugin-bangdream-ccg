# koishi-plugin-bangdream-ccg

[![npm](https://img.shields.io/npm/v/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/l/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/dt/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg)

*邦多利猜猜歌*

## 注意事项

* 本项目需提前安装并配置FFmpeg
* 目前只在单个群聊做过测试
* 如果遇到assets中的nickname_song.xlsx丢失需要自行到本仓库下载
* 不要随意删除cache的文件，如果由于文件未找到而报错，可以手动前往数据库或通过指令ccg.clear清除缓存

## List To Do

* [X]  增加别名删除功能
* [X]  指令清空数据库缓存
* [X]  指令描述、用法
* [X]  添加别名消息反馈
* [X]  id猜歌（可选，方便查曲后选择用）
* [X]  添加别名时查重
* [X]  查看歌曲别名
* [ ]  监听（指令猜歌太复杂了）
* [ ]  增加歌曲保存功能

## Thanks

本项目开发时参考以下项目，在此致谢


| 项目                                | 传送门                                  |
|-----------------------------------|--------------------------------------|
| koishi-plugin-waifu               | [🔗项目地址](https://bestdori.com/)      |
| koishi-plugin-tsugu-bangdream-bot | [🔗项目地址](https://bandoristation.com) |
| koishi-plugin-BanGDreamCardGuess  | [🔗项目地址](https://bandoristation.com) |

本项目的默认歌曲数据和乐队数据均来源于[🔗bestdori](https://bestdori.com/)

歌曲别名数据来源于Tsugu机器人仓库[🔗nickname_song.xlsx](https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx)
