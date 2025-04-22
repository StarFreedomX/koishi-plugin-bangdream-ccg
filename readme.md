# koishi-plugin-bangdream-ccg

[![npm](https://img.shields.io/npm/v/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/l/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg) [![npm](https://img.shields.io/npm/dt/koishi-plugin-bangdream-ccg?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bangdream-ccg)

*邦多利猜猜歌*

## 注意事项

* 本项目需提前安装并配置FFmpeg
* 如果遇到assets中的nickname_song.xlsx丢失需要自行到本仓库下载

## List To Do

* [X]  隔离用户别名列表和库中别名，使得用户更新时将先前添加的别名保留
* [X]  读取xlsx和json的别名采用异步操作，加快速率
* [ ]  可以选择本地目录作为歌曲来源
* [ ]  重新裁剪音频功能
* [ ]  ccg后接参数可以筛选范围
* [ ]  可选是否忽略标点符号
* [ ]  增加歌曲保存功能
* [ ]  自动下载nickname_song.xlsx

## 更新日志
| 版本      | 更新日志                |
|---------|---------------------|
| `1.1.0` | 加入歌曲封面选项            |
| `1.1.1` | 修复答案显示的换行问题         |
| `1.1.2` | 更好的开发环境的判断          |
| `1.1.3` | 加入重试和切换服务器逻辑        |
| `1.1.4` | 修复歌曲273返回报错的bug     |
| `1.1.5` | 修复歌曲13、40封面路径异常的bug |
| `1.1.6` | 修复两首国服原创曲的歌曲信息报错问题  |


## Thanks

本项目开发时参考以下项目，在此致谢


| 项目                                | 传送门                                  |
|-----------------------------------|--------------------------------------|
| koishi-plugin-waifu               | [🔗项目地址](https://bestdori.com/)      |
| koishi-plugin-tsugu-bangdream-bot | [🔗项目地址](https://bandoristation.com) |
| koishi-plugin-BanGDreamCardGuess  | [🔗项目地址](https://bandoristation.com) |

本项目的默认歌曲数据和乐队数据均来源于[🔗bestdori](https://bestdori.com/)

歌曲别名数据来源于Tsugu机器人仓库[🔗nickname_song.xlsx](https://github.com/Yamamoto-2/tsugu-bangdream-bot/raw/refs/heads/master/backend/config/nickname_song.xlsx)
