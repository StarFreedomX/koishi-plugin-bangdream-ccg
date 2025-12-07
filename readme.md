# koishi-plugin-bangdream-ccg

[![npm](https://img.shields.io/npm/v/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/l/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/dt/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg)

*邦多利猜猜歌*

## 注意事项

* 本项目需提前安装并配置[FFmpeg](https://ffmpeg.org/download.html)

## List To Do

* [X]  修改获取json部分代码，使得每次均读取本地json，定期(或加入冷却)更新远程json
* [ ]  修复上个缓存未更新完即开始ccg导致重复播放同一歌曲的问题
* [ ]  增加歌曲信息及音频保存至缓存功能
* [ ]  可以选择本地目录作为歌曲来源
* [ ]  重新裁剪音频功能
* [ ]  ccg后接参数可以筛选范围
* [ ]  可选是否忽略标点符号
* [ ]  自动下载nickname_song.xlsx
* [ ]  适配官方bot

## 更新日志


| 版本      | 更新日志                                     |
|---------|------------------------------------------|
| `1.1.0` | feat: 加入歌曲封面选项                           |
| `1.2.0` | feat: 答案正确时引用消息                          |
| `1.3.0` | fix: 修改ccg.answer执行时利用共享上下文实现取消监听        |
| `1.5.0` | feat: 更改JSON获取方式为定期刷新，提供刷新指令             |
| `1.5.1` | feat: 新增刷新间隔配置项                          |
| `1.5.3` | feat: 支持base64发送音频                       |
| `1.6.0` | feat: 资源初始化引入版本机制                        |
| `1.6.1` | feat: 更新歌曲别名数据                           |

## Thanks

本项目开发时参考以下项目，在此致谢


| 项目                                | 传送门                                  |
|-----------------------------------|--------------------------------------|
| koishi-plugin-waifu               | [🔗项目地址](https://bestdori.com/)      |
| koishi-plugin-tsugu-bangdream-bot | [🔗项目地址](https://bandoristation.com) |
| koishi-plugin-BanGDreamCardGuess  | [🔗项目地址](https://bandoristation.com) |

本项目的默认歌曲数据和乐队数据均来源于[🔗bestdori](https://bestdori.com/)

歌曲别名数据来源于Tsugu机器人仓库[🔗nickname_song.xlsx](https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx)
