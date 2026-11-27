# 第三方依赖与许可

qianqu 使用以下开源依赖。完整许可证文本以各依赖包内附带的 `LICENSE` 为准。

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 桌面运行时 | MIT |
| [music-metadata](https://github.com/Borewit/music-metadata) | 本地音频元数据与封面 | MIT |
| [@meting/core](https://github.com/metowolf/Meting) | 网易云 / QQ / 酷狗搜索、播放地址、歌单、歌词 | MIT |
| [iconv-lite](https://github.com/ashtuchkin/iconv-lite) | GBK 等歌词编码 | MIT |
| [@electron/packager](https://github.com/electron/packager) | Windows 打包（开发依赖） | BSD-2-Clause |

Electron 发行包中附带的 Chromium、Node.js 及其第三方组件许可证，见打包目录中的 `LICENSES.chromium.html` 和 `LICENSE`。

## 内容与平台

qianqu 不包含商业音乐、视频或歌词文件。Bilibili、网易云音乐、QQ 音乐、酷狗音乐的名称、接口和内容归各自平台及权利人所有。qianqu 只提供个人播放工具，不提供批量下载、去水印、绕过会员 / 地区限制或再分发功能。

## 应用图标插画

`assets/icon-art.jpg` 及由它生成的应用图标由项目作者提供，仅用于 qianqu 应用标识。图标插画不包含在 MIT 代码许可范围内；如果权利人对使用方式有异议，请通过 Issue 联系替换。

## 设计参考

- 全屏歌词舞台交互方向参考 [Folia](https://github.com/chthollyphile/folia-major)（AGPL-3.0），未复制其源代码。
- Bilibili 音乐源功能方向参考 [BiliMusic](https://github.com/HanversionOvO/BiliMusic)，按本项目结构独立实现。
- 歌词候选与手动换词思路参考 BiliMusic 与 [Lyricify Lyrics Helper](https://github.com/WXRIW/Lyricify-Lyrics-Helper)（Apache-2.0）。
- 界面设计原则参考 [Refactoring UI](https://www.refactoringui.com/) 与 [refactoring-ui-skill](https://github.com/edisonmbli/refactoring-ui-skill)。
