const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  net,
  protocol,
  session,
  Menu,
  nativeImage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const AUDIO_EXT = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.oga',
]);
const VIDEO_EXT = new Set([
  '.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv',
]);
const MEDIA_EXT = new Set([...AUDIO_EXT, ...VIDEO_EXT]);
const MAX_FILES = 5000;
const SKIP_DIRS = new Set([
  'node_modules', '$RECYCLE.BIN', 'System Volume Information', 'AppData',
  'Windows', 'Program Files', 'Program Files (x86)',
]);

const SMOKE = process.argv.includes('--smoke');
const smokeDir = process.env.WHALE_SMOKE_DIR || path.join(__dirname, '..', 'work', 'smoke');
if (SMOKE) {
  app.setPath('userData', path.join(smokeDir, 'profile'));
} else {
  app.setName('qianqu');
  const appDataRoot = app.getPath('appData');
  const legacyUserData = path.join(appDataRoot, '鲸歌 WhaleSong');
  const qianquUserData = path.join(appDataRoot, 'qianqu');
  const legacyLibrary = path.join(legacyUserData, 'library.json');
  const newLibrary = path.join(qianquUserData, 'library.json');
  try {
    fs.mkdirSync(qianquUserData, { recursive: true });
    if (!fs.existsSync(newLibrary) && fs.existsSync(legacyLibrary)) {
      for (const name of ['library.json', 'bili-lyrics-cache.json', 'window.json', 'Local State', 'Preferences', 'covers', 'Partitions']) {
        const source = path.join(legacyUserData, name);
        if (!fs.existsSync(source)) continue;
        fs.cpSync(source, path.join(qianquUserData, name), { recursive: true, force: true });
      }
    }
    app.setPath('userData', qianquUserData);
  } catch {
    app.setPath('userData', fs.existsSync(legacyLibrary) ? legacyUserData : qianquUserData);
  }
}

process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

let mainWindow = null;
let stateFile = '';
let coversDir = '';
let mmPromise = null;

const MUSIC_PROVIDERS = {
  netease: {
    id: 'netease',
    site: 'netease',
    name: '网易云',
    loginUrl: 'https://music.163.com/login?targetUrl=%2F',
    referer: 'https://music.163.com/',
  },
  qq: {
    id: 'qq',
    site: 'tencent',
    name: 'QQ音乐',
    loginUrl: 'https://y.qq.com/',
    referer: 'https://y.qq.com/',
  },
  kugou: {
    id: 'kugou',
    site: 'kugou',
    name: '酷狗音乐',
    loginUrl: 'https://passport.kugou.com/',
    referer: 'https://www.kugou.com/',
  },
};

const musicSessions = new Map();
const musicLoginWindows = new Map();
const musicStreamTargets = new Map();
let MetingCtorPromise = null;

async function getMetingCtor() {
  if (!MetingCtorPromise) {
    MetingCtorPromise = import('@meting/core').then((module) => module.default);
  }
  return MetingCtorPromise;
}

function getMusicProvider(providerId) {
  return MUSIC_PROVIDERS[String(providerId || '')] || null;
}

function getMusicSession(providerId) {
  if (!musicSessions.has(providerId)) {
    const authSession = session.fromPartition(`persist:music-${providerId}-auth`);
    authSession.setUserAgent(BILI_UA);
    musicSessions.set(providerId, authSession);
  }
  return musicSessions.get(providerId);
}

async function getMusicCookies(providerId) {
  const provider = getMusicProvider(providerId);
  if (!provider) return [];
  const cookies = await getMusicSession(providerId).cookies.get({});
  return cookies.filter((cookie) => {
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    if (providerId === 'netease') return domain.endsWith('music.163.com') || domain.endsWith('163.com');
    if (providerId === 'qq') return domain.endsWith('qq.com');
    return domain.endsWith('kugou.com');
  });
}

async function getMusicCookieHeader(providerId) {
  const cookies = await getMusicCookies(providerId);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function getMusicAuthUser(providerId) {
  const provider = getMusicProvider(providerId);
  if (!provider) return null;
  const cookies = await getMusicCookies(providerId);
  const map = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  if (providerId === 'netease') {
    if (!map.has('MUSIC_U') && !map.has('MUSIC_A')) return null;
    try {
      const response = await fetch('https://music.163.com/api/nuser/account/get', {
        headers: {
          Referer: provider.referer,
          'User-Agent': BILI_UA,
          Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
        },
      });
      const data = await response.json();
      if (data?.code !== 200 || !data?.account?.id) return null;
      return {
        id: String(data.account.id),
        name: data.profile?.nickname || `网易云 ${data.account.id}`,
        avatar: biliToHttps(data.profile?.avatarUrl || ''),
      };
    } catch {
      return null;
    }
  }
  if (providerId === 'qq') {
    const uin = map.get('uin') || map.get('p_uin') || map.get('wxuin');
    if (!uin || (!map.has('qqmusic_key') && !map.has('qm_keyst') && !map.has('p_skey'))) return null;
    return { id: String(uin).replace(/^o/, ''), name: `QQ ${String(uin).replace(/^o/, '')}`, avatar: '' };
  }
  if (providerId === 'kugou') {
    const id = map.get('KugooID') || map.get('KuGoo') || map.get('kg_mid');
    if (!id) return null;
    return { id: String(id), name: map.get('nickname') || '酷狗用户', avatar: '' };
  }
  return null;
}

async function getMeting(providerId) {
  const provider = getMusicProvider(providerId);
  if (!provider) throw new Error('不支持的平台');
  const Ctor = await getMetingCtor();
  const meting = new Ctor(provider.site);
  meting.format(true);
  const cookie = await getMusicCookieHeader(providerId);
  if (cookie) meting.cookie(cookie);
  return meting;
}

function neteaseCover(picId) {
  const value = String(picId || '');
  if (!value) return '';
  try {
    const key = '3go8&$8*3*3h0k(2)2';
    const chars = [...value].map((char, index) => (
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(index % key.length))
    ));
    const encrypted = crypto.createHash('md5')
      .update(chars.join(''), 'binary')
      .digest('base64')
      .replace(/\//g, '_')
      .replace(/\+/g, '-');
    return `https://p3.music.126.net/${encrypted}/${value}.jpg?param=300y300`;
  } catch {
    return '';
  }
}

function metingRawList(providerId, data, kind = 'search') {
  if (providerId === 'netease') {
    if (kind === 'playlist') return data?.playlist?.tracks || data?.result?.playlist?.tracks || [];
    return data?.result?.songs || data?.songs || [];
  }
  if (providerId === 'qq') {
    if (kind === 'playlist') return data?.data?.cdlist?.[0]?.songlist || data?.cdlist?.[0]?.songlist || [];
    return data?.data?.song?.list || data?.data?.list || [];
  }
  if (providerId === 'kugou') {
    return data?.data?.info || data?.info || [];
  }
  return [];
}

function neteasePicIdFromAlbum(album = {}) {
  if (album.pic_str) return String(album.pic_str);
  const match = String(album.picUrl || album.pic || '').match(/\/(\d+)\.(?:jpg|jpeg|png)/i);
  return match ? match[1] : '';
}

function normalizeRawMetingTrack(providerId, item) {
  if (!item) return null;
  const provider = getMusicProvider(providerId);
  if (!provider) return null;
  let rawId = '';
  let urlId = '';
  let lyricId = '';
  let title = '';
  let artists = [];
  let album = '';
  let duration = 0;
  let cover = '';
  let pageUrl = '';

  if (providerId === 'netease') {
    const albumInfo = item.al || item.album || {};
    artists = (item.ar || item.artists || []).map((artist) => artist?.name).filter(Boolean);
    rawId = String(item.id || '');
    urlId = rawId;
    lyricId = rawId;
    title = decodeBiliText(item.name || item.title || '');
    album = String(albumInfo.name || albumInfo.title || '');
    duration = Math.round((Number(item.dt || item.duration) || 0) / 1000);
    cover = neteaseCover(neteasePicIdFromAlbum(albumInfo));
    pageUrl = `https://music.163.com/#/song?id=${rawId}`;
  } else if (providerId === 'qq') {
    artists = (item.singer || item.singers || []).map((artist) => artist?.name).filter(Boolean);
    rawId = String(item.songmid || item.mid || item.file?.media_mid || '');
    urlId = rawId;
    lyricId = rawId;
    title = decodeBiliText(item.songname || item.name || item.title || '');
    album = String(item.albumname || item.album?.title || item.album?.name || '');
    duration = Number(item.interval || item.duration) || 0;
    const albumMid = item.albummid || item.album?.mid || item.album?.pmid || '';
    cover = albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '';
    pageUrl = `https://y.qq.com/n/ryqq/songDetail/${urlId}`;
  } else if (providerId === 'kugou') {
    const authors = Array.isArray(item.authors) ? item.authors.map((author) => author?.author_name) : [];
    artists = authors.length ? authors : String(item.singername || '').split(/[、/&]/);
    rawId = String(item.hash || item.audio_id || '');
    urlId = String(item.encode_album_audio_id || item.hash || '');
    lyricId = String(item.hash || '');
    title = decodeBiliText(item.songname || item.songName || item.filename || '');
    album = String(item.album_name || item.albumName || '');
    duration = Number(item.duration || item.timelen) || 0;
    const albumId = String(item.album_id || '');
    cover = albumId ? `https://imge.kugou.com/stdmusic/240/${albumId}.jpg` : '';
    pageUrl = `https://www.kugou.com/song/#hash=${rawId}`;
  }

  if (!rawId || !title) return null;
  return {
    id: `online-${providerId}-${rawId}`,
    source: providerId,
    sourceLabel: provider.name,
    kind: 'music',
    providerId,
    rawId,
    urlId,
    lyricId,
    title,
    artist: artists.filter(Boolean).join(' / '),
    album,
    duration: Math.max(0, Math.round(duration)),
    cover,
    pageUrl,
    license: `${provider.name} 网络音乐`,
    isRemote: true,
    needsStream: true,
  };
}

async function searchMusicProvider(providerId, query) {
  const meting = await getMeting(providerId);
  let raw;
  try {
    meting.format(false);
    raw = await meting.search(query, { limit: 30 });
  } finally {
    meting.format(true);
  }
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  const items = metingRawList(providerId, data, 'search');
  if (!Array.isArray(items)) throw new Error('平台没有返回搜索结果');
  return items.map((item) => normalizeRawMetingTrack(providerId, item)).filter(Boolean);
}

async function resolveMusicStream(providerId, urlId) {
  const provider = getMusicProvider(providerId);
  if (!provider) throw new Error('不支持的平台');
  const meting = await getMeting(providerId);
  const raw = await meting.url(urlId, 999);
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!data?.url) {
    throw new Error('当前账号没有这首歌的可用播放权限，或歌曲需要会员');
  }
  const streamUrl = String(data.url).replace(/^http:\/\//i, 'https://');
  const token = crypto.randomBytes(12).toString('hex');
  musicStreamTargets.set(token, {
    url: streamUrl,
    providerId,
    cookie: await getMusicCookieHeader(providerId),
    at: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
  return {
    ok: true,
    url: streamUrl,
    proxyUrl: `qianqu-music://stream/${token}`,
    br: Number(data.br) || 0,
    qualityLabel: data.br > 0 ? `${Math.round(data.br)}K` : '自动',
    size: Number(data.size) || 0,
  };
}

async function getMusicPlaylistTracks(providerId, playlistId) {
  const meting = await getMeting(providerId);
  let raw;
  try {
    meting.format(false);
    raw = await meting.playlist(playlistId);
  } finally {
    meting.format(true);
  }
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  const items = metingRawList(providerId, data, 'playlist');
  if (!Array.isArray(items) || !items.length) throw new Error('没有读到歌单内容');
  return items.map((item) => normalizeRawMetingTrack(providerId, item)).filter(Boolean);
}

function parsePlaylistId(providerId, input) {
  const text = String(input || '').trim();
  if (!text) return '';
  const patterns = providerId === 'netease'
    ? [/[?&]id=(\d+)/, /playlist\/(\d+)/]
    : providerId === 'qq'
      ? [/[?&]disstid=(\d+)/, /playlist\/(\d+)/, /^(\d+)$/]
      : [/specialid=(\d+)/, /special\/single\/(\d+)/, /^(\d+)$/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return text;
}

async function getNeteaseAccountPlaylists() {
  const cookie = await getMusicCookieHeader('netease');
  if (!cookie) return [];
  const headers = {
    Referer: MUSIC_PROVIDERS.netease.referer,
    'User-Agent': BILI_UA,
    Cookie: cookie,
  };
  const account = await (await fetch('https://music.163.com/api/nuser/account/get', { headers })).json();
  const uid = account?.account?.id;
  if (!uid) return [];
  const data = await (await fetch(`https://music.163.com/api/user/playlist?uid=${uid}&limit=1000&offset=0`, { headers })).json();
  return (data?.playlist || []).map((item) => ({
    id: String(item.id),
    title: String(item.name || '网易云歌单'),
    cover: biliToHttps(item.coverImgUrl || ''),
    trackCount: Number(item.trackCount) || 0,
    owner: item.creator?.nickname || '',
    provider: 'netease',
  }));
}

async function getQQAccountPlaylists() {
  const cookies = await getMusicCookies('qq');
  const map = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  const uin = String(map.get('uin') || map.get('p_uin') || '').replace(/^o/, '');
  if (!uin) return [];
  const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
  const url = `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=${encodeURIComponent(uin)}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
  const response = await fetch(url, {
    headers: { Referer: 'https://y.qq.com/', 'User-Agent': BILI_UA, Cookie: cookie },
  });
  const data = await response.json();
  const list = data?.data?.disslist || [];
  return list.map((item) => ({
    id: String(item.dissid || item.tid || ''),
    title: decodeBiliText(item.dissname || item.name || 'QQ音乐歌单'),
    cover: biliToHttps(item.logo || item.picurl || ''),
    trackCount: Number(item.songnum || item.song_count) || 0,
    owner: '',
    provider: 'qq',
  })).filter((item) => item.id);
}

async function getKugouAccountPlaylists() {
  const cookies = await getMusicCookies('kugou');
  const map = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  const uid = String(map.get('KugooID') || map.get('KuGoo') || map.get('userid') || '').trim();
  if (!uid) return [];
  const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
  const endpoints = [
    `https://mobiles.kugou.com/api/v3/user/playlist?uid=${encodeURIComponent(uid)}&page=1&pagesize=100&plat=0&version=8000`,
    `https://www.kugou.com/yy/index.php?r=user/playlist&uid=${encodeURIComponent(uid)}&page=1&pagesize=100`,
  ];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { Referer: MUSIC_PROVIDERS.kugou.referer, 'User-Agent': BILI_UA, Cookie: cookie },
      });
      const data = await response.json();
      const list = data?.data?.list || data?.data?.info || data?.info || [];
      if (!Array.isArray(list) || !list.length) continue;
      return list.map((item) => ({
        id: String(item.specialid || item.listid || item.global_collection_id || item.id || ''),
        title: decodeBiliText(item.name || item.listname || item.specialname || '酷狗歌单'),
        cover: biliToHttps(item.pic || item.imgurl || item.cover || ''),
        trackCount: Number(item.songcount || item.song_count || item.count) || 0,
        owner: decodeBiliText(item.nickname || item.username || ''),
        provider: 'kugou',
      })).filter((item) => item.id);
    } catch {
      // Try the next endpoint; account playlist APIs are not always available.
    }
  }
  return [];
}

