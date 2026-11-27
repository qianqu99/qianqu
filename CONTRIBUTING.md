# 贡献指南

谢谢愿意帮 qianqu 变得更好。这个项目是一个 Electron 桌面播放器，界面和逻辑都尽量保持原生、直接、可读。

## 开始之前

- 提交 Bug 前先搜索 [现有 Issue](https://github.com/qianqu99/qianqu/issues)。
- 大功能或架构调整建议先开 Issue 讨论，避免做完之后发现方向不一致。
- 不要提交账号 Cookie、Token、`node_modules/`、`dist-*/`、`work/` 或任何个人媒体文件。

## 开发环境

需要 Node.js 20+ 和 npm。

```bash
git clone https://github.com/qianqu99/qianqu.git
cd qianqu
npm install
npm start
```

Electron 下载慢时可以设置镜像：

```bash
export ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

## 提交前检查

```bash
npm run lint
npm run pack
```

如果改动涉及以下内容，请用打包后的 `qianqu.exe` 再验证一遍：

- 播放、暂停、进度、音量、倍速
- 本地音乐 / 视频导入
- B 站搜索、播放、收藏夹或合集导入
- 网易云 / QQ / 酷狗搜索、登录或歌单导入
- 自定义协议 `whale-cover://`、`whale-bili://`、`qianqu-music://`
- 窗口控制、全屏、视频影院、歌词舞台

## 代码约定

- 主进程逻辑放在 `main.js`，渲染进程逻辑放在 `src/app.js`。
- 网络请求、Cookie、文件系统访问只放在主进程；渲染进程通过 `preload.js` 暴露的最小 API 调用。
- 不要引入大型前端框架；界面使用原生 HTML / CSS / JavaScript。
- 保持现有命名和结构；新增网络源时优先复用 `MUSIC_PROVIDERS`、`getMeting`、`music:*` IPC 和 `ONLINE_PROVIDERS`。
- 不要绕过平台的版权、会员或地区限制；平台没有返回播放地址时，给出明确错误提示。

## 提交信息

建议使用简短、可读的提交信息：

```text
fix: 修复视频影院退出后窗口仍全屏
feat: 增加酷狗公开歌单导入
docs: 补充歌词偏移说明
```

## Pull Request

PR 描述里请写清楚：

1. 改了什么，为什么改。
2. 怎么验证的（命令、截图、日志或测试曲目）。
3. 是否有已知限制或未覆盖的平台。

如果改动影响界面，附上修改前后的截图会很有帮助。

## 歌词与版权

- 不要提交完整商业歌曲、受版权保护的音频或视频文件。
- 歌词匹配、字幕校验和手动换词只用于个人播放体验，不要用于批量抓取或再分发。
- 新增歌词来源时，请确认接口允许个人使用，并在 PR 中说明来源和限制。

## 行为准则

参与项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
