# 架构说明

qianqu 是一个 Electron 桌面应用，目标是让本地媒体、B 站歌单和多个在线音乐平台共用一套播放、队列、歌词和收藏逻辑。

## 进程模型

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron main process (main.js)                             │
│ 窗口 / 菜单 / 单实例锁 / 文件扫描 / 元数据 / 网络请求          │
│ 登录窗口 / Cookie 会话 / 自定义协议 / 本地状态文件            │
└───────────────▲─────────────────────────────────────────────┘
                │ contextBridge + ipcRenderer.invoke
┌───────────────┴─────────────────────────────────────────────┐
│ Renderer (src/index.html + src/app.js)                      │
│ 视图 / 播放器 / 队列 / 歌单 / 收藏 / 歌词 / 动效              │
└─────────────────────────────────────────────────────────────┘
```

渲染进程不直接访问 Node.js、文件系统或 Cookie。所有敏感操作通过 `preload.js` 暴露的最小 API 进入主进程。

## 主要模块

### `main.js`

- 应用生命周期、单实例锁、窗口状态记忆
- `library:*`：选择文件 / 文件夹、扫描、元数据、封面缓存
- `state:*`：读取和保存 `library.json`
- `lyrics:*`：本地 LRC、内嵌歌词、云歌词候选
- `bili:*`：B 站搜索、榜单、登录、收藏夹、合集、歌词
- `music:*`：网易云 / QQ / 酷狗登录、搜索、播放地址、歌单、歌词
- `qianqu-music://`、`whale-bili://`、`whale-cover://` 协议代理

### `preload.js`

使用 `contextBridge.exposeInMainWorld('whale', ...)` 暴露：

- 文件与状态 API
- 播放地址解析 API
- 登录状态 / 登录 / 退出 API
- 窗口控制 API
- 事件订阅 API

`WHALE_DEBUG=1` 时，渲染进程会额外暴露 `window.__whale` 用于本地 smoke 测试；发布版默认关闭。

### `src/app.js`

单文件渲染逻辑，主要分为：

1. **状态**：`state` 保存音乐库、歌单、收藏、最近播放、设置；`ui` 保存当前视图、队列、播放状态、歌词状态和网络请求状态。
2. **视图**：首页、音乐库、视频、最近播放、收藏、网络音乐、歌单页。
3. **播放器**：本地 `<audio>` / `<video>`、在线代理地址、队列、倍速、音量、Media Session。
4. **网络音乐**：B 站与 `ONLINE_PROVIDERS` 两套来源；在线曲目统一转成 remote track。
5. **歌词**：本地 LRC、多来源候选、B 站字幕校验、偏移、逐句对齐、9 种沉浸主题。
6. **窗口**：无边框标题栏、最小化 / 最大化 / 关闭、全屏、视频影院。

## 在线音乐数据流

```text
搜索
  Renderer: searchOnlineProvider(query)
    → preload: window.whale.musicSearch(provider, query)
      → main: music:search
        → @meting/core search(raw)
          → normalizeRawMetingTrack()
            → { id, providerId, urlId, lyricId, title, artist, duration, cover }
              → Renderer: ui.online.items

播放
  Renderer: playOnlineItem(id)
    → ensureOnlineStream(track)
      → preload: window.whale.musicResolve(provider, urlId)
        → main: @meting/core url(urlId, 999)
          → 生成 30 分钟短期 token
            → qianqu-music://stream/<token>
              → main: net.fetch(平台 URL, Cookie + Referer + Range)
                → Renderer <audio> 播放
```

### 在线曲目字段

```js
{
  id: "online-netease-2668397359",
  source: "netease",
  providerId: "netease",
  rawId: "2668397359",
  urlId: "2668397359",
  lyricId: "2668397359",
  title: "晴天",
  artist: "周杰伦",
  album: "叶惠美",
  duration: 269,
  cover: "https://...",
  pageUrl: "https://music.163.com/#/song?id=2668397359",
  needsStream: true
}
```

`urlId` 是平台播放地址需要的 ID；网易云是歌曲 ID，QQ 是 songmid，酷狗是 hash。`lyricId` 通常与 `urlId` 相同，但保留独立字段方便平台差异。

## 自定义协议

| 协议 | 用途 | 关键点 |
| --- | --- | --- |
| `whale-cover://` | 本地封面缓存 | 只允许 24 位 hex 文件名，拒绝路径穿越 |
| `whale-bili://` | B 站音频流 | 短 token、HTTPS、Referer、Range、CORS |
| `qianqu-music://` | 在线音乐流 | 短 token、平台 Cookie、HTTPS、Range、CORS |

代理不会把完整音频写入磁盘，只把上游响应流转发给 `<audio>`。

## 登录与会话

每个平台使用独立的 Electron `session.fromPartition()`：

```text
persist:bili-auth
persist:music-netease-auth
persist:music-qq-auth
persist:music-kugou-auth
```

登录窗口加载平台官方页面，主进程轮询登录 Cookie / 用户信息。退出登录只清理对应分区，不影响其他平台。

## 歌词管线

### 本地歌曲

```text
同名 .lrc → UTF-8 / GBK 解码 → 时间轴解析
内嵌歌词 → music-metadata
两者都没有 → 未同步歌词
```

### B 站歌曲

```text
云歌词搜索（标题 / UP 主 / 时长）
  + B 站字幕获取
    → 字幕时长覆盖检查
    → 字幕密度检查
    → 口播词检查
      → 字幕与云歌词文本重合度检查
        → 选择更可靠的时间轴
```

### 在线歌曲

- 网易云 / QQ：通过 `music:lyric` 获取平台歌词。
- 酷狗：通过 `@meting/core` 的歌词接口获取。
- 没有匹配时显示未匹配，不跨曲目复用歌词。

### 手动校准

- `lyricOffset` 按曲目保存。
- `[` / `]` 移动 0.5 秒，`{` / `}` 移动 0.1 秒，`\` 归零。
- 双击歌词行把当前句对齐到播放时间，整首歌词一起平移。
- 「换词」把选中的歌词文本和来源保存到曲目记录。

## 持久化

```text
%APPDATA%\qianqu\
├─ library.json             音乐库、歌单、收藏、最近播放、在线曲目
├─ bili-lyrics-cache.json   B 站歌词匹配缓存
├─ window.json              窗口位置 / 大小
├─ covers\                  本地封面缓存
└─ Partitions\              各平台登录会话
```

旧版 `%APPDATA%\鲸歌 WhaleSong` 在首次启动时迁移到 `%APPDATA%\qianqu`。

## 安全边界

- `contextIsolation: true`，渲染进程没有 Node.js 权限。
- 自定义协议只接受主进程生成的短期 token。
- 在线代理只允许 HTTPS 上游（B 站强制 HTTPS，在线音乐自动把 HTTP 升级为 HTTPS）。
- 渲染进程 CSP 限制脚本来源；网络请求只通过 preload API。
- 不在日志中输出 Cookie、Token 或密码。

## 测试方式

项目使用 Electron smoke scenario：

```bash
WHALE_DEBUG=1 WHALE_SMOKE_DIR=work/smoke \
  electron . --smoke --user-data-dir=work/profile
```

`WHALE_SMOKE_SCENARIO` 指向 JSON 场景文件，可执行 JavaScript、等待和截图。发布前至少覆盖：

- 本地音频 / 视频导入与播放
- B 站搜索与播放
- 网易云搜索、播放、歌单导入、歌词
- QQ / 酷狗搜索
- 视频影院进入 / 退出
- 顶部窗口按钮悬停
- 打包后的 exe 启动