async function getAccountPlaylists(providerId) {
  if (providerId === 'netease') return getNeteaseAccountPlaylists();
  if (providerId === 'qq') return getQQAccountPlaylists();
  if (providerId === 'kugou') return getKugouAccountPlaylists();
  return [];
}

async function openMusicLoginWindow(providerId) {
  const provider = getMusicProvider(providerId);
  if (!provider) throw new Error('不支持的平台');
  const existing = musicLoginWindows.get(providerId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: false, error: '登录窗口已经打开了' };
  }
  const authSession = getMusicSession(providerId);
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    parent,
    modal: Boolean(parent),
    show: false,
    title: `登录 ${provider.name} · qianqu`,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      session: authSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  musicLoginWindows.set(providerId, win);
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) return { action: 'allow' };
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (musicLoginWindows.get(providerId) === win) musicLoginWindows.delete(providerId);
  });
  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let timeoutTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (!win.isDestroyed()) win.close();
      resolve(result);
    };
    const check = async () => {
      if (settled) return;
      const user = await getMusicAuthUser(providerId);
      if (user) finish({ ok: true, user });
    };
    win.on('closed', () => {
      if (!settled) {
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        resolve({ ok: false, canceled: true });
      }
    });
    pollTimer = setInterval(check, 2500);
    timeoutTimer = setTimeout(() => finish({ ok: false, error: '登录超时，请重试' }), 5 * 60 * 1000);
    win.loadURL(provider.loginUrl);
    setTimeout(check, 1000);
  });
}

/* ------------------------------------------------------------------ */
/* Bilibili music source                                              */
/* ------------------------------------------------------------------ */

const BILI_API = 'https://api.bilibili.com';
const BILI_REFERER = 'https://www.bilibili.com';
const BILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BILI_AUTH_PARTITION = 'persist:bili-auth';
const BILI_QUALITY = {
  30216: '64K',
  30232: '132K',
  30280: '192K',
  30250: 'Dolby',
  30251: 'Hi-Res',
};
const NETEASE_API = 'https://music.163.com';
const NETEASE_UA = BILI_UA;
const LYRICS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const LYRICS_ENGINE_VERSION = 5;
const BILI_LYRIC_CALIBRATIONS = {
  BV1imWM61EFv: {
    scale: 0.9782,
    offset: 11.94,
    label: 'AI 宿命版实测校准',
  },
};
const LYRICS_GENERIC_TAGS = [
  '音乐', '歌曲', '音乐分享', '音乐推荐', '高音质', '无损', '无损音质', '耳机', '戴上耳机',
  '动态歌词', '歌词', '完整版', '现场', 'live', '翻唱', '原唱', '好听', '循环', '单曲循环',
  '4k', 'hi-res', 'hires', '1080p', '60帧', '古风', '流行', '摇滚', '民谣', '女声', '男声',
  '治愈', '伤感', '情感', 'bgm', '神曲', '宝藏', '小众', '华语', '欧美', '日语', '二次元',
  'dj', 'remix', '伴奏', '纯音乐', '纯音', '8d环绕', '音乐分享官', '听歌', '每日推荐',
  '电音', '节奏感', '合集', '记录', '生活记录', 'cover', 'mv', '歌曲推荐', '古风音乐',
  '古风歌曲', '古风翻唱', '华语mv', '经典歌曲', '经典老歌', '歌单', '专辑', '音质',
  '音乐mv', '音乐mv剪辑营', '宝藏音乐', '日推歌单', '电台歌单', '电台新星征集令',
  '音乐分享官7.0', '音乐分享官5.0', '新世代音乐人计划手搓赛道',
];
const biliCache = new Map();
const biliStreamTargets = new Map();
const biliLyricsCache = new Map();
let biliWbiKeys = null;
let biliAuthSession = null;
let biliLoginWindow = null;
let biliLyricsCacheFile = '';
let biliLyricsCacheLoaded = false;
let biliLyricsSaveTimer = null;
let neteaseNextRequestAt = 0;

function biliToHttps(value) {
  const text = String(value || '');
  if (text.startsWith('//')) return `https:${text}`;
  if (text.startsWith('http://')) return `https://${text.slice(7)}`;
  return text;
}

function decodeBiliText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBiliDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function biliCacheGet(key, ttl) {
  const entry = biliCache.get(key);
  if (!entry || Date.now() - entry.at > ttl) return null;
  return entry.value;
}

function biliCacheSet(key, value) {
  if (biliCache.size > 60) {
    const oldest = [...biliCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) biliCache.delete(oldest[0]);
  }
  biliCache.set(key, { at: Date.now(), value });
}

/* Bilibili lyrics: official subtitles first, then a public lyric catalog. */

function lyricCleanKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/\\|｜:：·•,，.。!！?？'"“”‘’「」『』【】\[\]()（）《》<>~～]+/g, '')
    .replace(/feat\.?.*$/i, '')
    .trim();
}

