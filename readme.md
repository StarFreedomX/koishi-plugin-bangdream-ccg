# koishi-plugin-bangdream-ccg

[![npm](https://img.shields.io/npm/v/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/l/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/dt/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg)

*邦多利猜猜歌*

## 注意事项

* 本项目需提前安装并配置FFmpeg
* 目前只在单个群聊做过测试
* 如果遇到assets中的nickname_song.xlsx丢失需要自行到本仓库下载
* 不要随意删除cache的文件，如果由于文件未找到而报错，可以手动前往数据库或通过指令ccg.clear清除缓存

## List To Do

* [X]  监听
* [X]  cache文件检测到不存在后自动清除缓存后重新发送
* [ ]  可以选择本地目录作为歌曲来源
* [X]  隔离用户别名列表和库中别名，使得用户更新时将先前添加的别名保留
* [ ]  重新裁剪音频功能
* [ ]  ccg后接参数可以筛选范围
* [ ]  可选是否忽略标点符号
* [ ]  增加歌曲保存功能
* [ ]  自动下载nickname_song.xlsx

## Thanks

本项目开发时参考以下项目，在此致谢


| 项目                                | 传送门                                  |
|-----------------------------------|--------------------------------------|
| koishi-plugin-waifu               | [🔗项目地址](https://bestdori.com/)      |
| koishi-plugin-tsugu-bangdream-bot | [🔗项目地址](https://bandoristation.com) |
| koishi-plugin-BanGDreamCardGuess  | [🔗项目地址](https://bandoristation.com) |

本项目的默认歌曲数据和乐队数据均来源于[🔗bestdori](https://bestdori.com/)

歌曲别名数据来源于Tsugu机器人仓库[🔗nickname_song.xlsx](https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx)