function lyricStripDecorations(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[#＃][^\s#＃]+/g, ' ')
    .replace(/“.*?[”」]/g, ' ')
    .replace(/「.*?」/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricIsGenericTag(value) {
  const key = lyricCleanKey(value);
  if (!key) return true;
  return LYRICS_GENERIC_TAGS.some((item) => {
    const generic = lyricCleanKey(item);
    return key === generic || (generic.length >= 4 && key.includes(generic));
  });
}

function lyricCleanArtist(value) {
  const text = lyricStripDecorations(value)
    .replace(/^(?:在|从|听|看|聊聊|分享|推荐|音乐人|歌手|带来|欣赏|品鉴|一首)+/g, '')
    .replace(/(?:的|版|完整版|无损|高清|4K|修复|MV)$/g, '')
    .trim();
  if (!text || text.length < 2 || text.length > 16) return '';
  if (/[，,。.！!？?：:；;、]/.test(text)) return '';
  if (/音乐|歌单|推荐|私藏|电台|无损|高清|完整|歌词|现场|修复|视频|合集|节奏|音质|音效|感受|一下|版本|听听|再来|一起|我们|你们|他们|这首|那首/i.test(text)) return '';
  return text;
}

function lyricArtists(title) {
  const normalized = String(title || '').normalize('NFKC');
  const artists = [];
  const push = (value) => {
    const artist = lyricCleanArtist(value);
    if (artist && !artists.includes(artist)) artists.push(artist);
  };
  const leading = normalized.match(/^\s*【([^】]{2,24})】/)?.[1];
  if (leading) push(leading);
  for (const match of normalized.matchAll(/([\p{L}·]{2,16})\s*[—–-]{1,2}\s*[《『［]/gu)) {
    push(match[1]);
  }
  const titleStart = normalized.search(/[《『［]/);
  if (titleStart > 0) {
    const beforeTitle = normalized.slice(0, titleStart);
    if (beforeTitle.length <= 30) {
      const tail = beforeTitle.match(/([\p{Script=Han}]{2,8})\s*$/u)?.[1];
      if (tail && !/[的得了着把被在听看到成为和与让给首家版曲歌]$/.test(tail)) {
        for (const length of [2, 3, 4, tail.length]) {
          if (length <= tail.length) push(tail.slice(-length));
        }
      }
    }
  }
  return artists;
}

function lyricSongTitles(title) {
  const normalized = String(title || '').normalize('NFKC');
  const titles = [];
  const push = (value) => {
    const songTitle = lyricStripDecorations(value)
      .replace(/[#＃].*$/, '')
      .replace(/(?:完整版|无损|高清|官方|动态歌词|歌词排版|4K修复|Hi-?Res|MV)$/gi, '')
      .replace(/[（(](?:完整版|无损|高清|官方|动态歌词|歌词|MV|现场直播)[）)]/gi, '')
      .trim();
    if (!songTitle || lyricIsGenericTag(songTitle)) return;
    if (!titles.includes(songTitle)) titles.push(songTitle);
  };
  for (const match of normalized.matchAll(/[《『［]([^》』］]{1,60})[》』］]/g)) push(match[1]);
  for (const match of normalized.matchAll(/[#＃]([^#＃\s]{2,24})/g)) push(match[1]);
  const bare = lyricStripDecorations(normalized)
    .replace(/^【[^】]*】\s*/, '')
    .replace(/^(?:音乐推荐|循环歌曲|私藏|私房歌|每日推荐)[:：\s]*/i, '')
    .trim();
  if (bare) {
    const strippedVariant = bare
      .replace(/(?:dj完整版|DJ完整版|完整版|无损音质|Hi-?Res|4K修复)$/gi, '')
      .trim();
    if (strippedVariant.length >= 2) push(strippedVariant);
    const firstSegment = bare.split(/[|｜]/)[0];
    if (firstSegment.length >= 2) push(firstSegment);
    const dashParts = firstSegment.split(/\s*[—–-]\s*/).filter(Boolean);
    if (dashParts.length > 1 && dashParts[0].length >= 2) push(dashParts[0]);
  }
  return titles;
}

function lyricQueries(title, tags = []) {
  const queries = [];
  const push = (value) => {
    const query = String(value || '')
      .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (query.length >= 2 && !queries.includes(query)) queries.push(query);
  };
  const songTitles = lyricSongTitles(title);
  const artist = lyricArtists(title)[0] || '';
  for (const songTitle of songTitles) {
    if (artist) push(`${artist} ${songTitle}`);
    push(songTitle);
  }
  const withoutBrackets = lyricStripDecorations(title);
  push(withoutBrackets.split(/[|｜]/)[0]);
  push(withoutBrackets);
  for (const part of withoutBrackets.split(/\s+[-–—]\s+/)) push(part);
  for (const tag of tags) {
    if (lyricIsGenericTag(tag)) continue;
    push(lyricStripDecorations(tag));
  }
  return queries;
}

function lyricBigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value) => {
    if (value.length < 2) return [value];
    const result = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      result.push(value.slice(index, index + 2));
    }
    return result;
  };
  const left = grams(a);
  const right = new Map();
  for (const gram of grams(b)) right.set(gram, (right.get(gram) || 0) + 1);
  let hit = 0;
  for (const gram of left) {
    const count = right.get(gram) || 0;
    if (count > 0) {
      hit += 1;
      right.set(gram, count - 1);
    }
  }
  return (2 * hit) / (left.length + grams(b).length);
}

function lyricTitleScore(sourceTerms, candidateName) {
  const candidate = lyricCleanKey(
    String(candidateName || '').replace(/\([^)]*\)|（[^）]*）/g, ''),
  );
  if (!candidate) return 0;
  let best = 0;
  for (const term of sourceTerms) {
    const source = lyricCleanKey(term);
    if (!source) continue;
    if (source === candidate) {
      best = Math.max(best, 1);
      continue;
    }
    if (source.includes(candidate) || candidate.includes(source)) {
      const ratio = Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
      best = Math.max(best, 0.55 + ratio * 0.4);
    }
    best = Math.max(best, lyricBigramDice(source, candidate) * 0.88);
  }
  return best;
}

function lyricDurationScore(sourceSeconds, candidateMs) {
  const source = Number(sourceSeconds) || 0;
  const candidate = (Number(candidateMs) || 0) / 1000;
  if (!source || !candidate) return 0.45;
  const diff = Math.abs(source - candidate);
  if (diff <= 4) return 1;
  if (diff <= 10) return 0.9;
  if (diff <= 20) return 0.74;
  if (diff <= 35) return 0.55;
  if (diff <= 55) return 0.32;
  return 0.08;
}

function lyricArtistScore(track, song) {
  const artists = (song.artists || []).map((item) => String(item.name || '')).join(' ');
  const haystack = `${track.title} ${track.artist}`;
  if (artists && haystack.includes(artists)) return 1;
  for (const artist of song.artists || []) {
    const name = lyricCleanKey(artist.name);
    if (name && lyricCleanKey(haystack).includes(name)) return 0.9;
  }
  const titleParts = String(track.title).split(/\s+[-–—]\s+/).map(lyricCleanKey).filter(Boolean);
  if (titleParts.some((part) => artists && lyricCleanKey(artists).includes(part))) return 0.8;
  return 0.35;
}

function lyricVariantScore(track, song) {
  const source = String(track.title);
  const candidate = String(song.name || '');
  const has = (text, pattern) => pattern.test(text);
  const pairs = [
    [/live|现场/i, /live|现场/i],
    [/dj|remix|混音/i, /dj|remix|混音/i],
    [/伴奏|纯音乐|纯音|instrumental/i, /伴奏|纯音乐|纯音|instrumental/i],
  ];
  let score = 1;
  for (const [sourcePattern, candidatePattern] of pairs) {
    const inSource = has(source, sourcePattern);
    const inCandidate = has(candidate, candidatePattern);
    if (inSource !== inCandidate) score -= inCandidate ? 0.35 : 0.18;
  }
  if (/翻唱|cover/i.test(candidate) && !/翻唱|cover/i.test(source)) score -= 0.25;
  return Math.max(0, score);
}

function lyricScoreSong(track, song, titleTerms, query, tags) {
  let title = lyricTitleScore([track.title, ...titleTerms], song.name);
  const duration = lyricDurationScore(track.duration, song.duration);
  const artist = lyricArtistScore(track, song);
  const variant = lyricVariantScore(track, song);
  const requiredArtists = lyricArtists(track.title).slice(0, 2).map(lyricCleanKey);
  const songArtists = (song.artists || []).map((item) => lyricCleanKey(item.name)).filter(Boolean);
  const artistMismatch = requiredArtists.length > 0
    && !requiredArtists.some((required) => songArtists.some((actual) => actual.includes(required) || required.includes(actual)));
  const queryIsTag = (tags || []).some((tag) => lyricCleanKey(tag) === lyricCleanKey(query));
  const songSeconds = (Number(song.duration) || 0) / 1000;
  const closeDuration = track.duration && songSeconds
    ? Math.abs(track.duration - songSeconds)
    : Infinity;
  if (queryIsTag && lyricCleanKey(song.name) === lyricCleanKey(query) && closeDuration <= 6) {
    title = Math.max(title, closeDuration <= 3 ? 0.88 : 0.74);
  }
  let score = title * 0.55 + duration * 0.25 + artist * 0.12 + variant * 0.08;
  if (artistMismatch) score -= 0.22;
  return {
    score: Math.max(0, score),
    titleScore: title,
    durationScore: duration,
    songSeconds,
  };
}

function lyricLooksInstrumental(text, tags = []) {
  const value = String(text || '');
  if (/伴奏版|伴奏|纯音乐|纯音|instrumental|off\s*vocal|karaoke|笛声|钢琴(?:版|纯享|演奏)|吉他(?:版|纯享|演奏)|古筝(?:版|纯享|演奏)|二胡(?:版|纯享|演奏)|箫(?:版|纯享|演奏)|小提琴(?:版|纯享|演奏)/i.test(value)) {
    return true;
  }
  return (tags || []).some((tag) => /^(纯音乐|纯音|伴奏|instrumental|off vocal)$/i.test(String(tag).trim()));
}

function lyricScaleLrc(text, scale, offset = 0) {
  const safeScale = Number.isFinite(scale) ? scale : 1;
  const safeOffset = Number(offset) || 0;
  if (Math.abs(safeScale - 1) < 0.003 && Math.abs(safeOffset) < 0.01) return text;
  return String(text || '').replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, (_match, min, sec, fraction) => {
    let millis = String(fraction || '0');
    if (millis.length === 1) millis = `${millis}00`;
    else if (millis.length === 2) millis = `${millis}0`;
    const seconds = (Number(min) * 60 + Number(sec) + Number(millis) / 1000) * safeScale + safeOffset;
    const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
    const outputMin = Math.floor(totalCentiseconds / 6000);
    const outputSec = Math.floor((totalCentiseconds % 6000) / 100);
    const outputCs = totalCentiseconds % 100;
    return `[${String(outputMin).padStart(2, '0')}:${String(outputSec).padStart(2, '0')}.${String(outputCs).padStart(2, '0')}]`;
  });
}

function lyricMergeTranslation(lrc, translated) {
  if (!translated || !translated.trim()) return lrc;
  const translationMap = new Map();
  const stampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const stampKey = (stamp) => {
    let fraction = String(stamp[3] || '0');
    if (fraction.length === 1) fraction = `${fraction}00`;
    else if (fraction.length === 2) fraction = `${fraction}0`;
    return `${Number(stamp[1])}:${Number(stamp[2])}.${fraction.padStart(3, '0').slice(0, 3)}`;
  };
  for (const rawLine of String(translated).split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(stampPattern)];
    if (!stamps.length) continue;
    const content = rawLine.replace(/\[[^\]]*\]/g, '').trim();
    if (!content) continue;
    for (const stamp of stamps) {
      const key = stampKey(stamp);
      if (!translationMap.has(key)) translationMap.set(key, content);
    }
  }
  if (!translationMap.size) return lrc;
  const output = [];
  for (const rawLine of String(lrc).split(/\r?\n/)) {
    output.push(rawLine);
    const stamps = [...rawLine.matchAll(stampPattern)];
    if (!stamps.length) continue;
    for (const stamp of stamps) {
      const key = stampKey(stamp);
      const line = translationMap.get(key);
      if (line) output.push(`[${stamp[1]}:${stamp[2]}${stamp[3] ? `.${stamp[3]}` : ''}]${line}`);
    }
  }
  return output.join('\n');
}

function lyricCleanNeteaseText(lrc, translated) {
  let text = lyricMergeTranslation(String(lrc || ''), String(translated || ''));
  const cleaned = [];
  for (const line of text.split(/\r?\n/)) {
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    if (content && /^(作词|作曲|编曲|制作人|混音|母带|录音|监制|出品|发行|OP|SP|词|曲|原唱|翻唱|演唱)\s*[:：]/i.test(content)) {
      continue;
    }
    if (/^\[(?:ti|ar|al|by|length):/i.test(line.trim())) continue;
    cleaned.push(line);
  }
  text = cleaned.join('\n').trim();
  const timed = text.split(/\r?\n/).filter((line) => (
    /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/.test(line)
    && line.replace(/\[[^\]]*\]/g, '').trim()
  ));
  return { text, lineCount: timed.length };
}

async function loadBiliLyricsCache() {
  if (biliLyricsCacheLoaded) return;
  biliLyricsCacheLoaded = true;
  if (!biliLyricsCacheFile) return;
  try {
    const raw = JSON.parse(await fsp.readFile(biliLyricsCacheFile, 'utf8'));
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const now = Date.now();
    for (const item of items) {
      if (!item?.key || !item?.value) continue;
      if (item.value.engine !== LYRICS_ENGINE_VERSION) continue;
      if (now - (Number(item.at) || 0) > LYRICS_CACHE_TTL) continue;
      biliLyricsCache.set(item.key, { at: Number(item.at) || now, value: item.value });
    }
  } catch {
    /* A missing or damaged cache is simply an empty cache. */
  }
}

function scheduleSaveBiliLyricsCache() {
  clearTimeout(biliLyricsSaveTimer);
  biliLyricsSaveTimer = setTimeout(async () => {
    if (!biliLyricsCacheFile) return;
    try {
      const items = [...biliLyricsCache.entries()]
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, 500)
        .map(([key, entry]) => ({ key, at: entry.at, value: entry.value }));
      await fsp.writeFile(biliLyricsCacheFile, JSON.stringify({ version: 1, items }), 'utf8');
    } catch (error) {
      recordLog('LYRICS_CACHE_SAVE', error);
    }
  }, 500);
}

function biliLyricsCacheGet(key) {
  const entry = biliLyricsCache.get(key);
  if (!entry) return null;
  const ttl = entry.value?.status === 'empty' ? 6 * 60 * 60 * 1000 : LYRICS_CACHE_TTL;
  if (Date.now() - entry.at > ttl) {
    biliLyricsCache.delete(key);
    return null;
  }
  return entry.value;
}

function biliLyricsCacheSet(key, value) {
  biliLyricsCache.set(key, { at: Date.now(), value });
  if (biliLyricsCache.size > 500) {
    const oldest = [...biliLyricsCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) biliLyricsCache.delete(oldest[0]);
  }
  scheduleSaveBiliLyricsCache();
}

async function neteaseWait() {
  const now = Date.now();
  const wait = Math.max(0, neteaseNextRequestAt - now);
  neteaseNextRequestAt = Math.max(now, neteaseNextRequestAt) + 430;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function neteaseFetchJson(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await neteaseWait();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Referer: 'https://music.163.com/',
            Origin: 'https://music.163.com',
            'User-Agent': NETEASE_UA,
            Accept: 'application/json',
          },
        });
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 405) throw new Error('网易云请求过于频繁');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.code === 405) throw new Error(data?.message || '网易云请求过于频繁');
      if (data?.code !== 200) throw new Error(data?.message || `Netease ${data?.code}`);
      return data;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 900 + attempt * 700));
    }
  }
  throw lastError || new Error('网易云歌词接口暂时不可用');
}

async function searchNeteaseSongs(query) {
  const params = new URLSearchParams({
    s: String(query || '').slice(0, 100),
    type: '1',
    offset: '0',
    limit: '8',
  });
  const data = await neteaseFetchJson(`${NETEASE_API}/api/search/get?${params.toString()}`);
  return Array.isArray(data?.result?.songs) ? data.result.songs : [];
}

async function getNeteaseLyrics(songId) {
  if (!songId) return null;
  const params = new URLSearchParams({
    os: 'pc',
    id: String(songId),
    lv: '-1',
    kv: '-1',
    tv: '-1',
  });
  return neteaseFetchJson(`${NETEASE_API}/api/song/lyric?${params.toString()}`);
}

function decodeQQText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16) || 32))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchQQMusicSongs(query, limit = 10) {
  const params = new URLSearchParams({
    p: '1',
    n: String(Math.max(1, Math.min(20, limit))),
    w: String(query || '').slice(0, 100),
    format: 'json',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let data;
  try {
    const response = await fetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Referer: 'https://y.qq.com/',
        Origin: 'https://y.qq.com',
        'User-Agent': NETEASE_UA,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  const list = data?.data?.song?.list;
  if (!Array.isArray(list)) return [];
  return list.map((song) => ({
    id: String(song?.songmid || ''),
    title: decodeQQText(song?.songname || song?.name),
    artist: (Array.isArray(song?.singer) ? song.singer : [])
      .map((item) => decodeQQText(item?.name))
      .filter(Boolean)
      .join(' / '),
    album: decodeQQText(song?.albumname),
    duration: Number(song?.interval) || 0,
  })).filter((song) => song.id && song.title);
}

async function getQQMusicLyric(songMid) {
  const params = new URLSearchParams({
    songmid: String(songMid || ''),
    format: 'json',
    nobase64: '1',
    g_tk: '5381',
    loginUin: '0',
    hostUin: '0',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq.json',
    needNewCode: '0',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let data;
  try {
    const response = await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Referer: 'https://y.qq.com/',
        Origin: 'https://y.qq.com',
        'User-Agent': NETEASE_UA,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (Number(data?.code) !== 0 || Number(data?.retcode) !== 0) return '';
  return String(data?.lyric || '').replace(/&#10;/g, '\n');
}

function catalogCandidateScore(track, candidate, query) {
  const sourceTerms = [track.title, query, ...lyricSongTitles(track.title)];
  const title = lyricTitleScore(sourceTerms, candidate.title);
  const duration = lyricDurationScore(track.duration, candidate.duration * 1000);
  const haystack = `${track.title} ${track.artist || ''}`;
  const artist = candidate.artist && (
    haystack.includes(candidate.artist)
    || lyricCleanKey(haystack).includes(lyricCleanKey(candidate.artist))
  ) ? 1 : 0.35;
  const sourceTitle = String(track.title || '');
  const candidateTitle = String(candidate.title || '');
  let variantPenalty = 0;
  const variants = [
    [/live|现场/i, 0.28],
    [/dj|remix|混音/i, 0.3],
    [/伴奏|纯音乐|纯音|instrumental/i, 0.35],
    [/cover|翻唱|翻自/i, 0.08],
  ];
  for (const [pattern, penalty] of variants) {
    if (pattern.test(candidateTitle) && !pattern.test(sourceTitle)) variantPenalty += penalty;
  }
  return {
    score: Math.max(0, title * 0.6 + duration * 0.25 + artist * 0.15 - variantPenalty),
    titleScore: title,
    variantPenalty: Number(variantPenalty.toFixed(2)),
  };
}

async function searchLyricCatalog(payload = {}) {
  const title = decodeBiliText(payload?.title).slice(0, 200);
  const artist = decodeBiliText(payload?.artist).slice(0, 120);
  const duration = Math.max(0, Number(payload?.duration) || 0);
  const queryInput = String(payload?.query || '').trim().slice(0, 100);
  const queries = queryInput ? [queryInput] : lyricQueries(title).slice(0, 3);
  if (!queries.length) return { ok: true, candidates: [] };
  const track = { title, artist, duration };
  const candidates = [];
  const seen = new Set();
  for (const query of queries.slice(0, 3)) {
    const [neteaseSongs, qqSongs] = await Promise.all([
      searchNeteaseSongs(query).catch(() => []),
      searchQQMusicSongs(query, 10).catch(() => []),
    ]);
    for (const song of neteaseSongs) {
      const item = {
        provider: 'netease',
        id: String(song.id),
        title: decodeBiliText(song.name),
        artist: (song.artists || []).map((entry) => decodeBiliText(entry.name)).filter(Boolean).join(' / '),
        album: decodeBiliText(song.album?.name),
        duration: Math.round((Number(song.duration) || 0) / 1000),
      };
      if (!item.id || !item.title) continue;
      const key = `${item.provider}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scored = catalogCandidateScore(track, item, query);
      candidates.push({ ...item, ...scored });
    }
    for (const song of qqSongs) {
      const item = { provider: 'qq', ...song };
      const key = `${item.provider}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scored = catalogCandidateScore(track, item, query);
      candidates.push({ ...item, ...scored });
    }
    if (candidates.length >= 24) break;
  }
  candidates.sort((a, b) => b.score - a.score || b.titleScore - a.titleScore);
  return {
    ok: true,
    candidates: candidates.slice(0, 24).map((item) => ({
      ...item,
      score: Number(item.score.toFixed(3)),
      titleScore: Number(item.titleScore.toFixed(3)),
    })),
  };
}

async function getLyricCatalogCandidate(payload = {}) {
  const provider = String(payload?.provider || '');
  const id = String(payload?.id || '').trim();
  if (!id) throw new Error('缺少歌词候选 ID');
  if (provider === 'netease') {
    const data = await getNeteaseLyrics(id);
    const clean = lyricCleanNeteaseText(data?.lrc?.lyric, data?.tlyric?.lyric);
    if (!clean.text) return { ok: false, error: '这个候选没有可用歌词' };
    return {
      ok: true,
      lrc: clean.text.slice(0, 60000),
      source: `网易云 · ${decodeBiliText(payload?.artist) || '手动选择'}`,
      title: decodeBiliText(payload?.title),
      artist: decodeBiliText(payload?.artist),
      lineCount: clean.lineCount,
    };
  }
  if (provider === 'qq') {
    const raw = await getQQMusicLyric(id);
    const clean = lyricCleanNeteaseText(raw, '');
    if (!clean.text) return { ok: false, error: '这个候选没有可用歌词' };
    return {
      ok: true,
      lrc: clean.text.slice(0, 60000),
      source: `QQ音乐 · ${decodeBiliText(payload?.artist) || '手动选择'}`,
      title: decodeBiliText(payload?.title),
      artist: decodeBiliText(payload?.artist),
      lineCount: clean.lineCount,
    };
  }
  throw new Error('不支持的歌词来源');
}

async function findNeteaseLyric(track, tags = [], calibration = null) {
  const titleTerms = [...lyricSongTitles(track.title), ...lyricArtists(track.title)];
  const queries = lyricQueries(track.title, tags);
  let best = null;
  const seen = new Set();
  for (const query of queries.slice(0, 8)) {
    let songs = [];
    try {
      songs = await searchNeteaseSongs(query);
    } catch (error) {
      if (best) break;
      throw error;
    }
    for (const song of songs) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      const score = lyricScoreSong(track, song, titleTerms, query, tags);
      if (!best || score.score > best.score) {
        best = { song, query, ...score };
      }
    }
    if (best && best.score >= 0.8 && best.titleScore >= 0.84) break;
  }
  if (!best) return { status: 'empty', message: '没有找到匹配的歌词' };
  const ratio = best.songSeconds && track.duration
    ? best.songSeconds / track.duration
    : 1;
  if (ratio > 1.45 || ratio < 0.72) {
    return { status: 'empty', message: '找到的歌词版本和这段音轨长度不一致' };
  }
  if (best.score < 0.65 || best.titleScore < 0.6) {
    return { status: 'empty', message: '没有找到足够可靠的歌词匹配' };
  }
  const payload = await getNeteaseLyrics(best.song.id);
  const clean = lyricCleanNeteaseText(payload?.lrc?.lyric, payload?.tlyric?.lyric);
  if (!clean.text || clean.lineCount < 3) {
    return { status: 'instrumental', message: '网易云把这首歌标记为纯音乐或暂无歌词' };
  }
  const autoScale = track.duration && best.songSeconds
    ? Math.min(1.35, Math.max(0.75, track.duration / best.songSeconds))
    : 1;
  const timeScale = Number(calibration?.scale) || autoScale;
  const timeOffset = Number(calibration?.offset) || 0;
  const lrc = lyricScaleLrc(clean.text, timeScale, timeOffset);
  const artists = (best.song.artists || []).map((item) => item.name).filter(Boolean).join(' / ');
  return {
    status: 'ok',
    lrc: lrc.slice(0, 60000),
    source: `网易云 · ${artists || '歌词'}`,
    matchedTitle: best.song.name,
    matchedArtist: artists,
    confidence: Number(best.score.toFixed(3)),
    timeScale: Number(timeScale.toFixed(3)),
    timeOffset: Number(timeOffset.toFixed(2)),
    calibrationLabel: calibration?.label || '',
    lineCount: clean.lineCount,
  };
}

function subtitleEntriesToLrc(entries) {
  const rows = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const from = Number(entry?.from);
    const content = String(entry?.content || '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(from) || from < 0 || !content) continue;
    const centiseconds = Math.round(from * 100);
    const min = Math.floor(centiseconds / 6000);
    const sec = Math.floor((centiseconds % 6000) / 100);
    const cs = centiseconds % 100;
    rows.push({
      time: from,
      line: `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${content}`,
    });
  }
  rows.sort((a, b) => a.time - b.time);
  return rows.map((item) => item.line).join('\n');
}

function validateSubtitleAsLyrics(entries, duration) {
  const rows = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      from: Number(entry?.from),
      content: String(entry?.content || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((entry) => Number.isFinite(entry.from) && entry.content);
  if (rows.length < 4) return { ok: false, reason: '字幕行数太少' };
  const lastTime = Math.max(...rows.map((row) => row.from));
  const total = Math.max(0, Number(duration) || 0);
  if (total >= 30) {
    if (lastTime < total * 0.55) return { ok: false, reason: '字幕覆盖时间太短' };
    if (lastTime > total * 1.2 + 8) return { ok: false, reason: '字幕时长明显超过当前音轨' };
    const density = rows.length / total;
    if (total >= 60 && density > 0.55) return { ok: false, reason: '字幕密度更像口播文稿' };
  }
  const strongTalk = /(请扣[一二]|点赞|投币|关注我|关注一下|下期再见|公众号|后台|粉丝|视频|评论区|弹幕|直播间|大家好|这期|本期|干货|股市|股票|行情|上证指数|成交量|仓位|回本|亏损|反弹|巴菲特)/;
  const softTalk = /^(我们|大家|今天|那么|所以|但是|因为|如果|其实|首先|其次|最后|还有|比如|就是说|你看|你知道)/;
  const strongHits = rows.filter((row) => strongTalk.test(row.content)).length;
  const softHits = rows.filter((row) => softTalk.test(row.content)).length;
  if (strongHits >= 3 || strongHits / rows.length >= 0.05) {
    return { ok: false, reason: '字幕包含明显口播词' };
  }
  if (rows.length >= 20 && softHits / rows.length >= 0.32) {
    return { ok: false, reason: '字幕句式更像讲解或聊天' };
  }
  return { ok: true, lastTime, lineCount: rows.length };
}

function lyricTextKey(text) {
  return String(text || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, '')
    .toLowerCase();
}

function lyricTextOverlap(left, right) {
  const a = lyricTextKey(left);
  const b = lyricTextKey(right);
  if (a.length < 20 || b.length < 20) return 0;
  const grams = (value) => {
    const chars = Array.from(value);
    const set = new Set();
    for (let index = 0; index < chars.length - 1; index += 1) set.add(`${chars[index]}${chars[index + 1]}`);
    return set;
  };
  const setA = grams(a);
  const setB = grams(b);
  let hits = 0;
  for (const gram of setA) if (setB.has(gram)) hits += 1;
  return hits / Math.max(1, Math.min(setA.size, setB.size));
}

function subtitleLooksLikeSpokenText(text) {
  const value = String(text || '');
  if (/(https?:\/\/|www\.|\.com\b|ed\.ted|免费下载)/i.test(value)) return true;
  const talkWords = /(请扣[一二]|点赞|投币|关注我|关注一下|下期再见|公众号|后台|粉丝|评论区|弹幕|直播间|大家好|这期|本期|干货|股市|股票|行情|上证指数|成交量|仓位|回本|亏损|反弹|巴菲特)/g;
  return (value.match(talkWords) || []).length >= 1;
}

async function getBiliPlayerData(bvid, cid) {
  let publicData = null;
  let publicError = null;
  try {
    publicData = await biliFetch('/x/player/v2', { bvid, cid });
    if (Array.isArray(publicData?.subtitle?.subtitles) && publicData.subtitle.subtitles.length) {
      return publicData;
    }
  } catch (error) {
    publicError = error;
  }
  const cookies = await getBiliAuthCookies().catch(() => new Map());
  if (cookies.has('SESSDATA')) {
    try {
      const authData = await biliAuthFetch(`/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(String(cid))}`);
      if (Array.isArray(authData?.subtitle?.subtitles) && authData.subtitle.subtitles.length) {
        return authData;
      }
      if (!publicData) return authData;
    } catch (error) {
      if (!publicData) throw publicError || error;
    }
  }
  if (publicData) return publicData;
  throw publicError || new Error('B站字幕接口暂时不可用');
}

async function getBiliSubtitleLrc(bvid, cid, duration) {
  if (!cid) return null;
  const data = await getBiliPlayerData(bvid, cid);
  const subtitles = Array.isArray(data?.subtitle?.subtitles) ? data.subtitle.subtitles : [];
  if (!subtitles.length) return null;
  const selected = subtitles.find((item) => /^zh/i.test(String(item.lan || '')))
    || subtitles.find((item) => /中文|汉语/i.test(String(item.lan_doc || '')))
    || subtitles[0];
  const url = biliToHttps(selected?.subtitle_url);
  if (!/^https:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let payload;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Referer: BILI_REFERER,
        Origin: BILI_REFERER,
        'User-Agent': BILI_UA,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } finally {
    clearTimeout(timer);
  }
  const validation = validateSubtitleAsLyrics(payload?.body, duration);
  if (!validation.ok) {
    recordLog('BILI_SUBTITLE_REJECT', validation.reason, bvid, cid);
    return { rejected: true, reason: validation.reason };
  }
  const lrc = subtitleEntriesToLrc(payload?.body);
  if (!lrc.trim()) return null;
  return {
    lrc,
    source: `B站字幕${selected?.lan_doc ? ` · ${selected.lan_doc}` : ''}`,
    lineCount: validation.lineCount,
    lastTime: validation.lastTime,
  };
}

async function getBiliTags(bvid) {
  try {
    const data = await biliFetch('/x/tag/archive/tags', { bvid });
    return (Array.isArray(data) ? data : [])
      .map((item) => decodeBiliText(item?.tag_name))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveBilibiliLyrics(payload = {}, force = false) {
  const bvid = String(payload?.bvid || '').trim();
  const title = decodeBiliText(payload?.title).slice(0, 200);
  const artist = decodeBiliText(payload?.artist).slice(0, 120);
  const duration = Math.max(0, Number(payload?.duration) || 0);
  let cid = Number(payload?.cid) || 0;
  if (!bvid) throw new Error('缺少 bvid');
  await loadBiliLyricsCache();
  const cacheKey = `v${LYRICS_ENGINE_VERSION}|${bvid}|${cid || 0}|${title}|${Math.round(duration)}`;
  if (!force) {
    const cached = biliLyricsCacheGet(cacheKey);
    if (cached) return { ...cached, cached: true };
  }
  if (lyricLooksInstrumental(title)) {
    const result = {
      ok: true,
      engine: LYRICS_ENGINE_VERSION,
      status: 'instrumental',
      bvid,
      cid,
      lrc: '',
      source: '纯音乐',
      message: '这首歌是纯音乐或伴奏，不需要歌词',
    };
    biliLyricsCacheSet(cacheKey, result);
    return result;
  }

  let detail = null;
  try {
    detail = await biliFetch('/x/web-interface/view', { bvid });
    if (!cid) cid = Number(detail?.cid) || Number(detail?.pages?.[0]?.cid) || 0;
  } catch {
    /* A cached CID from the library is enough for the subtitle request. */
  }

  const tags = await getBiliTags(bvid);
  if (lyricLooksInstrumental('', tags)) {
    const result = {
      ok: true,
      engine: LYRICS_ENGINE_VERSION,
      status: 'instrumental',
      bvid,
      cid,
      lrc: '',
      source: '纯音乐',
      message: '这首歌在 B 站被标记为纯音乐或伴奏，不需要歌词',
    };
    biliLyricsCacheSet(cacheKey, result);
    return result;
  }

  const track = { title, artist, duration };
  const calibration = BILI_LYRIC_CALIBRATIONS[bvid] || null;
  let match = null;
  let matchError = null;
  const subtitlePromise = cid
    ? getBiliSubtitleLrc(bvid, cid, duration).catch((error) => {
        recordLog('BILI_SUBTITLE', error?.message || error);
        return null;
      })
    : Promise.resolve(null);
  const matchPromise = findNeteaseLyric(track, tags, calibration).catch((error) => {
    matchError = error;
    recordLog('NETEASE_LYRICS', error?.message || error);
    return null;
  });
  const [subtitleRaw, neteaseMatch] = await Promise.all([subtitlePromise, matchPromise]);
  match = neteaseMatch;
  let subtitle = null;
  let subtitleRejected = '';
  if (subtitleRaw?.rejected) {
    subtitleRejected = subtitleRaw.reason || '字幕内容不像歌词';
  } else if (subtitleRaw) {
    subtitle = subtitleRaw;
  }

  if (match?.status === 'ok' && match.lrc) {
    if (subtitle && lyricTextOverlap(subtitle.lrc, match.lrc) >= 0.2) {
      const result = {
        ok: true,
        engine: LYRICS_ENGINE_VERSION,
        status: 'ok',
        bvid,
        cid,
        lrc: subtitle.lrc.slice(0, 60000),
        source: `${subtitle.source} · 同步`,
        matchedTitle: title,
        matchedArtist: artist,
        confidence: 1,
        timeScale: 1,
        timeOffset: 0,
        calibrationLabel: '',
        lineCount: subtitle.lineCount,
      };
      biliLyricsCacheSet(cacheKey, result);
      return result;
    }
    const result = {
      ok: true,
      engine: LYRICS_ENGINE_VERSION,
      bvid,
      cid,
      lrc: match.lrc,
      source: match.calibrationLabel ? `${match.source} · 已校准` : match.source,
      status: 'ok',
      message: '',
      matchedTitle: match.matchedTitle || '',
      matchedArtist: match.matchedArtist || '',
      confidence: match.confidence || 0,
      timeScale: match.timeScale || 1,
      timeOffset: match.timeOffset || 0,
      calibrationLabel: match.calibrationLabel || '',
      lineCount: match.lineCount || 0,
    };
    biliLyricsCacheSet(cacheKey, result);
    return result;
  }

  if (subtitle) {
    if (subtitleLooksLikeSpokenText(subtitle.lrc)) {
      subtitleRejected = '字幕内容像视频口播，不是歌词';
    } else {
      const result = {
        ok: true,
        engine: LYRICS_ENGINE_VERSION,
        status: 'ok',
        bvid,
        cid,
        lrc: subtitle.lrc.slice(0, 60000),
        source: subtitle.source,
        matchedTitle: title,
        matchedArtist: artist,
        confidence: 1,
        timeScale: 1,
        timeOffset: 0,
        calibrationLabel: '',
        lineCount: subtitle.lineCount,
      };
      biliLyricsCacheSet(cacheKey, result);
      return result;
    }
  }

  const result = {
    ok: true,
    engine: LYRICS_ENGINE_VERSION,
    bvid,
    cid,
    lrc: '',
    source: match?.status === 'instrumental' ? '纯音乐' : '未匹配',
    status: match?.status === 'instrumental' ? 'instrumental' : 'empty',
    message: match?.message
      || (subtitleRejected ? `B站字幕未通过歌词校验：${subtitleRejected}` : '')
      || (matchError ? `歌词接口暂时不可用：${matchError.message}` : '没有找到可靠的同步歌词'),
    matchedTitle: '',
    matchedArtist: '',
    confidence: 0,
    timeScale: 1,
    timeOffset: 0,
    calibrationLabel: '',
    lineCount: 0,
  };
  biliLyricsCacheSet(cacheKey, result);
  return result;
}

function rememberBiliStream(url) {
  const now = Date.now();
  for (const [key, entry] of biliStreamTargets) {
    if (entry.expiresAt <= now) biliStreamTargets.delete(key);
  }
  if (biliStreamTargets.size > 120) {
    const oldest = [...biliStreamTargets.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) biliStreamTargets.delete(oldest[0]);
  }
  const token = crypto.randomBytes(12).toString('hex');
  biliStreamTargets.set(token, {
    url,
    at: now,
    expiresAt: now + 30 * 60 * 1000,
  });
  return token;
}

async function biliFetchRaw(pathAndQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let data;
  try {
    const response = await fetch(`${BILI_API}${pathAndQuery}`, {
      signal: controller.signal,
      headers: {
        Referer: BILI_REFERER,
        Origin: BILI_REFERER,
        'User-Agent': BILI_UA,
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (data?.code !== 0) {
    const error = new Error(data?.message || `Bilibili ${data?.code}`);
    error.code = data?.code;
    throw error;
  }
  return data.data;
}

async function biliFetch(path, params = {}) {
  const url = new URL(`${BILI_API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return biliFetchRaw(`${url.pathname}${url.search}`);
}

function getBiliAuthSession() {
  if (!biliAuthSession) {
    biliAuthSession = session.fromPartition(BILI_AUTH_PARTITION);
    biliAuthSession.setUserAgent(BILI_UA);
  }
  return biliAuthSession;
}

async function getBiliAuthCookies() {
  const cookies = await getBiliAuthSession().cookies.get({});
  const map = new Map();
  for (const cookie of cookies) {
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    if (!domain.endsWith('bilibili.com') || !cookie.name) continue;
    map.set(cookie.name, cookie.value);
  }
  return map;
}

async function biliAuthFetch(pathAndQuery) {
  const cookies = await getBiliAuthCookies();
  if (!cookies.has('SESSDATA')) throw new Error('请先登录 B 站');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let data;
  try {
    const response = await fetch(`${BILI_API}${pathAndQuery}`, {
      signal: controller.signal,
      headers: {
        Referer: BILI_REFERER,
        Origin: BILI_REFERER,
        'User-Agent': BILI_UA,
        Accept: 'application/json',
        Cookie: [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (data?.code !== 0) {
    const error = new Error(data?.message || `Bilibili ${data?.code}`);
    error.code = data?.code;
    if (data?.code === -101) error.message = 'B 站登录已失效，请重新登录';
    if (data?.code === -403) error.message = '没有权限访问这个收藏夹';
    if (data?.code === -404) error.message = '收藏夹不存在或已删除';
    throw error;
  }
  return data.data;
}

async function getBiliAuthUser() {
  const cookies = await getBiliAuthCookies();
  if (!cookies.has('SESSDATA')) return null;
  try {
    const data = await biliAuthFetch('/x/web-interface/nav');
    if (!data?.isLogin) return null;
    return {
      mid: Number(data.mid) || 0,
      uname: String(data.uname || ''),
      face: biliToHttps(data.face || ''),
      level: Number(data.level_info?.current_level) || 0,
      vip: Boolean(data.vipStatus),
    };
  } catch {
    return null;
  }
}

async function openBiliLoginWindow() {
  if (biliLoginWindow && !biliLoginWindow.isDestroyed()) {
    biliLoginWindow.show();
    biliLoginWindow.focus();
    return { ok: false, error: 'B 站登录窗口已经打开了' };
  }
  const authSession = getBiliAuthSession();
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    parent,
    modal: Boolean(parent),
    show: false,
    title: '登录 B 站 · qianqu',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      session: authSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  biliLoginWindow = win;
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\/([a-z0-9-]+\.)*bilibili\.com\//i.test(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (/^https?:\/\/([a-z0-9-]+\.)*bilibili\.com\//i.test(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (biliLoginWindow === win) biliLoginWindow = null;
  });

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let timeoutTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (!win.isDestroyed()) win.close();
      resolve(result);
    };
    const check = async () => {
      if (settled) return;
      const user = await getBiliAuthUser();
      if (user) finish({ ok: true, user });
    };
    win.on('closed', () => {
      if (!settled) {
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        resolve({ ok: false, canceled: true });
      }
    });
    win.webContents.once('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        finish({ ok: false, error: `登录页加载失败：${description || code}` });
      }
    });
    pollTimer = setInterval(check, 2500);
    timeoutTimer = setTimeout(() => finish({ ok: false, error: '登录超时，请重试' }), 5 * 60 * 1000);
    win.loadURL('https://passport.bilibili.com/login');
    setTimeout(check, 800);
  });
}

function normalizeBiliFavFolder(folder, type, ownerName = '') {
  const id = folder?.id ?? folder?.fid ?? folder?.media_id;
  const title = decodeBiliText(folder?.title || folder?.name);
  if (!id || !title) return null;
  return {
    id: String(id),
    kind: 'folder',
    title,
    mediaCount: Number(folder.media_count ?? folder.count ?? 0) || 0,
    cover: biliToHttps(folder.cover || folder.cover_url || folder.pic || ''),
    type: type === 'collected' ? 'collected' : 'created',
    owner: decodeBiliText(folder?.upper?.name || ownerName),
  };
}

function normalizeBiliSeasonSubscription(item) {
  const id = item?.id;
  const title = decodeBiliText(item?.title || item?.name);
  if (!id || !title) return null;
  return {
    id: String(id),
    kind: 'season',
    title,
    mediaCount: Number(item.media_count ?? item.total) || 0,
    cover: biliToHttps(item.cover),
    type: 'collected',
    mid: Number(item.mid || item.upper?.mid) || 0,
    owner: decodeBiliText(item?.upper?.name),
    intro: decodeBiliText(item?.intro),
    mtime: Number(item?.mtime) || 0,
  };
}

async function getBiliFavFolders() {
  const user = await getBiliAuthUser();
  if (!user) throw new Error('请先登录 B 站');
  const createdData = await biliAuthFetch(
    `/x/v3/fav/folder/created/list-all?up_mid=${user.mid}&web_location=333.1387`,
  );
  const created = Array.isArray(createdData?.list) ? createdData.list : [];
  let collected = [];
  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 10) {
      const collectedData = await biliAuthFetch(
        `/x/v3/fav/folder/collected/list?up_mid=${user.mid}&pn=${page}&ps=50&platform=web&web_location=333.1387`,
      );
      const list = Array.isArray(collectedData?.list) ? collectedData.list : [];
      collected.push(...list);
      hasMore = Boolean(collectedData?.has_more) || list.length >= 50;
      page += 1;
      if (hasMore) await new Promise((resolve) => setTimeout(resolve, 120));
    }
  } catch {
    collected = [];
  }
  const folders = [
    ...created.map((folder) => normalizeBiliFavFolder(folder, 'created', user.uname)),
    ...collected.map((folder) => (
      Number(folder?.type) === 21
        ? normalizeBiliSeasonSubscription(folder)
        : normalizeBiliFavFolder(folder, 'collected')
    )),
  ].filter(Boolean);
  const seen = new Set();
  return folders.filter((folder) => {
    const key = `${folder.kind}:${folder.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBiliFavItem(item) {
  const bvid = item?.bvid || item?.bv_id;
  if (!bvid || Number(item?.attr) > 0) return null;
  const title = decodeBiliText(item.title);
  if (!title) return null;
  return {
    id: `bili-${bvid}`,
    source: 'bilibili',
    sourceLabel: 'BILIBILI',
    kind: 'video',
    bvid,
    cid: null,
    title,
    artist: decodeBiliText(item.upper?.name || item.author) || 'B站 UP主',
    album: 'Bilibili 收藏夹',
    duration: parseBiliDuration(item.duration),
    cover: biliToHttps(item.cover || item.pic),
    pageUrl: `https://www.bilibili.com/video/${bvid}`,
    playCount: Number(item.cnt_info?.play) || 0,
    description: decodeBiliText(item.intro),
    license: 'Bilibili 视频音轨',
  };
}

function normalizeBiliSeasonArchive(archive, meta = {}, ownerName = '') {
  const bvid = archive?.bvid || archive?.bv_id;
  const title = decodeBiliText(archive?.title);
  if (!bvid || !title) return null;
  const owner = ownerName || decodeBiliText(meta?.upper?.name) || 'B站合集';
  return {
    id: `bili-${bvid}`,
    source: 'bilibili',
    sourceLabel: 'BILIBILI',
    kind: 'video',
    bvid,
    cid: null,
    title,
    artist: owner,
    album: 'Bilibili 合集',
    duration: Number(archive?.duration) || 0,
    cover: biliToHttps(archive?.pic || archive?.cover || meta?.cover),
    pageUrl: `https://www.bilibili.com/video/${bvid}`,
    playCount: Number(archive?.stat?.view) || 0,
    description: decodeBiliText(meta?.description),
    license: 'Bilibili 合集音轨',
  };
}

async function getBiliSeasonArchives(mid, seasonId, options = {}) {
  const pageSize = Math.min(50, Math.max(1, Number(options.pageSize) || 30));
  const maxItems = Math.min(500, Math.max(1, Number(options.maxItems) || 500));
  const items = [];
  const seen = new Set();
  let meta = null;
  let total = 0;
  let page = 1;
  let hasMore = true;
  while (hasMore && items.length < maxItems && page <= 40) {
    let data = null;
    try {
      data = await biliFetch('/x/polymer/web-space/seasons_archives_list', {
        mid,
        season_id: seasonId,
        sort_reverse: 'false',
        page_num: page,
        page_size: pageSize,
      });
    } catch (error) {
      if (page === 1) {
        data = await biliFetch('/x/polymer/space/seasons_archives_list', {
          mid,
          season_id: seasonId,
          sort_reverse: 'false',
          page_num: page,
          page_size: pageSize,
        });
      } else {
        throw error;
      }
    }
    meta = meta || data?.meta || null;
    total = Number(data?.page?.total || data?.meta?.total) || total;
    const archives = Array.isArray(data?.archives) ? data.archives : [];
    if (!archives.length) break;
    for (const archive of archives) {
      const item = normalizeBiliSeasonArchive(archive, data?.meta || meta, options.owner);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= maxItems) break;
    }
    hasMore = archives.length >= pageSize && (!total || page * pageSize < total);
    page += 1;
    if (hasMore) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return {
    items,
    meta,
    total: total || items.length,
    truncated: Boolean(total && total > items.length),
  };
}

async function getBiliFavItems(mediaId, page = 1, pageSize = 20) {
  const data = await biliAuthFetch(
    `/x/v3/fav/resource/list?media_id=${encodeURIComponent(String(mediaId))}`
    + `&pn=${page}&ps=${pageSize}&platform=web&order=mtime&type=0&tid=0&web_location=333.1387`,
  );
  const medias = Array.isArray(data?.medias) ? data.medias : [];
  const items = [];
  for (const media of medias) {
    if (Number(media?.type) === 21) {
      const seasonId = media?.id ?? media?.season_id;
      const ownerMid = Number(media?.mid || media?.upper?.mid);
      if (!seasonId || !ownerMid) continue;
      try {
        const season = await getBiliSeasonArchives(ownerMid, seasonId, {
          owner: decodeBiliText(media?.upper?.name),
          maxItems: 500,
        });
        items.push(...season.items);
      } catch (error) {
        recordLog('BILI_FAV_SEASON', media?.id, error?.message || error);
      }
      continue;
    }
    const item = normalizeBiliFavItem(media);
    if (item) items.push(item);
  }
  return {
    items,
    hasMore: Boolean(data?.has_more),
    info: data?.info || null,
  };
}

async function importBiliFavFolder(mediaId, folderTitle, type) {
  const all = [];
  let page = 1;
  let hasMore = true;
  let info = null;
  while (hasMore && page <= 25 && all.length < 500) {
    const data = await getBiliFavItems(mediaId, page, 20);
    info = data.info || info;
    all.push(...data.items);
    hasMore = data.hasMore;
    page += 1;
    if (hasMore) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const deduped = dedupeBiliResults(all);
  const tracks = deduped.slice(0, 500);
  return {
    ok: true,
    folder: {
      id: String(mediaId),
      title: decodeBiliText(folderTitle || info?.title || 'B站收藏夹'),
      type: type === 'collected' ? 'collected' : 'created',
      mediaCount: Number(info?.media_count) || tracks.length,
    },
    tracks,
    truncated: hasMore || deduped.length > tracks.length,
  };
}

async function importBiliSeason(seasonId, mid, folderTitle, ownerName = '') {
  if (!seasonId) throw new Error('缺少合集 ID');
  if (!mid) throw new Error('缺少合集 UP 主 ID');
  const season = await getBiliSeasonArchives(mid, seasonId, {
    owner: decodeBiliText(ownerName),
    maxItems: 500,
  });
  if (!season.items.length) throw new Error('这个合集里没有可播放的视频');
  const meta = season.meta || {};
  const title = decodeBiliText(folderTitle || meta.title || meta.name || 'B站合集');
  return {
    ok: true,
    folder: {
      id: String(seasonId),
      kind: 'season',
      title,
      type: 'collected',
      mediaCount: season.total || season.items.length,
      owner: decodeBiliText(ownerName || meta.upper?.name),
      cover: biliToHttps(meta.cover || ''),
      mid: Number(mid) || 0,
    },
    tracks: season.items,
    truncated: season.truncated,
  };
}

const WBI_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

async function getBiliWbiKeys() {
  if (biliWbiKeys && Date.now() - biliWbiKeys.at < 6 * 3600 * 1000) return biliWbiKeys;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let data;
  try {
    const response = await fetch(`${BILI_API}/x/web-interface/nav`, {
      signal: controller.signal,
      headers: { Referer: BILI_REFERER, 'User-Agent': BILI_UA },
    });
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  const img = String(data?.data?.wbi_img?.img_url || '');
  const sub = String(data?.data?.wbi_img?.sub_url || '');
  const keyOf = (url) => url.slice(url.lastIndexOf('/') + 1).split('.')[0];
  const keys = { imgKey: keyOf(img), subKey: keyOf(sub), at: Date.now() };
  if (!keys.imgKey || !keys.subKey) throw new Error('WBI key unavailable');
  biliWbiKeys = keys;
  return keys;
}

async function biliWbiQuery(params) {
  const { imgKey, subKey } = await getBiliWbiKeys();
  const mixin = WBI_TABLE.map((index) => `${imgKey}${subKey}`[index]).join('').slice(0, 32);
  const signed = { ...params, wts: Math.round(Date.now() / 1000) };
  const query = Object.keys(signed)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(signed[key]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  return `${query}&w_rid=${crypto.createHash('md5').update(query + mixin).digest('hex')}`;
}

function normalizeBiliVideo(item) {
  if (!item?.bvid) return null;
  const title = decodeBiliText(item.title);
  const duration = parseBiliDuration(item.duration);
  if (!title || !duration) return null;
  return {
    id: `bili-${item.bvid}`,
    source: 'bilibili',
    sourceLabel: 'BILIBILI',
    kind: 'video',
    bvid: item.bvid,
    cid: null,
    title,
    artist: decodeBiliText(item.author) || 'B站 UP主',
    album: 'Bilibili 视频音轨',
    duration,
    cover: biliToHttps(item.pic),
    pageUrl: `https://www.bilibili.com/video/${item.bvid}`,
    playCount: Number(item.play) || 0,
    description: decodeBiliText(item.description),
    license: 'Bilibili 视频音轨',
  };
}

function normalizeMusicCenterItem(item) {
  const related = item?.related_archive || {};
  const bvid = related.bvid || item?.bvid;
  if (!bvid) return null;
  const title = decodeBiliText(item?.music_title || related.title);
  if (!title) return null;
  return {
    id: `bili-${bvid}`,
    source: 'bilibili',
    sourceLabel: 'BILIBILI',
    kind: 'music',
    bvid,
    cid: Number(related.cid || item?.cid) || null,
    title,
    artist: decodeBiliText(item?.author || related.username) || 'B站音乐',
    album: decodeBiliText(item?.album) || 'Bilibili 音乐',
    duration: Number(related.duration || item?.duration) || 0,
    cover: biliToHttps(item?.cover || related.cover),
    pageUrl: `https://www.bilibili.com/video/${bvid}`,
    playCount: Number(related.vv_count || item?.total_vv) || 0,
    description: decodeBiliText(related.title),
    license: 'Bilibili 音乐',
  };
}

function dedupeBiliResults(results) {
  const seen = new Set();
  return results.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function searchBilibiliMusic(query, page = 1, pageSize = 24) {
  const params = {
    search_type: 'video',
    keyword: query,
    page,
    page_size: pageSize,
    order: 'totalrank',
  };
  let data = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
    try {
      const signed = await biliWbiQuery(params);
      data = await biliFetchRaw(`/x/web-interface/wbi/search/type?${signed}`);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  if (!data) {
    try {
      data = await biliFetch('/x/web-interface/search/type', params);
    } catch (error) {
      lastError = error;
    }
  }
  if (!data) throw lastError || new Error('B站搜索没有返回数据');
  const raw = Array.isArray(data?.result) ? data.result : [];
  const normalized = raw.map(normalizeBiliVideo).filter(Boolean);
  let results = normalized.filter((item) => item.duration >= 25 && item.duration <= 20 * 60);
  if (results.length < 6) {
    results = results.concat(normalized.filter((item) => item.duration > 20 * 60 && item.duration <= 3 * 3600));
  }
  if (results.length < 6) {
    results = results.concat(normalized.filter((item) => item.duration > 3 * 3600));
  }
  if (!results.length) results = normalized;
  return dedupeBiliResults(results).slice(0, pageSize);
}

async function getBilibiliRank() {
  const cached = biliCacheGet('bili:rank', 5 * 60 * 1000);
  if (cached) return cached;
  const data = await biliFetch('/x/centralization/interface/music/comprehensive/web/rank', { pn: 1, ps: 30 });
  const results = dedupeBiliResults((data?.list || []).map(normalizeMusicCenterItem).filter(Boolean));
  biliCacheSet('bili:rank', results);
  return results;
}

async function getBilibiliNewMusic() {
  const cached = biliCacheGet('bili:new', 5 * 60 * 1000);
  if (cached) return cached;
  const data = await biliFetch('/x/centralization/interface/new/music');
  const results = dedupeBiliResults((data?.list || []).map(normalizeMusicCenterItem).filter(Boolean));
  biliCacheSet('bili:new', results);
  return results;
}

async function resolveBilibiliAudio(bvid, cid, force = false) {
  if (!bvid) throw new Error('缺少 bvid');
  const cacheKey = `bili:stream:${bvid}:${cid || 0}`;
  if (!force) {
    const cached = biliCacheGet(cacheKey, 10 * 60 * 1000);
    if (cached) return cached;
  }

  let detail = null;
  try {
    detail = await biliFetch('/x/web-interface/view', { bvid });
  } catch (error) {
    if (!cid) throw error;
  }
  const requestedCid = Number(cid) || 0;
  const matchedPage = (detail?.pages || []).find((page) => Number(page.cid) === requestedCid);
  const cidValue = matchedPage?.cid || detail?.cid || requestedCid || detail?.pages?.[0]?.cid;
  if (!cidValue) throw new Error('找不到可播放的音频分 P');
  const play = await biliFetch('/x/player/playurl', {
    bvid,
    cid: cidValue,
    qn: 0,
    fnver: 0,
    fnval: 16,
    fourk: 1,
  });
  const audio = (play?.dash?.audio || []).slice().sort((a, b) => b.bandwidth - a.bandwidth)[0];
  const streamUrl = audio?.baseUrl
    || audio?.base_url
    || audio?.backupUrl?.[0]
    || audio?.backup_url?.[0];
  if (!streamUrl) throw new Error('这个视频没有可用的独立音频流');
  const streamToken = rememberBiliStream(streamUrl);
  const result = {
    ok: true,
    bvid,
    cid: cidValue,
    title: detail ? decodeBiliText(detail.title) : '',
    artist: detail?.owner?.name || '',
    cover: biliToHttps(detail?.pic) || '',
    duration: Number(detail?.duration) || 0,
    streamUrl,
    proxyUrl: `whale-bili://stream/${streamToken}`,
    quality: Number(audio.id) || 0,
    qualityLabel: BILI_QUALITY[audio.id] || `${Math.round((audio.bandwidth || 0) / 1000)}K`,
    bandwidth: Number(audio.bandwidth) || 0,
    mimeType: audio.mimeType || 'audio/mp4',
  };
  biliCacheSet(cacheKey, result);
  return result;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'whale-cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
  },
  {
    scheme: 'whale-bili',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
  {
    scheme: 'qianqu-music',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
]);

function getMusicMetadata() {
  if (!mmPromise) mmPromise = import('music-metadata');
  return mmPromise;
}

function trimTitle(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*\d{1,3}\s*[-.、]\s*/, '')
    .trim();
}

function sha1(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function recordLog(...parts) {
  const line = `${new Date().toISOString()} ${parts.map((part) => (
    part instanceof Error ? (part.stack || part.message) : String(part)
  )).join(' ')}`;
  try {
    if (!app.isPackaged) process.stdout.write(`${line}\n`);
  } catch {
    /* A GUI launch may not have a usable stdout pipe. */
  }
  if (SMOKE) {
    try {
      fs.mkdirSync(smokeDir, { recursive: true });
      fs.appendFileSync(path.join(smokeDir, 'smoke.log'), `${line}\n`);
    } catch {
      /* Logging must never take the app down. */
    }
  }
}

async function walkDirectory(dir, output, seen, depth = 0) {
  if (depth > 8 || output.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (output.length >= MAX_FILES) return;
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(full, output, seen, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (MEDIA_EXT.has(ext) && !seen.has(full)) {
        seen.add(full);
        output.push(full);
      }
    }
  }
}

async function expandPaths(inputs) {
  const files = [];
  const seen = new Set();
  for (const input of inputs) {
    if (typeof input !== 'string' || !input) continue;
    try {
      const stat = await fsp.stat(input);
      if (stat.isDirectory()) {
        await walkDirectory(input, files, seen);
      } else if (stat.isFile() && MEDIA_EXT.has(path.extname(input).toLowerCase())) {
        if (!seen.has(input)) {
          seen.add(input);
          files.push(input);
        }
      }
    } catch {
      /* Unreadable drop / path: ignore it. */
    }
  }
  return files.slice(0, MAX_FILES);
}

async function persistCover(picture, filePath, stat) {
  if (!picture || !picture.data || !picture.data.length) return '';
  const mime = String(picture.format || 'image/jpeg').toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const key = sha1(`${filePath}|${stat.size}|${stat.mtimeMs}|${picture.data.length}`).slice(0, 24);
  const name = `${key}.${ext}`;
  const target = path.join(coversDir, name);
  try {
    await fsp.access(target);
  } catch {
    await fsp.writeFile(target, Buffer.from(picture.data));
  }
  return `whale-cover://local/${name}`;
}

async function buildTrack(filePath) {
  const stat = await fsp.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);
  let common = {};
  let format = {};
  try {
    const mm = await getMusicMetadata();
    const meta = await mm.parseFile(filePath, { duration: true, skipCovers: false });
    common = meta.common || {};
    format = meta.format || {};
  } catch {
    /* A file without readable tags is still a perfectly good track. */
  }

  const baseName = trimTitle(path.basename(filePath, ext));
  const title = (common.title && String(common.title).trim()) || baseName || path.basename(filePath);
  let artist = common.artist || (Array.isArray(common.artists) ? common.artists.join(' / ') : '');
  if (!artist && common.albumartist) artist = common.albumartist;
  if (!artist) artist = '未知艺术家';

  const cover = await persistCover(
    Array.isArray(common.picture) ? common.picture[0] : null,
    filePath,
    stat,
  );

  let embeddedLyrics = '';
  if (Array.isArray(common.lyrics)) {
    for (const lyric of common.lyrics) {
      const text = lyric?.text || lyric?.syncText?.map((line) => line.text).join('\n') || '';
      if (text.trim()) {
        embeddedLyrics = String(text);
        break;
      }
    }
  } else if (typeof common.lyrics === 'string') {
    embeddedLyrics = common.lyrics;
  }

  return {
    id: sha1(filePath).slice(0, 16),
    path: filePath,
    url: pathToFileURL(filePath).href,
    title,
    artist,
    album: (common.album && String(common.album).trim()) || '',
    genre: Array.isArray(common.genre) ? common.genre.join(' / ') : '',
    year: common.year || null,
    duration: Number(format.duration) || 0,
    codec: format.codec || '',
    sampleRate: format.sampleRate || 0,
    bitrate: format.bitrate || 0,
    lossless: Boolean(format.lossless),
    cover,
    isVideo,
    fileSize: stat.size,
    addedAt: Date.now(),
    lyrics: embeddedLyrics.slice(0, 60000),
  };
}

async function parseFiles(files) {
  const total = files.length;
  let done = 0;
  let errors = 0;
  let lastEmit = 0;
  const results = new Array(total);
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      const index = cursor++;
      const file = files[index];
      try {
        results[index] = await buildTrack(file);
      } catch {
        errors += 1;
        try {
          const stat = await fsp.stat(file);
          results[index] = {
            id: sha1(file).slice(0, 16),
            path: file,
            url: pathToFileURL(file).href,
            title: trimTitle(path.basename(file, path.extname(file))),
            artist: '未知艺术家',
            album: '',
            duration: 0,
            cover: '',
            isVideo: VIDEO_EXT.has(path.extname(file).toLowerCase()),
            fileSize: stat.size,
            addedAt: Date.now(),
            lyrics: '',
          };
        } catch {
          results[index] = null;
        }
      }
      done += 1;
      const now = Date.now();
      if (now - lastEmit > 60 || done === total) {
        lastEmit = now;
        send('library:scan-progress', {
          done,
          total,
          current: path.basename(file),
        });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(6, total));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    tracks: results.filter(Boolean),
    errors,
    total,
  };
}

async function importPaths(paths) {
  const files = await expandPaths(paths);
  if (!files.length) return { tracks: [], errors: 0, total: 0 };
  send('library:scan-progress', { done: 0, total: files.length, current: '正在读取文件…' });
  return parseFiles(files);
}

function loadWindowBounds() {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), 'window.json'), 'utf8');
    const bounds = JSON.parse(raw);
    if (
      Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
      bounds.width >= 900 && bounds.height >= 600
    ) {
      return bounds;
    }
  } catch {
    /* First launch. */
  }
  return null;
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  try {
    const bounds = mainWindow.isMaximized()
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'window.json'),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }),
    );
  } catch {
    /* Non-critical. */
  }
}

function broadcastWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen(),
    zoom: mainWindow.webContents.getZoomFactor(),
  });
}

function createWindow() {
  const saved = loadWindowBounds();
  const options = {
    width: saved?.width || 1320,
    height: saved?.height || 860,
    minWidth: 1000,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: '#f7fffc',
    title: 'qianqu',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  };
  if (saved?.x !== undefined && saved?.y !== undefined) {
    options.x = saved.x;
    options.y = saved.y;
  }

  mainWindow = new BrowserWindow(options);
  if (saved?.maximized) mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
  mainWindow.on('maximize', broadcastWindowState);
  mainWindow.on('unmaximize', broadcastWindowState);
  mainWindow.on('enter-full-screen', broadcastWindowState);
  mainWindow.on('leave-full-screen', broadcastWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('console-message', (event) => {
    if (SMOKE) {
      recordLog('RENDER_CONSOLE', event.message, `${event.sourceId || ''}:${event.lineNumber || ''}`);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    broadcastWindowState();
    if (SMOKE) runSmoke();
  });
}

async function runSmoke() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    await fsp.mkdir(smokeDir, { recursive: true });
    await delay(1500);
    const scenarioPath = process.env.WHALE_SMOKE_SCENARIO;
    if (scenarioPath) {
      const scenario = JSON.parse(await fsp.readFile(scenarioPath, 'utf8'));
      for (const step of scenario.steps || []) {
        if (step.js) {
          try {
            const result = await mainWindow.webContents.executeJavaScript(step.js, true);
            recordLog('SMOKE_STEP', step.name || '', JSON.stringify(result ?? null));
          } catch (error) {
            recordLog('SMOKE_STEP_ERROR', step.name || '', error);
          }
        }
        await delay(step.wait ?? 450);
        if (step.shot) {
          const image = await mainWindow.webContents.capturePage();
          await fsp.writeFile(path.join(smokeDir, step.shot), image.toPNG());
          recordLog('SMOKE_SHOT', step.shot);
        }
      }
    } else {
      const image = await mainWindow.webContents.capturePage();
      await fsp.writeFile(path.join(smokeDir, 'home.png'), image.toPNG());
    }
  } catch (error) {
    recordLog('SMOKE_ERROR', error);
  } finally {
    if (process.env.WHALE_KEEP_OPEN !== '1') app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.qianqu.player');
    Menu.setApplicationMenu(null);

    stateFile = path.join(app.getPath('userData'), 'library.json');
    coversDir = path.join(app.getPath('userData'), 'covers');
    biliLyricsCacheFile = path.join(app.getPath('userData'), 'bili-lyrics-cache.json');
    await loadBiliLyricsCache();
    await fsp.mkdir(coversDir, { recursive: true });

    protocol.handle('whale-cover', async (request) => {
      try {
        const url = new URL(request.url);
        const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/i.test(name)) {
          return new Response('Not found', { status: 404 });
        }
        const file = path.join(coversDir, name);
        const data = await fsp.readFile(file);
        const lower = name.toLowerCase();
        const type = lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        return new Response(data, {
          headers: {
            'Content-Type': type,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    protocol.handle('whale-bili', async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'stream') return new Response('Not found', { status: 404 });
        const token = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        const entry = biliStreamTargets.get(token);
        if (!entry || entry.expiresAt <= Date.now()) {
          return new Response('Stream expired', { status: 410 });
        }
        const target = entry.url;
        const parsed = new URL(target);
        if (parsed.protocol !== 'https:') {
          return new Response('Forbidden', { status: 403 });
        }
        const headers = {
          Referer: BILI_REFERER,
          Origin: BILI_REFERER,
          'User-Agent': BILI_UA,
          Accept: '*/*',
        };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const upstream = await net.fetch(target, { headers });
        if (upstream.status >= 400) {
          recordLog('BILI_PROXY', upstream.status, parsed.hostname);
        }
        const outputHeaders = new Headers();
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          const value = upstream.headers.get(name);
          if (value) outputHeaders.set(name, value);
        }
        if (outputHeaders.get('content-type') === 'video/mp4') {
          outputHeaders.set('content-type', 'audio/mp4');
        }
        outputHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: outputHeaders,
        });
      } catch (error) {
        recordLog('BILI_PROXY_ERROR', error);
        return new Response('Upstream unavailable', { status: 502 });
      }
    });

    protocol.handle('qianqu-music', async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'stream') return new Response('Not found', { status: 404 });
        const token = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        const entry = musicStreamTargets.get(token);
        if (!entry || entry.expiresAt <= Date.now()) {
          return new Response('Stream expired', { status: 410 });
        }
        const provider = getMusicProvider(entry.providerId);
        const headers = {
          Referer: provider?.referer || 'https://music.163.com/',
          'User-Agent': BILI_UA,
          Accept: '*/*',
          ...(entry.cookie ? { Cookie: entry.cookie } : {}),
        };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const upstream = await net.fetch(entry.url, { headers });
        const outputHeaders = new Headers();
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
          const value = upstream.headers.get(name);
          if (value) outputHeaders.set(name, value);
        }
        outputHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: outputHeaders,
        });
      } catch (error) {
        recordLog('MUSIC_PROXY_ERROR', error);
        return new Response('Upstream unavailable', { status: 502 });
      }
    });

    registerIpc();
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', saveWindowBounds);
}

function registerIpc() {
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  ipcMain.handle('window:zoom', (_event, action = 'reset', value = 1) => {
    if (!mainWindow) return 1;
    const contents = mainWindow.webContents;
    let factor = contents.getZoomFactor();
    if (action === 'in') factor += 0.05;
    else if (action === 'out') factor -= 0.05;
    else if (action === 'set') factor = Number(value) || 1;
    else factor = 1;
    factor = Math.min(1.4, Math.max(0.8, Math.round(factor * 20) / 20));
    contents.setZoomFactor(factor);
    broadcastWindowState();
    return factor;
  });

  ipcMain.handle('library:open-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '把音乐和视频交给 qianqu',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '所有支持的媒体', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'oga', 'mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'] },
        { name: '音频', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'oga'] },
        { name: '视频', extensions: ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'] },
      ],
    });
    if (result.canceled) return null;
    return importPaths(result.filePaths);
  });

  ipcMain.handle('library:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择音乐文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return importPaths(result.filePaths);
  });

  ipcMain.handle('library:import', async (_event, paths) => {
    if (!Array.isArray(paths) || !paths.length) return { tracks: [], errors: 0, total: 0 };
    return importPaths(paths);
  });

  ipcMain.handle('library:validate', async (_event, paths) => {
    if (!Array.isArray(paths)) return [];
    const missing = [];
    const queue = [...paths];
    async function worker() {
      while (queue.length) {
        const file = queue.shift();
        try {
          await fsp.access(file, fs.constants.R_OK);
        } catch {
          missing.push(file);
        }
      }
    }
    await Promise.all(Array.from({ length: 8 }, () => worker()));
    return missing;
  });

  ipcMain.handle('state:load', async () => {
    try {
      const raw = await fsp.readFile(stateFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle('state:save', async (_event, data) => {
    try {
      const tmp = `${stateFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(data), 'utf8');
      await fsp.rename(tmp, stateFile);
      return true;
    } catch (error) {
      recordLog('Unable to save library', error);
      return false;
    }
  });

  ipcMain.handle('lyrics:read', async (_event, filePath) => {
    if (typeof filePath !== 'string') return null;
    const base = filePath.slice(0, filePath.length - path.extname(filePath).length);
    const candidates = [`${base}.lrc`, `${base}.LRC`];
    for (const candidate of candidates) {
      try {
        const buffer = await fsp.readFile(candidate);
        let text = '';
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch {
          try {
            const iconv = require('iconv-lite');
            text = iconv.decode(buffer, 'gb18030');
          } catch {
            text = buffer.toString('utf8');
          }
        }
        text = text.replace(/^\uFEFF/, '');
        if (text.trim()) return { path: candidate, text };
      } catch {
        /* Try the next spelling. */
      }
    }
    return null;
  });
  ipcMain.handle('lyrics:search-catalog', async (_event, payload = {}) => {
    try {
      return await searchLyricCatalog(payload);
    } catch (error) {
      recordLog('LYRICS_SEARCH', error);
      return { ok: false, error: error?.message || '歌词候选搜索失败', candidates: [] };
    }
  });
  ipcMain.handle('lyrics:candidate', async (_event, payload = {}) => {
    try {
      return await getLyricCatalogCandidate(payload);
    } catch (error) {
      recordLog('LYRICS_CANDIDATE', error);
      return { ok: false, error: error?.message || '歌词获取失败' };
    }
  });

  ipcMain.handle('cover:thumbnail', async (_event, coverUrl) => {
    if (typeof coverUrl !== 'string' || !coverUrl) return null;
    try {
      const parsed = new URL(coverUrl);
      if (parsed.protocol !== 'whale-cover:') return null;
      const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/i.test(name)) return null;
      const image = nativeImage.createFromPath(path.join(coversDir, name));
      if (image.isEmpty()) return null;
      const small = image.resize({ width: 32, height: 32, quality: 'good' });
      return small.toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.handle('shell:reveal', async (_event, target) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target);
  });
  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('dialog:confirm', async (_event, options = {}) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: options.title || 'qianqu',
      message: options.message || '确定要这样做吗？',
      detail: options.detail || '',
      buttons: [options.confirmLabel || '确定', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: app.getPath('userData'),
  }));
  ipcMain.handle('music:auth-status', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    try {
      const user = await getMusicAuthUser(providerId);
      return { ok: true, loggedIn: Boolean(user), user };
    } catch (error) {
      return { ok: false, loggedIn: false, error: error?.message || '登录状态检查失败' };
    }
  });
  ipcMain.handle('music:login', async (_event, payload = {}) => {
    try {
      return await openMusicLoginWindow(String(payload?.provider || ''));
    } catch (error) {
      return { ok: false, error: error?.message || '登录窗口打开失败' };
    }
  });
  ipcMain.handle('music:logout', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    try {
      const win = musicLoginWindows.get(providerId);
      if (win && !win.isDestroyed()) win.close();
      const authSession = getMusicSession(providerId);
      await authSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || '退出登录失败' };
    }
  });
  ipcMain.handle('music:search', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    const query = String(payload?.query || '').trim().slice(0, 100);
    if (!query) return { ok: false, error: '先输入歌名、歌手或专辑', results: [] };
    try {
      return { ok: true, results: await searchMusicProvider(providerId, query) };
    } catch (error) {
      return { ok: false, error: error?.message || '搜索失败', results: [] };
    }
  });
  ipcMain.handle('music:resolve', async (_event, payload = {}) => {
    try {
      return await resolveMusicStream(String(payload?.provider || ''), String(payload?.urlId || ''));
    } catch (error) {
      return { ok: false, error: error?.message || '音频解析失败' };
    }
  });
  ipcMain.handle('music:playlists', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    try {
      return { ok: true, playlists: await getAccountPlaylists(providerId) };
    } catch (error) {
      return { ok: false, error: error?.message || '读取账号歌单失败', playlists: [] };
    }
  });
  ipcMain.handle('music:playlist', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    const playlistId = parsePlaylistId(providerId, payload?.id || payload?.url || '');
    if (!playlistId) return { ok: false, error: '缺少歌单链接或 ID', tracks: [] };
    try {
      const tracks = await getMusicPlaylistTracks(providerId, playlistId);
      return {
        ok: true,
        title: decodeBiliText(payload?.title) || `${getMusicProvider(providerId)?.name || '音乐'}歌单`,
        playlistId,
        tracks,
      };
    } catch (error) {
      return { ok: false, error: error?.message || '读取歌单失败', tracks: [] };
    }
  });
  ipcMain.handle('music:lyric', async (_event, payload = {}) => {
    const providerId = String(payload?.provider || '');
    const lyricId = String(payload?.lyricId || '');
    if (!lyricId) return { ok: false, error: '缺少歌词 ID' };
    try {
      const meting = await getMeting(providerId);
      const raw = await meting.lyric(lyricId);
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      const lrc = lyricMergeTranslation(String(data?.lyric || ''), String(data?.tlyric || ''));
      return {
        ok: Boolean(lrc.trim()),
        lrc: lrc.slice(0, 60000),
        source: `${getMusicProvider(providerId)?.name || '网络音乐'}歌词`,
      };
    } catch (error) {
      return { ok: false, error: error?.message || '歌词获取失败' };
    }
  });
  ipcMain.handle('bili:search', async (_event, payload = {}) => {
    const query = String(payload?.query || '').trim().slice(0, 80);
    if (!query) return { ok: false, error: '先输入歌名、歌手或视频标题吧', results: [] };
    const cacheKey = `bili:search:${query.toLowerCase()}`;
    const cached = biliCacheGet(cacheKey, 10 * 60 * 1000);
    if (cached) return { ok: true, results: cached, cached: true };
    try {
      const results = await searchBilibiliMusic(query);
      if (results.length) biliCacheSet(cacheKey, results);
      return { ok: true, provider: 'Bilibili 搜索', results };
    } catch (error) {
      const stale = biliCacheGet(cacheKey, 6 * 3600 * 1000);
      if (stale?.length) {
        return { ok: true, provider: 'Bilibili 搜索', results: stale, cached: true, stale: true };
      }
      return { ok: false, error: `B站搜索暂时不可用（${error?.message || '未知错误'}）`, results: [] };
    }
  });
  ipcMain.handle('bili:rank', async () => {
    try {
      return { ok: true, results: await getBilibiliRank() };
    } catch (error) {
      return { ok: false, error: `B站热歌榜暂时不可用（${error?.message || '未知错误'}）`, results: [] };
    }
  });
  ipcMain.handle('bili:new', async () => {
    try {
      return { ok: true, results: await getBilibiliNewMusic() };
    } catch (error) {
      return { ok: false, error: `B站新歌暂时不可用（${error?.message || '未知错误'}）`, results: [] };
    }
  });
  ipcMain.handle('bili:auth-status', async () => {
    try {
      const user = await getBiliAuthUser();
      return { ok: true, loggedIn: Boolean(user), user };
    } catch (error) {
      return { ok: false, loggedIn: false, error: error?.message || 'B站登录状态检查失败' };
    }
  });
  ipcMain.handle('bili:login', async () => {
    try {
      return await openBiliLoginWindow();
    } catch (error) {
      return { ok: false, error: error?.message || 'B站登录窗口打开失败' };
    }
  });
  ipcMain.handle('bili:logout', async () => {
    try {
      if (biliLoginWindow && !biliLoginWindow.isDestroyed()) biliLoginWindow.close();
      const authSession = getBiliAuthSession();
      await authSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || '退出 B 站登录失败' };
    }
  });
  ipcMain.handle('bili:fav-folders', async () => {
    try {
      return { ok: true, folders: await getBiliFavFolders() };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || '读取 B 站收藏夹失败',
        needsLogin: error?.code === -101 || /登录/.test(error?.message || ''),
      };
    }
  });
  ipcMain.handle('bili:import-folder', async (_event, payload = {}) => {
    try {
      const mediaId = String(payload?.mediaId || '').trim();
      if (!mediaId) return { ok: false, error: '缺少收藏夹 ID' };
      if (payload?.kind === 'season') {
        return await importBiliSeason(
          mediaId,
          Number(payload?.mid) || 0,
          payload?.title,
          payload?.owner,
        );
      }
      return await importBiliFavFolder(mediaId, payload?.title, payload?.type);
    } catch (error) {
      return { ok: false, error: error?.message || '导入 B 站收藏夹失败' };
    }
  });
  ipcMain.handle('bili:resolve', async (_event, payload = {}) => {
    try {
      return await resolveBilibiliAudio(
        String(payload?.bvid || ''),
        Number(payload?.cid) || null,
        Boolean(payload?.force),
      );
    } catch (error) {
      return { ok: false, error: error?.message || 'B站音频解析失败' };
    }
  });
  ipcMain.handle('bili:lyrics', async (_event, payload = {}) => {
    try {
      return await resolveBilibiliLyrics(payload, Boolean(payload?.force));
    } catch (error) {
      recordLog('BILI_LYRICS_ERROR', error);
      return { ok: false, error: error?.message || 'B站歌词获取失败' };
    }
  });
}
