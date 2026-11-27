(() => {
  'use strict';

  const bridge = window.whale;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const audio = $('#audioEl');
  const video = $('#videoEl');
  const viewRoot = $('#viewRoot');
  const viewScroll = $('#viewScroll');
  const searchInput = $('#searchInput');
  const searchWrap = $('#searchWrap');
  const stage = $('#stage');
  const lyricsEl = $('#lyrics');
  const lyricStage = $('#lyricStage');
  const lyricCanvas = $('#lyricCanvas');
  const modalRoot = $('#modalRoot');
  const contextMenu = $('#contextMenu');
  const queuePanel = $('#queuePanel');
  const toasts = $('#toasts');
  const scanBar = $('#scanBar');
  const dropOverlay = $('#dropOverlay');

  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  const MEDIA_LABEL = { mp3: 'MP3', flac: 'FLAC', wav: 'WAV', m4a: 'M4A', aac: 'AAC', ogg: 'OGG', opus: 'OPUS', mp4: 'MP4', webm: 'WEBM', mov: 'MOV', mkv: 'MKV', m4v: 'M4V', ogv: 'OGV', aiff: 'AIFF', aif: 'AIFF', oga: 'OGG' };
  const LYRIC_THEMES = [
    { id: 'tide', name: '潮汐', label: 'TIDE' },
    { id: 'lumi', name: '流光', label: 'LUMI' },
    { id: 'fume', name: '浮名', label: 'FUME' },
    { id: 'cad', name: '心象', label: 'CAD' },
    { id: 'pat', name: '云阶', label: 'PAT' },
    { id: 'cappella', name: '群唱', label: 'CAPPELLA' },
    { id: 'tilt', name: '倾诉', label: 'TILT' },
    { id: 'diorama', name: '镜台', label: 'DIORAMA' },
    { id: 'clock', name: '时计', label: 'PENDOLO' },
  ];
  const ONLINE_PROVIDERS = {
    netease: { id: 'netease', name: '网易云音乐', short: '网易云', color: '#e64a4a' },
    qq: { id: 'qq', name: 'QQ 音乐', short: 'QQ音乐', color: '#31c27c' },
    kugou: { id: 'kugou', name: '酷狗音乐', short: '酷狗', color: '#20a0ff' },
  };

  const state = {
    version: 1,
    tracks: [],
    playlists: [],
    favorites: [],
    recent: [],
    biliTracks: [],
    onlineTracks: [],
    settings: {
      volume: 0.8,
      muted: false,
      repeat: 'off',
      shuffle: false,
      speed: 1,
      layout: 'grid',
      sort: 'added',
      filter: 'all',
      lyricTheme: 'tide',
      zoom: 1,
    },
    lastPlayedId: null,
  };

  const ui = {
    view: { name: 'home', id: null },
    query: '',
    current: null,
    playing: false,
    queue: [],
    queueIndex: -1,
    queueOrigin: '',
    currentList: [],
    currentOrigin: '音乐库',
    recentOrigin: '',
    lyrics: [],
    plainLyrics: [],
    lyricsLoading: false,
    lyricsStatus: 'idle',
    lyricsMessage: '',
    lyricsDetail: '',
    lyricsRawText: '',
    lyricsRawSource: '',
    lyricIndex: -1,
    lyricsFor: null,
    lyricsToken: 0,
    remoteTracks: new Map(),
    network: {
      source: 'bilibili',
    },
    online: {
      provider: 'netease',
      query: '',
      loading: false,
      items: [],
      error: '',
      requestId: 0,
      auth: { loading: true, user: null, error: '' },
      playlists: [],
      playlistsLoading: false,
      importing: false,
      resolving: new Map(),
    },
    bili: {
      mode: 'rank',
      query: '',
      items: [],
      loading: false,
      error: '',
      searched: false,
      requestId: 0,
      rankLoaded: false,
      newLoaded: false,
      resolving: new Map(),
      auth: {
        loading: true,
        user: null,
        error: '',
      },
      folders: [],
      foldersLoading: false,
      foldersError: '',
      importing: false,
      importProgress: '',
      syncingPlaylistId: '',
      syncProgress: '',
    },
    playToken: 0,
    videoCinema: false,
    windowFullscreen: false,
    immerseOpen: false,
    immerseLineKey: '',
    immerseLitCount: -1,
    immerseRaf: null,
    immerseParticles: [],
    immerseEnergy: 0,
    immerseIdleTimer: null,
    immerseHintTimer: null,
    immerseFullBefore: false,
    immerseCanvasSize: null,
    paletteToken: 0,
    palette: null,
    audioGraph: null,
    audioGraphFailed: false,
    seekDrag: null,
    volumeDrag: false,
    ticker: null,
    saveTimer: null,
    scanHideTimer: null,
    countedId: null,
    resetScroll: false,
    menuOpenAt: 0,
    lastViewScroll: 0,
  };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                          */
  /* ------------------------------------------------------------------ */

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, className = 'icon') {
    return `<svg class="${className}"><use href="#i-${name}"></use></svg>`;
  }

  function hashString(input) {
    let hash = 2166136261;
    const text = String(input || 'whale');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  function gradientFor(seed) {
    const hash = hashString(seed);
    const h1 = hash % 360;
    const h2 = (h1 + 18) % 360;
    const h3 = (h1 + 330) % 360;
    return `linear-gradient(138deg, hsl(${h1} 78% 91%), hsl(${h2} 74% 85%) 58%, hsl(${h3} 82% 93%))`;
  }

  function stageGradientFor(seed) {
    const hash = hashString(seed);
    const h1 = hash % 360;
    const h2 = (h1 + 18) % 360;
    const h3 = (h1 + 330) % 360;
    return `linear-gradient(138deg, hsl(${h1} 40% 18%), hsl(${h2} 44% 13%) 58%, hsl(${h3} 38% 16%))`;
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor(total / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function fmtCount(value) {
    const count = Number(value) || 0;
    if (count >= 100000000) return `${(count / 100000000).toFixed(1)} 亿`;
    if (count >= 10000) return `${(count / 10000).toFixed(1)} 万`;
    return String(count);
  }

  function fmtTotal(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟';
    if (seconds < 60) return '不到 1 分钟';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  }

  function fmtDateTime(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return '还未同步';
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return '还未同步';
    }
  }

  function fmtSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    if (mb >= 10) return `${mb.toFixed(0)} MB`;
    return `${mb.toFixed(1)} MB`;
  }

  function fmtSampleRate(rate) {
    if (!rate) return '';
    return `${(rate / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
  }

  function extOf(track) {
    const name = track?.path || '';
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
  }

  function getTrack(id) {
    return state.tracks.find((track) => track.id === id) || ui.remoteTracks.get(id) || null;
  }

  function savedBiliTracks() {
    return state.biliTracks.map((record) => getTrack(record.id)).filter(Boolean);
  }

  function savedOnlineTracks() {
    return state.onlineTracks.map((record) => getTrack(record.id)).filter(Boolean);
  }

  function savedNetworkTracks() {
    return [...savedBiliTracks(), ...savedOnlineTracks()];
  }

  function getPlaylist(id) {
    return state.playlists.find((playlist) => playlist.id === id) || null;
  }

  function isFavorite(id) {
    return state.favorites.includes(id);
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了，主人';
    if (hour < 11) return '早上好，主人';
    if (hour < 14) return '中午好，主人';
    if (hour < 18) return '下午好，主人';
    return '晚上好，主人';
  }

  function coverMarkup(track, options = {}) {
    const gradient = gradientFor(track.id || track.title);
    const fallbackIcon = track.isVideo ? 'video' : 'music';
    const fallback = `<span class="cover-fallback" style="background:${gradient}"><span class="fallback-icon">${icon(fallbackIcon)}</span></span>`;
    if (track.cover) {
      return `${fallback}<img src="${esc(track.cover)}" alt="" loading="lazy" decoding="async">`;
    }
    return fallback;
  }

  function playlistCoverMarkup(playlist) {
    const first = getTrack(playlist.trackIds[0]);
    if (first && first.cover) {
      return coverMarkup(first);
    }
    const gradient = gradientFor(playlist.id + playlist.name);
    return `<span class="cover-fallback" style="background:${gradient}"><span class="fallback-icon">${icon('playlist')}</span></span>`;
  }

  function paintStaticFallbacks() {
    $$('[data-fallback]').forEach((element, index) => {
      element.style.background = gradientFor(`fallback-${index}`);
      element.innerHTML = `<span class="fallback-icon">${icon('music')}</span>`;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toasts, scanning, persistence                                      */
  /* ------------------------------------------------------------------ */

  function toast(message, kind = 'info', duration = 2800) {
    const element = document.createElement('div');
    element.className = `toast ${kind}`;
    const iconName = kind === 'error' ? 'close' : kind === 'warn' ? 'wave' : 'check';
    element.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
    toasts.appendChild(element);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    requestAnimationFrame(() => element.classList.add('show'));
    setTimeout(() => {
      element.classList.remove('show');
      setTimeout(() => element.remove(), 260);
    }, duration);
  }

  function showScan() {
    clearTimeout(ui.scanHideTimer);
    scanBar.classList.add('show');
    $('#scanFill').style.width = '0%';
    $('#scanText').textContent = '正在读取文件…';
  }

  function hideScanSoon() {
    clearTimeout(ui.scanHideTimer);
    ui.scanHideTimer = setTimeout(() => scanBar.classList.remove('show'), 900);
  }

  function updateScan(progress) {
    if (!progress) return;
    scanBar.classList.add('show');
    const percent = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
    $('#scanFill').style.width = `${percent}%`;
    const name = progress.current || '';
    $('#scanText').textContent = progress.total
      ? `正在读取 ${progress.done} / ${progress.total}${name ? ` · ${name}` : ''}`
      : name || '正在读取文件…';
    if (progress.done >= progress.total && progress.total > 0) {
      $('#scanFill').style.width = '100%';
      hideScanSoon();
    }
  }

  function scheduleSave() {
    clearTimeout(ui.saveTimer);
    ui.saveTimer = setTimeout(saveNow, 320);
  }

  function saveNow() {
    if (!bridge?.saveState) return;
    const payload = {
      ...state,
      tracks: state.tracks.map((track) => ({
        ...track,
        lyrics: track.lyrics ? String(track.lyrics).slice(0, 20000) : '',
      })),
    };
    bridge.saveState(payload).catch(() => {});
  }

  function normalizeLoadedState(raw) {
    if (!raw || typeof raw !== 'object') return;
    if (Array.isArray(raw.tracks)) {
      state.tracks = raw.tracks.filter((track) => track && typeof track.path === 'string');
    }
    if (Array.isArray(raw.biliTracks)) {
      hydrateBiliTracks(raw.biliTracks);
    }
    if (Array.isArray(raw.onlineTracks)) {
      hydrateOnlineTracks(raw.onlineTracks);
    }
    if (Array.isArray(raw.playlists)) {
      state.playlists = raw.playlists
        .filter((playlist) => playlist && typeof playlist.id === 'string')
        .map((playlist) => ({
          id: playlist.id,
          name: playlist.name || '未命名歌单',
          trackIds: Array.isArray(playlist.trackIds) ? playlist.trackIds.filter((id) => getTrack(id)) : [],
          createdAt: playlist.createdAt || Date.now(),
          source: ['bilibili', 'netease', 'qq', 'kugou'].includes(playlist.source) ? playlist.source : undefined,
          sourceId: playlist.sourceId ? String(playlist.sourceId) : undefined,
          sourceKind: playlist.sourceKind === 'season' ? 'season' : 'folder',
          sourceTitle: playlist.sourceTitle ? String(playlist.sourceTitle) : undefined,
          sourceMid: Number(playlist.sourceMid) || undefined,
          sourceOwner: playlist.sourceOwner ? String(playlist.sourceOwner) : undefined,
          importedAt: Number(playlist.importedAt) || undefined,
        }));
    }
    if (Array.isArray(raw.favorites)) {
      state.favorites = raw.favorites.filter((id) => getTrack(id));
    }
    if (Array.isArray(raw.recent)) {
      state.recent = raw.recent.filter((id) => getTrack(id)).slice(0, 60);
    }
    if (raw.settings && typeof raw.settings === 'object') {
      Object.assign(state.settings, raw.settings);
    }
    state.settings.volume = Math.min(1, Math.max(0, Number(state.settings.volume)));
    if (!Number.isFinite(state.settings.volume)) state.settings.volume = 0.8;
    state.settings.speed = [0.75, 1, 1.25, 1.5, 2].includes(Number(state.settings.speed)) ? Number(state.settings.speed) : 1;
    if (!['off', 'all', 'one'].includes(state.settings.repeat)) state.settings.repeat = 'off';
    if (!['grid', 'list'].includes(state.settings.layout)) state.settings.layout = 'grid';
    if (!LYRIC_THEMES.some((theme) => theme.id === state.settings.lyricTheme)) state.settings.lyricTheme = 'tide';
    state.settings.zoom = Math.min(1.4, Math.max(0.8, Number(state.settings.zoom) || 1));
    if (raw.lastPlayedId && getTrack(raw.lastPlayedId)) state.lastPlayedId = raw.lastPlayedId;
  }

  /* ------------------------------------------------------------------ */
  /* Filtering / sorting                                                */
  /* ------------------------------------------------------------------ */

  function visibleLibraryTracks(mode = 'library') {
    if (mode === 'videos') return state.tracks.filter((track) => track.isVideo);
    if (mode === 'favorites') {
      return [...state.tracks, ...savedNetworkTracks()].filter((track) => isFavorite(track.id));
    }
    if (mode === 'recent') {
      return state.recent.map((id) => getTrack(id)).filter(Boolean);
    }
    const filter = state.settings.filter;
    if (filter === 'audio') return state.tracks.filter((track) => !track.isVideo);
    if (filter === 'video') return state.tracks.filter((track) => track.isVideo);
    if (filter === 'fav') {
      return [...state.tracks, ...savedNetworkTracks()].filter((track) => isFavorite(track.id));
    }
    return state.tracks.slice();
  }

  function sortTracks(tracks, mode = 'library') {
    const list = tracks.slice();
    if (mode === 'recent') return list;
    const sort = state.settings.sort;
    if (sort === 'title') list.sort((a, b) => collator.compare(a.title, b.title));
    else if (sort === 'artist') list.sort((a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title));
    else if (sort === 'duration') list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    else if (sort === 'plays') list.sort((a, b) => (b.plays || 0) - (a.plays || 0) || (b.addedAt || 0) - (a.addedAt || 0));
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }

  function searchTracks(query) {
    const needle = query.trim().toLocaleLowerCase('zh-Hans-CN');
    if (!needle) return [];
    return [...state.tracks, ...savedNetworkTracks()].filter((track) => {
      const haystack = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLocaleLowerCase('zh-Hans-CN');
      return haystack.includes(needle);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Rendering: shared pieces                                           */
  /* ------------------------------------------------------------------ */

  function trackCard(track) {
    const current = ui.current?.id === track.id;
    return `
      <article class="track-card ${current ? 'is-current' : ''}" data-track-id="${esc(track.id)}">
        <div class="card-cover" data-action="play" data-id="${esc(track.id)}" title="播放 ${esc(track.title)}">
          ${coverMarkup(track)}
          ${track.source === 'bilibili'
            ? '<span class="card-badge bili">B站</span>'
            : track.isVideo ? `<span class="card-badge">${icon('video')}VIDEO</span>` : ''}
          ${track.missing ? '<span class="missing-badge">文件丢失</span>' : ''}
          <span class="card-duration">${fmtTime(track.duration)}</span>
          <button class="card-play" data-action="play" data-id="${esc(track.id)}" aria-label="播放 ${esc(track.title)}">${icon('play')}</button>
          <button class="card-more" data-action="menu" data-id="${esc(track.id)}" aria-label="更多操作">${icon('more')}</button>
        </div>
        <button class="card-title" data-action="play" data-id="${esc(track.id)}" title="${esc(track.title)}">${current ? '<span class="current-dot"></span>' : ''}${esc(track.title)}</button>
        <span class="card-artist" title="${esc(track.artist)}">${esc(track.artist)}</span>
      </article>`;
  }

  function trackList(tracks) {
    const rows = tracks.map((track, index) => {
      const current = ui.current?.id === track.id;
      return `
        <div class="list-row ${current ? 'is-current' : ''}" data-track-id="${esc(track.id)}" data-action="play" data-id="${esc(track.id)}">
          <div class="list-index"><span class="idx-num">${String(index + 1).padStart(2, '0')}</span><span class="idx-play">${icon('play')}</span></div>
          <div class="list-title-cell">
            <div class="row-cover">${coverMarkup(track)}</div>
            <div class="list-text">
              <span class="list-title" title="${esc(track.title)}">${current ? '<span class="current-dot"></span>' : ''}${esc(track.title)}</span>
              <span class="list-artist">${esc(track.artist)}${track.missing ? ' · 文件丢失' : ''}</span>
            </div>
          </div>
          <span class="list-album" title="${esc(track.album)}">${esc(track.album || '—')}</span>
          <span class="list-duration">${fmtTime(track.duration)}</span>
          <button class="list-more" data-action="menu" data-id="${esc(track.id)}" aria-label="更多操作">${icon('more')}</button>
        </div>`;
    }).join('');

    return `
      <div class="track-list">
        <div class="list-head"><span>#</span><span>标题</span><span>专辑</span><span>时长</span><span></span></div>
        ${rows}
      </div>`;
  }

  function emptyState({ iconName = 'sparkles', title, text, actions = [] }) {
    const buttons = actions.map((action, index) => {
      const className = index === 0 ? 'round-play' : 'soft-btn';
      return `<button class="${className}" data-action="${action.action}">${action.icon ? icon(action.icon) : ''}<span>${esc(action.label)}</span></button>`;
    }).join('');
    return `
      <div class="empty">
        <div class="empty-art">${icon(iconName)}</div>
        <h3>${esc(title)}</h3>
        <p>${text}</p>
        ${buttons ? `<div class="empty-actions">${buttons}</div>` : ''}
      </div>`;
  }

  function pageHead({ eyebrow, title, subtitle, actions = '' }) {
    return `
      <div class="page-head">
        <div>
          <div class="eyebrow">${esc(eyebrow)}</div>
          <h1 class="page-title">${esc(title)}</h1>
          <p class="page-sub">${subtitle}</p>
        </div>
        ${actions ? `<div class="head-actions">${actions}</div>` : ''}
      </div>`;
  }

  function allPlayActions(list, label) {
    if (!list.length) return '';
    return `
      <button class="soft-btn" data-action="shuffle-all">${icon('shuffle')}<span>随机</span></button>
      <button class="round-play" data-action="play-all">${icon('play')}<span>播放全部</span></button>`;
  }

  function toolbar({ chips = false, count = 0 }) {
    const chipDefs = [
      ['all', '全部'],
      ['audio', '音乐'],
      ['video', '视频'],
      ['fav', '收藏'],
    ];
    return `
      <div class="toolbar">
        <div class="chips">
          ${chips ? chipDefs.map(([key, label]) => `<button class="chip ${state.settings.filter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`).join('') : `<span class="page-sub">${count} 首曲目</span>`}
        </div>
        <div class="toolbar-right">
          <div class="select-wrap">
            ${icon('sort')}
            <select id="sortSelect" aria-label="排序方式">
              <option value="added" ${state.settings.sort === 'added' ? 'selected' : ''}>最近添加</option>
              <option value="title" ${state.settings.sort === 'title' ? 'selected' : ''}>标题</option>
              <option value="artist" ${state.settings.sort === 'artist' ? 'selected' : ''}>艺术家</option>
              <option value="duration" ${state.settings.sort === 'duration' ? 'selected' : ''}>时长</option>
              <option value="plays" ${state.settings.sort === 'plays' ? 'selected' : ''}>播放次数</option>
            </select>
            <span class="select-caret">${icon('chevron-down')}</span>
          </div>
          <div class="view-toggle">
            <button class="${state.settings.layout === 'grid' ? 'active' : ''}" data-layout="grid" aria-label="网格视图">${icon('grid')}</button>
            <button class="${state.settings.layout === 'list' ? 'active' : ''}" data-layout="list" aria-label="列表视图">${icon('list')}</button>
          </div>
        </div>
      </div>`;
  }

  function setPlaybackContext(list, origin) {
    ui.currentList = list.map((track) => track.id);
    ui.currentOrigin = origin;
  }

  function renderTracks(list) {
    if (!list.length) return '';
    return state.settings.layout === 'list' ? trackList(list) : `<div class="track-grid">${list.map(trackCard).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering: pages                                                   */
  /* ------------------------------------------------------------------ */

  function renderHome() {
    const totalDuration = state.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    const videoCount = state.tracks.filter((track) => track.isVideo).length;
    const audioCount = state.tracks.length - videoCount;
    const latest = sortTracks(state.tracks, 'library').slice(0, 6);
    const recentTracks = state.recent.map((id) => getTrack(id)).filter(Boolean).slice(0, 5);

    let html = `
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-kicker"><span class="dot"></span>YOUR MUSIC, YOUR MOMENT</div>
          <h1>${esc(greeting())}</h1>
          <p>${state.tracks.length ? '这里很安静，正好适合听点什么。你的音乐和视频都好好地收在 qianqu 里。' : '把喜欢的音乐和视频放进来，qianqu 会替你把它们收好。干净、安静，只留下声音。'}</p>
          <div class="hero-actions">
            ${state.tracks.length
              ? `<button class="hero-play" data-action="hero-random">${icon('play')}<span>随便听听</span></button>
                 <button class="hero-ghost" data-action="add-folder">${icon('folder')}<span>添加文件夹</span></button>`
              : `<button class="hero-play" data-action="add-files">${icon('plus')}<span>添加音乐</span></button>
                 <button class="hero-ghost" data-action="add-folder">${icon('folder')}<span>扫描文件夹</span></button>`}
          </div>
          <div class="hero-stats">
            <div class="stat"><b>${audioCount}</b><span>首音乐</span></div>
            <div class="stat"><b>${videoCount}</b><span>个视频</span></div>
            <div class="stat"><b>${fmtTotal(totalDuration)}</b><span>总时长</span></div>
          </div>
        </div>
        <div class="hero-art">
          <div class="hero-orb"></div>
          <div class="hero-portrait"><img src="../assets/brand-mark.png" alt=""></div>
          <div class="hero-wave"></div>
        </div>
      </section>`;

    if (!state.tracks.length) {
      html += emptyState({
        iconName: 'wave',
        title: '这里还很安静',
        text: '拖入文件或文件夹，也可以从电脑里慢慢挑选。<br>支持 MP3、FLAC、WAV、M4A、OGG、MP4、WebM、MOV 等常见格式。',
        actions: [
          { label: '添加文件', action: 'add-files', icon: 'plus' },
          { label: '添加文件夹', action: 'add-folder', icon: 'folder' },
        ],
      });
      return html;
    }

    setPlaybackContext(latest, '最近添加');
    html += `
      <section class="section">
        <div class="section-head">
          <div>
            <h2 class="section-title">最近添加</h2>
            <p class="section-sub">刚游进qianqu的声音</p>
          </div>
          <button class="link-btn" data-action="go-library">查看全部 ${icon('arrow-right')}</button>
        </div>
        <div class="track-grid">${latest.map(trackCard).join('')}</div>
      </section>
      <div class="home-bottom">
        <div class="glass-card">
          <div class="card-head">
            <h3>继续听</h3>
            ${recentTracks.length ? `<button class="link-btn" data-action="go-recent">最近播放 ${icon('arrow-right')}</button>` : ''}
          </div>
          ${recentTracks.length
            ? `<div class="mini-list">${recentTracks.map((track, index) => miniRow(track, index)).join('')}</div>`
            : `<div class="empty" style="min-height:170px;padding:20px"><p>播放过的歌曲会安静地待在这里。</p><button class="soft-btn" data-action="hero-random">${icon('play')}<span>随便听听</span></button></div>`}
        </div>
        <div class="glass-card">
          <div class="card-head"><h3>快捷入口</h3></div>
          <div class="quick-grid">
            <button class="quick-card" data-action="add-files">${icon('plus')}<div><strong>添加音乐</strong><span>把新声音带进来</span></div></button>
            <button class="quick-card" data-action="go-videos">${icon('video')}<div><strong>视频影院</strong><span>${videoCount} 个视频</span></div></button>
            <button class="quick-card" data-action="go-favorites">${icon('heart')}<div><strong>我的收藏</strong><span>${state.favorites.length} 首喜欢</span></div></button>
            <button class="quick-card" data-action="go-network">${icon('globe')}<div><strong>网络音乐</strong><span>B站 / 网易云 / QQ / 酷狗</span></div></button>
          </div>
        </div>
      </div>`;
    return html;
  }

  function miniRow(track, index) {
    return `
      <button class="mini-row" data-action="play" data-context="recent" data-id="${esc(track.id)}">
        <span class="row-num">${String(index + 1).padStart(2, '0')}</span>
        <span class="mini-thumb">${coverMarkup(track)}</span>
        <span class="mini-text"><strong>${esc(track.title)}</strong><span>${esc(track.artist)}</span></span>
        <span class="mini-time">${fmtTime(track.duration)}</span>
      </button>`;
  }

  function renderLibrary(mode) {
    const list = sortTracks(visibleLibraryTracks(mode), mode);
    const originMap = { library: '音乐库', videos: '视频', favorites: '我的收藏', recent: '最近播放' };
    const titleMap = { library: '音乐库', videos: '视频', favorites: '我的收藏', recent: '最近播放' };
    const eyebrowMap = { library: 'LIBRARY', videos: 'CINEMA', favorites: 'FAVORITES', recent: 'HISTORY' };
    const subtitle = `${list.length} 首 · ${fmtTotal(list.reduce((sum, track) => sum + (track.duration || 0), 0))}`;
    const chips = mode === 'library';
    const showAllPlay = mode !== 'recent' && list.length > 0;
    setPlaybackContext(list, originMap[mode] || '音乐库');

    let html = pageHead({
      eyebrow: eyebrowMap[mode] || 'LIBRARY',
      title: titleMap[mode] || '音乐库',
      subtitle,
      actions: showAllPlay ? allPlayActions(list, originMap[mode]) : '',
    });
    html += toolbar({ chips, count: list.length });

    if (!list.length) {
      if (mode === 'favorites') {
        html += emptyState({
          iconName: 'heart',
          title: '还没有收藏',
          text: '听到喜欢的歌，点一下播放器旁边的爱心。',
          actions: [{ label: '去音乐库', action: 'go-library', icon: 'library' }],
        });
      } else if (mode === 'videos') {
        html += emptyState({
          iconName: 'video',
          title: '影院还没有开场',
          text: '添加 MP4、WebM 或 MOV 视频，qianqu会在这里为你放映。',
          actions: [
            { label: '添加视频', action: 'add-files', icon: 'plus' },
            { label: '扫描文件夹', action: 'add-folder', icon: 'folder' },
          ],
        });
      } else if (mode === 'recent') {
        html += emptyState({
          iconName: 'clock',
          title: '还没有播放记录',
          text: '随便点一首，让海面有一点声音。',
          actions: [{ label: '去音乐库', action: 'go-library', icon: 'library' }],
        });
      } else {
        html += emptyState({
          iconName: 'wave',
          title: '音乐库还是空的',
          text: '添加音乐或视频，或者把整个文件夹交给qianqu。<br>支持 MP3、FLAC、WAV、M4A、OGG、MP4、WebM、MOV 等格式。',
          actions: [
            { label: '添加文件', action: 'add-files', icon: 'plus' },
            { label: '添加文件夹', action: 'add-folder', icon: 'folder' },
          ],
        });
      }
    } else {
      html += renderTracks(list);
    }
    return html;
  }

  function renderSearch() {
    const list = sortTracks(searchTracks(ui.query), 'library');
    setPlaybackContext(list, '搜索结果');
    let html = pageHead({
      eyebrow: 'SEARCH',
      title: `“${ui.query}”`,
      subtitle: `找到 ${list.length} 个结果 · ${fmtTotal(list.reduce((sum, track) => sum + (track.duration || 0), 0))}`,
      actions: list.length ? allPlayActions(list, '搜索结果') : '',
    });
    if (!list.length) {
      html += emptyState({
        iconName: 'search',
        title: '没有找到',
        text: '换个关键词试试，或者去音乐库里看看。',
        actions: [
          { label: '清空搜索', action: 'clear-search', icon: 'close' },
          { label: '去音乐库', action: 'go-library', icon: 'library' },
        ],
      });
    } else {
      html += `<div class="toolbar"><div class="chips"><span class="page-sub">${list.length} 首曲目</span></div><div class="toolbar-right"><div class="view-toggle"><button class="${state.settings.layout === 'grid' ? 'active' : ''}" data-layout="grid" aria-label="网格视图">${icon('grid')}</button><button class="${state.settings.layout === 'list' ? 'active' : ''}" data-layout="list" aria-label="列表视图">${icon('list')}</button></div></div></div>`;
      html += renderTracks(list);
    }
    return html;
  }

  function biliToRemote(item) {
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || 'Bilibili 音乐',
      duration: Number(item.duration) || 0,
      addedAt: Number(item.addedAt) || 0,
      cover: item.cover || '',
      url: '',
      pageUrl: item.pageUrl || `https://www.bilibili.com/video/${item.bvid}`,
      license: item.license || 'Bilibili 音频',
      source: 'bilibili',
      sourceLabel: 'BILIBILI',
      bvid: item.bvid,
      cid: item.cid || null,
      lyricOffset: Number(item.lyricOffset) || 0,
      customLyrics: item.customLyrics || '',
      customLyricsSource: item.customLyricsSource || '',
      customLyricTitle: item.customLyricTitle || '',
      customLyricArtist: item.customLyricArtist || '',
      needsStream: true,
      isVideo: false,
      isRemote: true,
    };
  }

  function biliRecordFromTrack(track) {
    return {
      id: track.id,
      bvid: track.bvid,
      cid: track.cid || null,
      lyricOffset: Number(track.lyricOffset) || 0,
      customLyrics: track.customLyrics || '',
      customLyricsSource: track.customLyricsSource || '',
      customLyricTitle: track.customLyricTitle || '',
      customLyricArtist: track.customLyricArtist || '',
      title: track.title,
      artist: track.artist,
      album: track.album || 'Bilibili 音乐',
      duration: Number(track.duration) || 0,
      cover: track.cover || '',
      pageUrl: track.pageUrl || `https://www.bilibili.com/video/${track.bvid}`,
      source: 'bilibili',
      sourceLabel: 'BILIBILI',
      license: track.license || 'Bilibili 音频',
      kind: track.kind || 'music',
      addedAt: Number(track.addedAt) || Date.now(),
    };
  }

  function rememberBiliTrack(track) {
    if (!track || track.source !== 'bilibili' || !track.bvid) return;
    const record = biliRecordFromTrack(track);
    const index = state.biliTracks.findIndex((item) => item.id === track.id);
    if (index >= 0) {
      state.biliTracks[index] = {
        ...state.biliTracks[index],
        ...record,
        addedAt: state.biliTracks[index].addedAt || record.addedAt,
      };
    } else {
      state.biliTracks.push(record);
    }
    if (state.biliTracks.length > 300) {
      const keep = new Set([
        ...state.favorites,
        ...state.recent,
        ...state.playlists.flatMap((playlist) => playlist.trackIds),
      ]);
      const referenced = state.biliTracks.filter((item) => keep.has(item.id));
      const idleLimit = Math.max(0, 300 - referenced.length);
      const idleIds = new Set(
        state.biliTracks
          .filter((item) => !keep.has(item.id))
          .slice(-idleLimit)
          .map((item) => item.id),
      );
      state.biliTracks = state.biliTracks.filter(
        (item) => keep.has(item.id) || idleIds.has(item.id),
      );
    }
  }

  function hydrateBiliTracks(records) {
    for (const record of records) {
      if (!record?.id || !record?.bvid) continue;
      if (!ui.remoteTracks.has(record.id)) {
        const track = biliToRemote(record);
        track.url = '';
        track.needsStream = true;
        ui.remoteTracks.set(track.id, track);
      }
      if (!state.biliTracks.some((item) => item.id === record.id)) {
        state.biliTracks.push(biliRecordFromTrack(record));
      }
    }
  }

  function onlineToRemote(record) {
    return {
      id: record.id,
      source: record.source || record.providerId || 'netease',
      sourceLabel: record.sourceLabel || ONLINE_PROVIDERS[record.providerId]?.short || '网络音乐',
      providerId: record.providerId || record.source,
      rawId: record.rawId || '',
      urlId: record.urlId || '',
      lyricId: record.lyricId || record.urlId || '',
      title: record.title || '未知曲目',
      artist: record.artist || '未知歌手',
      album: record.album || '',
      duration: Number(record.duration) || 0,
      cover: record.cover || '',
      pageUrl: record.pageUrl || '',
      url: '',
      needsStream: true,
      isRemote: true,
      isVideo: false,
      license: record.license || '网络音乐',
      lyricOffset: Number(record.lyricOffset) || 0,
      customLyrics: record.customLyrics || '',
      customLyricsSource: record.customLyricsSource || '',
      customLyricTitle: record.customLyricTitle || '',
      customLyricArtist: record.customLyricArtist || '',
    };
  }

  function onlineRecordFromTrack(track) {
    return {
      id: track.id,
      source: track.source,
      sourceLabel: track.sourceLabel,
      providerId: track.providerId || track.source,
      rawId: track.rawId || '',
      urlId: track.urlId || '',
      lyricId: track.lyricId || '',
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      duration: Number(track.duration) || 0,
      cover: track.cover || '',
      pageUrl: track.pageUrl || '',
      license: track.license || '网络音乐',
      lyricOffset: Number(track.lyricOffset) || 0,
      customLyrics: track.customLyrics || '',
      customLyricsSource: track.customLyricsSource || '',
      customLyricTitle: track.customLyricTitle || '',
      customLyricArtist: track.customLyricArtist || '',
    };
  }

  function rememberOnlineTrack(track) {
    if (!track?.id || !track.providerId || track.providerId === 'bilibili') return;
    const record = onlineRecordFromTrack(track);
    const index = state.onlineTracks.findIndex((item) => item.id === track.id);
    if (index >= 0) {
      state.onlineTracks[index] = {
        ...state.onlineTracks[index],
        ...record,
        addedAt: state.onlineTracks[index].addedAt || Date.now(),
      };
    } else {
      state.onlineTracks.push({ ...record, addedAt: Date.now() });
    }
  }

  function hydrateOnlineTracks(records) {
    for (const record of records) {
      if (!record?.id || !record?.providerId) continue;
      if (!ui.remoteTracks.has(record.id)) {
        ui.remoteTracks.set(record.id, onlineToRemote(record));
      }
      if (!state.onlineTracks.some((item) => item.id === record.id)) {
        state.onlineTracks.push({ ...onlineRecordFromTrack(record), addedAt: record.addedAt || Date.now() });
      }
    }
  }

  function registerOnlineTracks(items) {
    for (const item of items) {
      const existing = ui.remoteTracks.get(item.id);
      if (existing) {
        Object.assign(existing, {
          title: item.title || existing.title,
          artist: item.artist || existing.artist,
          album: item.album || existing.album,
          duration: Number(item.duration) || existing.duration,
          cover: item.cover || existing.cover,
          pageUrl: item.pageUrl || existing.pageUrl,
        });
      } else {
        ui.remoteTracks.set(item.id, onlineToRemote(item));
      }
    }
  }

  function registerBiliTracks(items) {
    for (const item of items) {
      const existing = ui.remoteTracks.get(item.id);
      if (existing) {
        existing.title = item.title;
        existing.artist = item.artist;
        existing.album = item.album || existing.album;
        existing.duration = Number(item.duration) || existing.duration;
        existing.cover = item.cover || existing.cover;
        existing.bvid = item.bvid;
        existing.cid = item.cid || existing.cid;
        existing.lyricOffset = Number(item.lyricOffset) || existing.lyricOffset || 0;
        if (item.customLyrics) {
          existing.customLyrics = item.customLyrics;
          existing.customLyricsSource = item.customLyricsSource || existing.customLyricsSource;
          existing.customLyricTitle = item.customLyricTitle || existing.customLyricTitle;
          existing.customLyricArtist = item.customLyricArtist || existing.customLyricArtist;
        }
        existing.pageUrl = item.pageUrl || existing.pageUrl;
        if (state.biliTracks.some((record) => record.id === item.id)) rememberBiliTrack(existing);
      } else {
        ui.remoteTracks.set(item.id, biliToRemote(item));
      }
    }
  }

  function renderNetworkRow(item) {
    const track = ui.remoteTracks.get(item.id) || biliToRemote(item);
    const current = ui.current?.id === item.id;
    const playing = current && ui.playing;
    const favorite = isFavorite(item.id);
    const sub = [item.artist, item.album].filter(Boolean).map(esc).join(' · ');
    const biliDuration = Number(item.duration) > 0 ? fmtTime(item.duration) : '--:--';
    return `
      <div class="network-row ${current ? 'is-current' : ''}" data-action="play-net" data-net-id="${esc(item.id)}" role="button" tabindex="0">
        <span class="network-cover">${coverMarkup(track)}<span class="network-badge">B站</span></span>
        <span class="network-info">
          <strong title="${esc(item.title)}">${esc(item.title)}</strong>
          <span title="${esc(sub)}">${sub || '未知歌手'}</span>
        </span>
        <span class="network-duration" title="Bilibili 完整音轨"><b>${biliDuration}</b><small>${item.kind === 'music' ? 'B站音乐' : 'B站视频'}</small></span>
        <span class="network-actions">
          <button class="network-fav ${favorite ? 'active' : ''}" data-action="bili-favorite" data-net-id="${esc(item.id)}" title="${favorite ? '取消收藏' : '收藏到 qianqu'}" aria-label="${favorite ? '取消收藏' : '收藏到 qianqu'}">${icon(favorite ? 'heart-fill' : 'heart')}</button>
          <button class="network-play" data-action="play-net" data-net-id="${esc(item.id)}" aria-label="${playing ? '暂停' : '播放'} ${esc(item.title)}">${icon(playing ? 'pause' : 'play')}</button>
          ${item.pageUrl ? `<button class="network-open" data-action="open-net-source" data-net-id="${esc(item.id)}" title="打开来源页面" aria-label="打开来源页面">${icon('external')}</button>` : ''}
        </span>
      </div>`;
  }

  function renderNetworkSkeleton(count = 5) {
    return `<div class="network-list network-loading">${Array.from({ length: count }, () => `
      <div class="network-row skeleton-row">
        <span class="network-cover skeleton"></span>
        <span class="network-info"><i class="skeleton line-lg"></i><i class="skeleton line-sm"></i></span>
        <span class="network-duration skeleton line-sm"></span>
        <span class="network-actions skeleton circle"></span>
      </div>`).join('')}</div>`;
  }

  function networkSourceButtons(source) {
    const button = (id, label, iconName) => `
      <button class="network-source ${source === id ? 'active' : ''}" data-action="net-source" data-source="${id}">
        ${icon(iconName)}<span>${label}</span>
      </button>`;
    return `<div class="network-sources">
      ${button('bilibili', 'Bilibili', 'video')}
      ${button('netease', '网易云', 'music')}
      ${button('qq', 'QQ 音乐', 'music')}
      ${button('kugou', '酷狗', 'music')}
    </div>`;
  }

  function renderBiliNetworkResults(bili) {
    if (bili.loading) return renderNetworkSkeleton();
    if (bili.error) {
      return `
        <div class="network-state">
          <div class="network-state-icon">${icon('wave')}</div>
          <h3>B站这次没连上</h3>
          <p>${esc(bili.error)}</p>
          <button class="soft-btn" data-action="bili-retry">${icon('repeat')}<span>再试一次</span></button>
        </div>`;
    }
    if (bili.mode === 'search' && bili.searched && !bili.items.length) {
      return `
        <div class="network-state">
          <div class="network-state-icon">${icon('search')}</div>
          <h3>没有找到合适的音轨</h3>
          <p>B 站没有返回可播放的结果。换一个歌名或歌手再试试；也可能被地区或版权限制。</p>
        </div>`;
    }
    if (bili.items.length) {
      const heading = bili.mode === 'rank'
        ? 'Bilibili 热歌榜'
        : bili.mode === 'new'
          ? 'Bilibili 新歌速递'
          : `“${esc(bili.query)}”`;
      const meta = bili.mode === 'search'
        ? `${bili.items.length} 个结果 · 完整音轨`
        : `${bili.items.length} 首 · 自动更新`;
      return `
        <div class="network-result-head">
          <strong>${heading}</strong>
          <span>${meta}</span>
        </div>
        <div class="network-list">${bili.items.map(renderNetworkRow).join('')}</div>`;
    }
    return `
      <div class="network-state idle">
        <div class="network-state-icon">${icon('video')}</div>
        <h3>B站的声音在这里</h3>
        <p>先看看热歌榜或新歌速递，也可以直接搜歌名。播放时只解析音频流，不会加载视频画面。</p>
      </div>`;
  }

  function renderNetwork() {
    const source = ['bilibili', 'netease', 'qq', 'kugou'].includes(ui.network.source)
      ? ui.network.source
      : 'bilibili';
    if (source !== 'bilibili') return renderOnlineNetwork(source);
    const active = ui.bili;
    let html = pageHead({
      eyebrow: 'NETWORK',
      title: '网络音乐',
      subtitle: '搜索 B 站音乐视频，或直接看热歌榜与新歌；播放独立音频流。',
    });
    html += `
      <section class="network-hero">
        ${networkSourceButtons(source)}
        <div class="network-kicker">${icon('video')}<span>BILIBILI · MUSIC SOURCE</span></div>
        <h2>把 B 站的声音收进 qianqu</h2>
        <p>搜索 B 站音乐视频，或直接看热歌榜 / 新歌。播放时自动解析独立音频流，不加载视频画面。</p>
        <div class="network-search">
          <span class="network-search-icon">${icon('search')}</span>
          <input id="netQuery" class="network-input" type="text" maxlength="80" value="${esc(active.query)}" placeholder="搜索 B 站歌名、UP主或视频标题…" autocomplete="off" spellcheck="false">
          <button class="network-go" data-action="net-search" ${active.loading ? 'disabled' : ''}>
            ${active.loading ? '<span class="spinner"></span><span>搜索中</span>' : `${icon('search')}<span>搜索</span>`}
          </button>
        </div>
        <div class="network-modes">
          <button class="network-mode ${ui.bili.mode === 'search' ? 'active' : ''}" data-action="bili-mode" data-mode="search">${icon('search')}<span>搜索</span></button>
          <button class="network-mode ${ui.bili.mode === 'rank' ? 'active' : ''}" data-action="bili-mode" data-mode="rank">${icon('sparkles')}<span>热歌榜</span></button>
          <button class="network-mode ${ui.bili.mode === 'new' ? 'active' : ''}" data-action="bili-mode" data-mode="new">${icon('plus')}<span>新歌</span></button>
          <button class="network-mode action" data-action="bili-import" ${ui.bili.importing || ui.bili.foldersLoading ? 'disabled' : ''}>${icon('download')}<span>收藏夹/合集</span></button>
        </div>
        <div class="network-note">${icon('video')}<span>音轨来自 Bilibili 视频，清晰度取决于原视频；qianqu 不保存视频文件。</span></div>
      </section>`;
    html += renderBiliAccount();
    if (ui.bili.importing || ui.bili.foldersLoading) {
      const progressText = ui.bili.importing
        ? (ui.bili.importProgress || '正在导入…')
        : '正在读取收藏夹 / 合集…';
      html += `<div class="bili-import-strip"><span class="spinner"></span><span>${esc(progressText)}</span></div>`;
    }
    html += renderBiliNetworkResults(ui.bili);
    return html;
  }

  function playNetworkTrack(id) {
    const item = findNetworkItem(id);
    if (item?.source === 'bilibili') {
      playBiliItem(id);
      return;
    }
    if (item && ONLINE_PROVIDERS[item.source]) {
      playOnlineItem(id);
      return;
    }
  }

  function findNetworkItem(id) {
    return ui.bili.items.find((item) => item.id === id)
      || ui.online.items.find((item) => item.id === id)
      || null;
  }

  function searchActiveNetwork(rawQuery) {
    if (ui.network.source === 'bilibili') return searchBilibili(rawQuery);
    return searchOnlineProvider(rawQuery);
  }

  function setNetworkSource(source) {
    if (!['bilibili', 'netease', 'qq', 'kugou'].includes(source)) return;
    ui.network.source = source;
    if (source === 'bilibili' && !ui.bili.items.length && !ui.bili.loading) {
      loadBiliMode(ui.bili.mode || 'rank');
      return;
    }
    if (source !== 'bilibili') {
      ui.online.provider = source;
      ui.online.query = '';
      ui.online.items = [];
      ui.online.error = '';
      ui.online.auth = { loading: true, user: null, error: '' };
      refreshOnlineAuth(source);
    }
    render();
  }

  function setBiliMode(mode) {
    if (mode === 'search') {
      ui.bili.mode = 'search';
      render();
      requestAnimationFrame(() => $('#netQuery')?.focus());
      return;
    }
    loadBiliMode(mode);
  }

  async function loadBiliMode(mode, force = false) {
    if (!['rank', 'new'].includes(mode)) return;
    ui.bili.mode = mode;
    ui.bili.query = '';
    const loaded = mode === 'rank' ? ui.bili.rankLoaded : ui.bili.newLoaded;
    if (loaded && !force) {
      render();
      return;
    }
    const token = ++ui.bili.requestId;
    ui.bili.loading = true;
    ui.bili.error = '';
    ui.bili.items = [];
    render();
    let response = null;
    try {
      response = mode === 'rank' ? await bridge.biliRank() : await bridge.biliNew();
    } catch {
      response = { ok: false, error: '请求没有送达，请稍后再试' };
    }
    if (token !== ui.bili.requestId) return;
    ui.bili.loading = false;
    if (!response?.ok) {
      ui.bili.error = response?.error || 'B站接口暂时不可用';
    } else {
      ui.bili.items = Array.isArray(response.results) ? response.results : [];
      registerBiliTracks(ui.bili.items);
      if (mode === 'rank') ui.bili.rankLoaded = true;
      else ui.bili.newLoaded = true;
    }
    render();
  }

  async function searchBilibili(rawQuery) {
    const query = String(rawQuery ?? '').trim();
    if (!query) {
      toast('先输入歌名、UP主或视频标题吧', 'warn');
      $('#netQuery')?.focus();
      return;
    }
    ui.bili.mode = 'search';
    ui.bili.query = query;
    ui.bili.searched = true;
    const token = ++ui.bili.requestId;
    ui.bili.loading = true;
    ui.bili.error = '';
    ui.bili.items = [];
    render();
    let response = null;
    try {
      response = await bridge.biliSearch(query);
    } catch {
      response = { ok: false, error: '搜索请求没有送达，请稍后再试' };
    }
    if (token !== ui.bili.requestId) return;
    ui.bili.loading = false;
    if (!response?.ok) {
      ui.bili.error = response?.error || 'B站搜索失败';
    } else {
      ui.bili.items = Array.isArray(response.results) ? response.results : [];
      registerBiliTracks(ui.bili.items);
    }
    render();
  }

  async function refreshOnlineAuth(providerId = ui.online.provider, showToast = false) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider || !bridge?.musicAuthStatus) return;
    ui.online.provider = providerId;
    ui.online.auth.loading = true;
    if (ui.view.name === 'network' && ui.network.source === providerId) render();
    try {
      const response = await bridge.musicAuthStatus(providerId);
      ui.online.auth.user = response?.loggedIn ? response.user : null;
      ui.online.auth.error = response?.ok ? '' : (response?.error || '登录状态检查失败');
    } catch {
      ui.online.auth.user = null;
      ui.online.auth.error = '登录状态检查失败';
    } finally {
      ui.online.auth.loading = false;
      if (ui.view.name === 'network' && ui.network.source === providerId) render();
      if (showToast) {
        if (ui.online.auth.user) toast(`已登录 ${provider.name}：${ui.online.auth.user.name}`);
        else if (ui.online.auth.error) toast(ui.online.auth.error, 'warn');
      }
    }
  }

  async function loginOnlineProvider(providerId = ui.online.provider) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider || ui.online.auth.loading) return;
    ui.online.auth.loading = true;
    ui.online.auth.error = '';
    if (ui.view.name === 'network' && ui.network.source === providerId) render();
    try {
      const response = await bridge.musicLogin(providerId);
      if (response?.ok && response.user) {
        ui.online.auth.user = response.user;
        toast(`已登录 ${provider.name}：${response.user.name}`);
      } else if (!response?.canceled) {
        ui.online.auth.error = response?.error || `${provider.name}登录失败`;
        toast(ui.online.auth.error, 'warn');
      }
    } catch {
      ui.online.auth.error = '登录窗口没有正常打开';
      toast(ui.online.auth.error, 'warn');
    } finally {
      ui.online.auth.loading = false;
      if (ui.view.name === 'network' && ui.network.source === providerId) render();
    }
  }

  async function logoutOnlineProvider(providerId = ui.online.provider) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider) return;
    await bridge.musicLogout(providerId).catch(() => {});
    ui.online.auth.user = null;
    ui.online.auth.error = '';
    toast(`已退出 ${provider.name}`);
    if (ui.view.name === 'network' && ui.network.source === providerId) render();
  }

  async function searchOnlineProvider(rawQuery) {
    const query = String(rawQuery ?? '').trim();
    const provider = ui.online.provider;
    if (!query) {
      toast('先输入歌名、歌手或专辑吧', 'warn');
      $('#netQuery')?.focus();
      return;
    }
    const token = ++ui.online.requestId;
    ui.online.query = query;
    ui.online.loading = true;
    ui.online.error = '';
    ui.online.items = [];
    render();
    let response = null;
    try {
      response = await bridge.musicSearch(provider, query);
    } catch {
      response = { ok: false, error: '搜索请求没有送达' };
    }
    if (token !== ui.online.requestId) return;
    ui.online.loading = false;
    if (!response?.ok) {
      ui.online.error = response?.error || '搜索失败';
    } else {
      ui.online.items = Array.isArray(response.results) ? response.results : [];
      registerOnlineTracks(ui.online.items);
    }
    render();
  }

  function playOnlineItem(id) {
    const item = ui.online.items.find((entry) => entry.id === id);
    if (!item) return;
    registerOnlineTracks(ui.online.items);
    if (ui.current?.id === id) {
      togglePlay();
      return;
    }
    const ids = ui.online.items.map((entry) => entry.id).filter(Boolean);
    if (!ids.includes(id)) ids.unshift(id);
    playWithContext(ids, id, ONLINE_PROVIDERS[ui.online.provider]?.name || '网络音乐');
  }

  function toggleOnlineFavorite(id) {
    let track = getTrack(id);
    if (!track) {
      const item = ui.online.items.find((entry) => entry.id === id);
      if (!item) return;
      track = onlineToRemote(item);
      ui.remoteTracks.set(track.id, track);
    }
    toggleFavorite(track.id);
    if (ui.view.name === 'network' && !ui.query) render();
  }

  function upsertOnlinePlaylist(providerId, title, sourceId, tracks) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider) return null;
    const id = String(sourceId || `${providerId}-${Date.now()}`);
    let playlist = state.playlists.find((item) => item.source === providerId && String(item.sourceId) === id);
    if (!playlist) {
      playlist = {
        id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${provider.short} · ${title || '导入歌单'}`,
        trackIds: [],
        createdAt: Date.now(),
        source: providerId,
        sourceKind: 'online',
        sourceId: id,
        sourceTitle: title || '导入歌单',
        importedAt: Date.now(),
      };
      state.playlists.push(playlist);
    }
    const ids = tracks.map((track) => track.id).filter(Boolean);
    playlist.trackIds = [...new Set([...playlist.trackIds, ...ids])];
    playlist.sourceTitle = title || playlist.sourceTitle;
    playlist.importedAt = Date.now();
    for (const track of tracks) {
      ui.remoteTracks.set(track.id, track);
      rememberOnlineTrack(track);
    }
    return playlist;
  }

  async function importOnlinePlaylist(providerId, reference, title) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider) return;
    ui.online.importing = true;
    if (ui.view.name === 'network' && ui.network.source === providerId) render();
    try {
      const response = await bridge.musicPlaylist({
        provider: providerId,
        id: reference,
        title,
      });
      if (!response?.ok || !response.tracks?.length) {
        throw new Error(response?.error || '这个歌单没有可播放曲目');
      }
      const tracks = response.tracks.map((track) => onlineToRemote(track));
      const playlist = upsertOnlinePlaylist(providerId, response.title || title, response.playlistId || reference, tracks);
      scheduleSave();
      renderSidebarPlaylists();
      if (playlist) switchView('playlist', playlist.id);
      toast(`已导入 ${provider.short} 歌单，共 ${tracks.length} 首`);
    } catch (error) {
      toast(error?.message || '歌单导入失败', 'warn', 4200);
    } finally {
      ui.online.importing = false;
      if (ui.view.name === 'network' && ui.network.source === providerId) render();
    }
  }

  function openOnlineImportModal(providerId = ui.online.provider) {
    const provider = ONLINE_PROVIDERS[providerId];
    if (!provider) return;
    openModal({
      title: `导入 ${provider.name} 歌单`,
      body: `
        <p>可以粘贴歌单链接或 ID。登录后还可以读取账号里的歌单列表；部分平台只开放公开歌单。</p>
        <div class="field">
          <label for="onlinePlaylistRef">歌单链接 / ID</label>
          <input id="onlinePlaylistRef" type="text" maxlength="200" placeholder="粘贴歌单链接，或直接填歌单 ID" autocomplete="off">
        </div>
        <div class="lyric-picker-status" id="onlinePlaylistStatus">${ui.online.auth.user ? '正在读取账号歌单…' : '未登录也可以粘贴公开歌单链接'}</div>
        <div class="lyric-candidate-list" id="onlinePlaylistList"></div>
      `,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '导入',
          kind: 'primary',
          onClick: (close) => {
            const input = $('#onlinePlaylistRef');
            const reference = String(input?.value || '').trim();
            const title = input?.dataset.title || '';
            if (!reference) {
              toast('先粘贴歌单链接或 ID', 'warn');
              return;
            }
            close();
            importOnlinePlaylist(providerId, reference, title);
          },
        },
      ],
      onMount: async () => {
        const list = $('#onlinePlaylistList');
        const status = $('#onlinePlaylistStatus');
        const input = $('#onlinePlaylistRef');
        if (!ui.online.auth.user) return;
        try {
          const response = await bridge.musicPlaylists(providerId);
          const playlists = Array.isArray(response.playlists) ? response.playlists : [];
          status.textContent = playlists.length
            ? `找到 ${playlists.length} 个账号歌单`
            : '账号歌单没有返回，也可以粘贴歌单链接';
          list.innerHTML = playlists.map((item) => `
            <button class="lyric-candidate" type="button" data-online-plist="${esc(item.id)}" data-online-title="${esc(item.title)}">
              <span class="provider">${esc(provider.short)}</span>
              <strong>${esc(item.title)}</strong>
              <small>${item.trackCount || 0} 首</small>
            </button>`).join('');
          list.addEventListener('click', (event) => {
            const button = event.target.closest('[data-online-plist]');
            if (!button) return;
            input.value = button.dataset.onlinePlist;
            input.dataset.title = button.dataset.onlineTitle || '';
            status.textContent = `已选择：${button.dataset.onlineTitle || button.dataset.onlinePlist}`;
          });
        } catch (error) {
          status.textContent = error?.message || '账号歌单读取失败，可以粘贴链接导入';
        }
      },
    });
  }

  async function refreshBiliAuth(showToast = false) {
    if (!bridge?.biliAuthStatus) return;
    ui.bili.auth.loading = true;
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    try {
      const response = await bridge.biliAuthStatus();
      if (response?.ok) {
        ui.bili.auth.user = response.user || null;
        ui.bili.auth.error = '';
      } else {
        ui.bili.auth.user = null;
        ui.bili.auth.error = response?.error || '登录状态检查失败';
      }
    } catch {
      ui.bili.auth.user = null;
      ui.bili.auth.error = '登录状态检查失败';
    } finally {
      ui.bili.auth.loading = false;
      if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
      if (showToast) {
        if (ui.bili.auth.user) toast(`已登录 B 站：${ui.bili.auth.user.uname}`);
        else if (ui.bili.auth.error) toast(ui.bili.auth.error, 'warn');
      }
    }
  }

  async function loginBili() {
    if (ui.bili.auth.loading) return;
    ui.bili.auth.loading = true;
    ui.bili.auth.error = '';
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    try {
      const response = await bridge.biliLogin();
      if (response?.ok && response.user) {
        ui.bili.auth.user = response.user;
        ui.bili.auth.error = '';
        toast(`已登录 B 站：${response.user.uname}`);
      } else if (response?.canceled) {
        toast('已取消 B 站登录');
      } else {
        ui.bili.auth.error = response?.error || 'B 站登录失败';
        toast(ui.bili.auth.error, 'warn');
      }
    } catch {
      ui.bili.auth.error = 'B 站登录窗口没有正常打开';
      toast(ui.bili.auth.error, 'warn');
    } finally {
      ui.bili.auth.loading = false;
      if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    }
  }

  async function logoutBili() {
    const ok = await bridge.confirm({
      title: '退出 B 站登录',
      message: '确定退出qianqu里的 B 站账号吗？',
      detail: '只会清除qianqu的 B 站登录状态，不会影响浏览器里的 B 站账号，也不会删除已经导入的歌单。',
      confirmLabel: '退出登录',
    });
    if (!ok) return;
    await bridge.biliLogout().catch(() => {});
    ui.bili.auth.user = null;
    ui.bili.auth.error = '';
    ui.bili.folders = [];
    toast('已退出 B 站登录');
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
  }

  function renderBiliAccount() {
    const auth = ui.bili.auth;
    if (auth.loading) {
      return `
        <section class="bili-account is-loading">
          <span class="spinner"></span>
          <div class="bili-account-copy">
            <span class="bili-account-label">B 站账号</span>
            <strong>正在检查登录状态…</strong>
          </div>
        </section>`;
    }
    if (!auth.user) {
      return `
        <section class="bili-account">
          <span class="bili-account-icon">${icon('user')}</span>
          <div class="bili-account-copy">
            <span class="bili-account-label">B 站账号</span>
            <strong>登录后可以导入收藏夹和订阅合集</strong>
            <small>${auth.error ? esc(auth.error) : '在 B 站官方页面登录，qianqu只保存登录 Cookie，不接触你的密码。'}</small>
          </div>
          <div class="bili-account-actions">
            <button class="soft-btn" data-action="bili-login">${icon('user')}<span>登录 B 站</span></button>
            ${auth.error ? `<button class="icon-btn" data-action="bili-auth-retry" title="重新检查登录状态" aria-label="重新检查登录状态">${icon('repeat')}</button>` : ''}
          </div>
        </section>`;
    }
    return `
      <section class="bili-account is-in">
        <span class="bili-avatar">${icon('user')}${auth.user.face ? `<img src="${esc(auth.user.face)}" alt="">` : ''}</span>
        <div class="bili-account-copy">
          <span class="bili-account-label">已登录 B 站</span>
          <strong>${esc(auth.user.uname || 'B 站用户')}</strong>
          <small>UID ${auth.user.mid || '-'}${auth.user.level ? ` · LV${auth.user.level}` : ''}</small>
        </div>
        <div class="bili-account-actions">
          <button class="round-play bili-import-btn" data-action="bili-import" ${ui.bili.importing || ui.bili.foldersLoading ? 'disabled' : ''}>
            ${icon('download')}<span>${ui.bili.foldersLoading ? '读取中…' : ui.bili.importing ? '导入中…' : '导入收藏夹/合集'}</span>
          </button>
          <button class="soft-btn bili-logout-btn" data-action="bili-logout" title="退出 B 站登录">退出</button>
        </div>
      </section>`;
  }

  async function openBiliImportModal() {
    if (ui.bili.importing || ui.bili.foldersLoading) return;
    if (!ui.bili.auth.user) {
      await loginBili();
      if (!ui.bili.auth.user) return;
    }
    ui.bili.foldersLoading = true;
    ui.bili.foldersError = '';
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    let response = null;
    try {
      response = await bridge.biliFavFolders();
    } catch {
      response = { ok: false, error: '读取收藏夹 / 合集请求没有送达' };
    }
    ui.bili.foldersLoading = false;
    if (!response?.ok) {
      ui.bili.foldersError = response?.error || '读取收藏夹 / 合集失败';
      if (response?.needsLogin || /登录/.test(ui.bili.foldersError)) {
        ui.bili.auth.user = null;
        toast('B 站登录已失效，请重新登录', 'warn');
      } else {
        toast(ui.bili.foldersError, 'warn');
      }
      if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
      return;
    }
    ui.bili.folders = Array.isArray(response.folders) ? response.folders : [];
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    if (!ui.bili.folders.length) {
      const mid = ui.bili.auth.user?.mid;
      openModal({
        title: 'B 站收藏夹 / 合集',
        body: '<p>没有读到可导入的收藏夹或订阅合集。先去 B 站创建一个收藏夹、订阅一个合集，或者确认内容不是空的。</p>',
        actions: [
          { label: '取消', onClick: (close) => close() },
          {
            label: '打开 B 站收藏夹',
            kind: 'primary',
            onClick: (close) => {
              close();
              if (mid) bridge.openExternal(`https://space.bilibili.com/${mid}/favlist`);
            },
          },
        ],
      });
      return;
    }
    openBiliFolderPicker();
  }

  function openBiliFolderPicker() {
    const folders = ui.bili.folders;
    const usable = folders.filter((folder) => Number(folder.mediaCount) > 0 && folder.title !== '该合集已失效');
    const folderItems = usable.filter((folder) => folder.kind !== 'season');
    const seasonItems = usable.filter((folder) => folder.kind === 'season');
    const renderPick = (folder) => {
      const key = `${folder.kind || 'folder'}:${folder.id}`;
      const subtitle = folder.kind === 'season'
        ? `${folder.mediaCount || 0} 个视频 · 合集订阅${folder.owner ? ` · ${esc(folder.owner)}` : ''}`
        : `${folder.mediaCount || 0} 个视频${folder.type === 'collected' ? ` · 来自 ${esc(folder.owner || 'B 站用户')}` : ' · 自建收藏夹'}`;
      return `
        <label class="bili-folder-pick">
          <input type="checkbox" data-folder-key="${esc(key)}" ${folder.mediaCount ? '' : 'disabled'}>
          <span class="bili-folder-cover">${coverMarkup({ id: `bili-folder-${key}`, cover: folder.cover, isVideo: false })}</span>
          <span class="bili-folder-info">
            <strong>${esc(folder.title)}</strong>
            <small>${subtitle}</small>
          </span>
        </label>`;
    };
    openModal({
      title: '导入 B 站收藏夹 / 合集',
      body: `
        <p>可以选择自建收藏夹、收藏的他人收藏夹，或订阅的视频合集。导入后会新建对应的本地歌单，只保存曲目信息，不下载音频文件。</p>
        <div class="bili-folder-list">
          ${folderItems.length ? `<div class="bili-pick-group">收藏夹</div>${folderItems.map(renderPick).join('')}` : ''}
          ${seasonItems.length ? `<div class="bili-pick-group">订阅合集</div>${seasonItems.map(renderPick).join('')}` : ''}
        </div>
        <div class="bili-folder-foot">
          <button class="soft-btn" id="biliSelectAll" type="button">全选</button>
          <span id="biliPickCount">已选 0 个</span>
        </div>`,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '导入所选',
          kind: 'primary',
          onClick: (close) => {
            const selected = $$('input[data-folder-key]:checked', $('#modalBody'))
              .map((input) => {
                const key = input.dataset.folderKey;
                return folders.find((folder) => `${folder.kind || 'folder'}:${folder.id}` === key);
              })
              .filter(Boolean);
            if (!selected.length) {
              toast('先选择一个收藏夹或合集吧', 'warn');
              return;
            }
            close();
            importBiliFolders(selected);
          },
        },
      ],
      onMount: () => {
        const body = $('#modalBody');
        const count = $('#biliPickCount');
        const update = () => {
          const selected = $$('input[data-folder-key]:checked', body).length;
          if (count) count.textContent = `已选 ${selected} 个`;
        };
        $$('input[data-folder-key]', body).forEach((input) => input.addEventListener('change', update));
        $('#biliSelectAll')?.addEventListener('click', () => {
          const boxes = $$('input[data-folder-key]:not(:disabled)', body);
          const allChecked = boxes.length > 0 && boxes.every((box) => box.checked);
          boxes.forEach((box) => { box.checked = !allChecked; });
          update();
        });
      },
    });
  }

  function upsertBiliPlaylist(folder, tracks, options = {}) {
    const sourceId = String(folder.id);
    const sourceKind = folder.kind === 'season' ? 'season' : 'folder';
    let playlist = state.playlists.find(
      (item) => item.source === 'bilibili'
        && String(item.sourceId) === sourceId
        && (item.sourceKind === 'season' ? 'season' : 'folder') === sourceKind,
    );
    let created = false;
    if (!playlist) {
      const baseName = sourceKind === 'season' ? `B站合集 · ${folder.title}` : `B站 · ${folder.title}`;
      let name = baseName;
      let suffix = 2;
      while (state.playlists.some((item) => item.name === name)) {
        name = `${baseName} (${suffix})`;
        suffix += 1;
      }
      playlist = {
        id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        trackIds: [],
        createdAt: Date.now(),
        source: 'bilibili',
        sourceId,
        sourceKind,
        sourceTitle: folder.title,
        sourceMid: Number(folder.mid) || 0,
        sourceOwner: folder.owner || '',
        importedAt: Date.now(),
      };
      state.playlists.push(playlist);
      created = true;
    }
    playlist.sourceKind = sourceKind;
    playlist.sourceMid = Number(folder.mid) || playlist.sourceMid || 0;
    playlist.sourceOwner = folder.owner || playlist.sourceOwner || '';
    const ids = tracks.map((track) => track.id).filter(Boolean);
    const previousIds = playlist.trackIds.slice();
    const previousSet = new Set(previousIds);
    const remoteSet = new Set(ids);
    const added = ids.filter((id) => !previousSet.has(id)).length;
    const removed = options.replace
      ? previousIds.filter((id) => {
          const track = getTrack(id);
          return track?.source === 'bilibili' && !remoteSet.has(id);
        }).length
      : 0;
    if (options.replace) {
      const extras = previousIds.filter((id) => {
        const track = getTrack(id);
        return track && track.source !== 'bilibili';
      });
      playlist.trackIds = [...new Set([...ids, ...extras])];
    } else {
      playlist.trackIds = [...new Set([...previousIds, ...ids])];
    }
    playlist.sourceTitle = folder.title;
    playlist.importedAt = Date.now();
    for (const item of tracks) {
      const track = ui.remoteTracks.get(item.id) || biliToRemote(item);
      ui.remoteTracks.set(item.id, track);
      rememberBiliTrack(track);
    }
    return {
      playlist,
      created,
      added,
      removed,
      total: ids.length,
      extras: playlist.trackIds.length - ids.length,
    };
  }

  async function importBiliFolders(folders) {
    ui.bili.importing = true;
    ui.bili.importProgress = `正在导入 0/${folders.length}`;
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    const importedPlaylists = [];
    const errors = [];
    let totalTracks = 0;
    let truncated = false;
    for (let index = 0; index < folders.length; index += 1) {
      const folder = folders[index];
      ui.bili.importProgress = `正在导入 ${index + 1}/${folders.length} · ${folder.title}`;
      if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
      let response = null;
      try {
        response = await bridge.biliImportFolder({
          mediaId: folder.id,
          title: folder.title,
          type: folder.type,
          kind: folder.kind || 'folder',
          mid: folder.mid || 0,
          owner: folder.owner || '',
        });
      } catch {
        response = { ok: false, error: '导入请求没有送达' };
      }
      if (!response?.ok) {
        errors.push(`${folder.title}：${response?.error || '导入失败'}`);
        continue;
      }
      const tracks = Array.isArray(response.tracks) ? response.tracks : [];
      if (!tracks.length) {
        errors.push(`${folder.title}：没有可播放的视频条目`);
        continue;
      }
      truncated = truncated || Boolean(response.truncated);
      const { playlist } = upsertBiliPlaylist(folder, tracks);
      importedPlaylists.push(playlist);
      totalTracks += tracks.length;
      scheduleSave();
      renderSidebarPlaylists();
    }
    ui.bili.importing = false;
    ui.bili.importProgress = '';
    scheduleSave();
    renderSidebarPlaylists();
    if (ui.view.name === 'network' && ui.network.source === 'bilibili') render();
    if (!importedPlaylists.length) {
      toast(errors[0] || '没有导入任何内容', 'warn');
      if (errors.length > 1) {
        openModal({
          title: '导入结果',
          body: `<div class="bili-import-errors">${errors.map((error) => `<p>${esc(error)}</p>`).join('')}</div>`,
          actions: [{ label: '知道了', kind: 'primary', onClick: (close) => close() }],
        });
      }
      return;
    }
    switchView('playlist', importedPlaylists[0].id);
    const importedFolders = importedPlaylists.filter((item) => item.sourceKind !== 'season').length;
    const importedSeasons = importedPlaylists.filter((item) => item.sourceKind === 'season').length;
    const importedParts = [];
    if (importedFolders) importedParts.push(`${importedFolders} 个收藏夹`);
    if (importedSeasons) importedParts.push(`${importedSeasons} 个订阅合集`);
    toast(`已导入${importedParts.join('、')}，共 ${totalTracks} 首${truncated ? '（单次最多 500 首）' : ''}`);
    if (errors.length) {
      openModal({
        title: '部分内容没有导入',
        body: `<p>这些收藏夹或合集没有导入成功：</p><div class="bili-import-errors">${errors.map((error) => `<p>${esc(error)}</p>`).join('')}</div>`,
        actions: [{ label: '知道了', kind: 'primary', onClick: (close) => close() }],
      });
    }
  }

  async function syncBiliPlaylist(playlistId) {
    const playlist = getPlaylist(playlistId);
    if (!playlist || playlist.source !== 'bilibili' || !playlist.sourceId) return;
    if (ui.bili.syncingPlaylistId) return;
    if (!ui.bili.auth.user) {
      await loginBili();
      if (!ui.bili.auth.user) return;
    }
    ui.bili.syncingPlaylistId = playlistId;
    ui.bili.syncProgress = '正在读取 B 站来源…';
    if (ui.view.name === 'playlist' && ui.view.id === playlistId) render();
    let response = null;
    try {
      response = await bridge.biliImportFolder({
        mediaId: playlist.sourceId,
        title: playlist.sourceTitle || playlist.name,
        type: 'created',
        kind: playlist.sourceKind || 'folder',
        mid: playlist.sourceMid || 0,
        owner: playlist.sourceOwner || '',
      });
    } catch {
      response = { ok: false, error: '更新请求没有送达' };
    }
    ui.bili.syncingPlaylistId = '';
    ui.bili.syncProgress = '';
    if (!response?.ok) {
      const error = response?.error || '更新 B 站歌单失败';
      if (/登录|失效/.test(error)) {
        ui.bili.auth.user = null;
        ui.bili.auth.error = error;
      }
      toast(error, 'warn', 4200);
      if (ui.view.name === 'playlist' && ui.view.id === playlistId) render();
      return { ok: false, error };
    }
    const tracks = Array.isArray(response.tracks) ? response.tracks : [];
    const folder = response.folder || {
      id: playlist.sourceId,
      title: playlist.sourceTitle || playlist.name,
    };
    const stats = upsertBiliPlaylist(folder, tracks, { replace: true });
    scheduleSave();
    renderSidebarPlaylists();
    if (ui.view.name === 'playlist' && ui.view.id === playlistId) render();
    const changes = [];
    if (stats.added) changes.push(`新增 ${stats.added} 首`);
    if (stats.removed) changes.push(`移除 ${stats.removed} 首`);
    const suffix = changes.length ? changes.join('，') : '没有曲目变化';
    toast(`「${playlist.name}」已同步：${suffix}，当前 ${stats.total} 首${response.truncated ? '（单次最多 500 首）' : ''}`);
    return { ok: true, ...stats, truncated: Boolean(response.truncated) };
  }

  function ensureBiliStream(track, force = false) {
    if (track.url && !force) return Promise.resolve(track);
    if (ui.bili.resolving.has(track.id)) return ui.bili.resolving.get(track.id);
    const promise = bridge.biliResolve(track.bvid, track.cid, force || Boolean(track.streamRetry))
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error || 'B站音频解析失败');
        track.url = result.proxyUrl || result.streamUrl;
        if (result.duration) track.duration = result.duration;
        if (!track.cover && result.cover) track.cover = result.cover;
        track.qualityLabel = result.qualityLabel || '';
        track.needsStream = false;
        if (state.biliTracks.some((record) => record.id === track.id)) rememberBiliTrack(track);
        return track;
      })
      .finally(() => ui.bili.resolving.delete(track.id));
    ui.bili.resolving.set(track.id, promise);
    return promise;
  }

  function ensureOnlineStream(track, force = false) {
    if (track.url && !force) return Promise.resolve(track);
    if (ui.online.resolving.has(track.id)) return ui.online.resolving.get(track.id);
    const promise = bridge.musicResolve(track.providerId || track.source, track.urlId)
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error || '音频解析失败');
        track.url = result.proxyUrl || result.url;
        track.qualityLabel = result.qualityLabel || '';
        track.needsStream = false;
        track.streamRetry = 0;
        if (state.onlineTracks.some((record) => record.id === track.id)) rememberOnlineTrack(track);
        return track;
      })
      .finally(() => ui.online.resolving.delete(track.id));
    ui.online.resolving.set(track.id, promise);
    return promise;
  }

  function ensureRemoteStream(track, force = false) {
    if (track.source === 'bilibili') return ensureBiliStream(track, force);
    if (ONLINE_PROVIDERS[track.source]) return ensureOnlineStream(track, force);
    return Promise.reject(new Error('不支持的音源'));
  }

  function playBiliItem(id) {
    const item = ui.bili.items.find((entry) => entry.id === id);
    if (!item) return;
    registerBiliTracks(ui.bili.items);
    if (ui.current?.id === id) {
      if (ui.current.needsStream) {
        toast('正在解析这首歌的音频，稍等一下喵', 'warn');
        return;
      }
      togglePlay();
      if (ui.view.name === 'network' && !ui.query) render();
      return;
    }
    const ids = ui.bili.items.map((entry) => entry.id).filter(Boolean);
    if (!ids.includes(id)) ids.unshift(id);
    playWithContext(ids, id, 'Bilibili 音乐');
    if (ui.view.name === 'network' && !ui.query) render();
  }

  function renderPlaylistPage() {
    const playlist = getPlaylist(ui.view.id);
    if (!playlist) {
      ui.view = { name: 'library', id: null };
      return renderLibrary('library');
    }
    const tracks = playlist.trackIds.map(getTrack).filter(Boolean);
    setPlaybackContext(tracks, playlist.name);
    const duration = fmtTotal(tracks.reduce((sum, track) => sum + (track.duration || 0), 0));
    const hue = hashString(playlist.id) % 360;
    const syncing = playlist.source === 'bilibili' && ui.bili.syncingPlaylistId === playlist.id;
    const onlineProvider = ONLINE_PROVIDERS[playlist.source] || null;

    let html = `
      <section class="playlist-hero" style="--pl-glow: hsla(${hue}, 70%, 60%, 0.2)">
        <div class="playlist-cover">${playlistCoverMarkup(playlist)}</div>
        <div class="playlist-meta">
          <div class="eyebrow">${playlist.source === 'bilibili' ? 'BILIBILI PLAYLIST' : 'PLAYLIST'}</div>
          <h1>${esc(playlist.name)}</h1>
          <p>${tracks.length} 首曲目 · ${duration}${playlist.source === 'bilibili' ? `${playlist.sourceKind === 'season' && playlist.sourceOwner ? ` · ${esc(playlist.sourceOwner)}` : ''} · 上次同步 ${fmtDateTime(playlist.importedAt)}` : ''}</p>
          ${playlist.source === 'bilibili' ? `<div class="bili-playlist-badge">${syncing ? '<span class="spinner"></span>' : icon('download')}<span>${syncing ? esc(ui.bili.syncProgress || '正在更新…') : (playlist.sourceKind === 'season' ? '从 B 站订阅合集导入' : '从 B 站收藏夹导入')}</span></div>` : ''}
          ${onlineProvider ? `<div class="bili-playlist-badge">${icon('music')}<span>从 ${esc(onlineProvider.name)} 导入 · ${fmtDateTime(playlist.importedAt)}</span></div>` : ''}
          <div class="playlist-actions">
            ${tracks.length ? `<button class="round-play" data-action="play-all">${icon('play')}<span>播放全部</span></button>
            <button class="soft-btn" data-action="shuffle-all">${icon('shuffle')}<span>随机播放</span></button>` : ''}
            ${playlist.source === 'bilibili' ? `<button class="soft-btn" data-action="sync-bili-playlist" ${syncing ? 'disabled' : ''}>${icon('repeat')}<span>${syncing ? '更新中…' : '更新 B 站歌单'}</span></button>` : ''}
            <button class="soft-btn" data-action="rename-playlist">${icon('lyrics')}<span>重命名</span></button>
            <button class="icon-btn" data-action="delete-playlist" title="删除歌单" aria-label="删除歌单">${icon('trash')}</button>
          </div>
        </div>
      </section>`;

    if (!tracks.length) {
      html += emptyState({
        iconName: 'playlist',
        title: '歌单还空着',
        text: '去音乐库里点开歌曲右侧的菜单，把它放进这个歌单。',
        actions: [{ label: '去音乐库', action: 'go-library', icon: 'library' }],
      });
    } else {
      html += `<div class="toolbar"><div class="chips"><span class="page-sub">${tracks.length} 首曲目</span></div><div class="toolbar-right"><div class="view-toggle"><button class="${state.settings.layout === 'grid' ? 'active' : ''}" data-layout="grid" aria-label="网格视图">${icon('grid')}</button><button class="${state.settings.layout === 'list' ? 'active' : ''}" data-layout="list" aria-label="列表视图">${icon('list')}</button></div></div></div>`;
      html += renderTracks(tracks);
    }
    return html;
  }

  /* ------------------------------------------------------------------ */
  /* Main render                                                        */
  /* ------------------------------------------------------------------ */

  function render() {
    const previousScroll = viewScroll.scrollTop;
    updateSidebar();

    let html;
    if (ui.query) {
      html = renderSearch();
    } else {
      switch (ui.view.name) {
        case 'library':
          html = renderLibrary('library');
          break;
        case 'videos':
          html = renderLibrary('videos');
          break;
        case 'favorites':
          html = renderLibrary('favorites');
          break;
        case 'recent':
          html = renderLibrary('recent');
          break;
        case 'network':
          html = renderNetwork();
          break;
        case 'playlist':
          html = renderPlaylistPage();
          break;
        default:
          html = renderHome();
      }
    }

    viewRoot.innerHTML = html;
    viewScroll.scrollTop = ui.resetScroll ? 0 : previousScroll;
    ui.resetScroll = false;
    updateSidebar();
    refreshCurrentMarkers();
  }

  function updateSidebar() {
    const activeName = ui.query ? '' : ui.view.name;
    $$('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.nav === activeName);
    });
    $$('.playlist-item').forEach((item) => {
      item.classList.toggle('active', activeName === 'playlist' && item.dataset.playlist === ui.view.id);
    });
    $('#navLibCount').textContent = state.tracks.length;
    $('#navVideoCount').textContent = state.tracks.filter((track) => track.isVideo).length;
    $('#navFavCount').textContent = state.favorites.length;
  }

  function renderSidebarPlaylists() {
    const list = $('#playlistList');
    if (!state.playlists.length) {
      list.innerHTML = '<div class="playlist-empty">还没有歌单，点上面的 + 创建一个。</div>';
    } else {
      list.innerHTML = state.playlists.map((playlist) => `
        <button class="playlist-item ${ui.view.name === 'playlist' && ui.view.id === playlist.id ? 'active' : ''}" data-playlist="${esc(playlist.id)}">
          ${icon('disc')}<span>${esc(playlist.name)}</span><em>${playlist.trackIds.length}</em>
        </button>`).join('');
    }
    $$('.playlist-item').forEach((item) => {
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const playlist = getPlaylist(item.dataset.playlist);
        if (playlist) showPlaylistMenu(playlist, event.clientX, event.clientY);
      });
    });
    updateSidebar();
  }

  function switchView(name, id = null) {
    if (stage.classList.contains('open')) closeStage();
    ui.view = { name, id };
    ui.query = '';
    if (searchInput) searchInput.value = '';
    searchWrap?.classList.remove('has-value');
    ui.resetScroll = true;
    render();
  }

  function refreshCurrentMarkers() {
    $$('[data-track-id]').forEach((element) => {
      const current = ui.current && element.dataset.trackId === ui.current.id;
      element.classList.toggle('is-current', Boolean(current));
      const title = element.querySelector('.card-title, .list-title');
      if (title) {
        const dot = title.querySelector('.current-dot');
        if (current && !dot) title.insertAdjacentHTML('afterbegin', '<span class="current-dot"></span>');
        if (!current && dot) dot.remove();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Playback                                                           */
  /* ------------------------------------------------------------------ */

  function currentMedia() {
    return ui.current?.isVideo ? video : audio;
  }

  function otherMedia() {
    return ui.current?.isVideo ? audio : video;
  }

  function applyVolume() {
    const volume = Math.min(1, Math.max(0, state.settings.volume));
    for (const media of [audio, video]) {
      media.volume = volume;
      media.muted = Boolean(state.settings.muted);
    }
    $('#volFill').style.width = `${volume * 100}%`;
    document.body.classList.toggle('is-muted', Boolean(state.settings.muted) || volume === 0);
    $('#btnMute').setAttribute('aria-label', state.settings.muted ? '取消静音' : '静音');
  }

  function applyRate() {
    const rate = Number(state.settings.speed) || 1;
    audio.playbackRate = rate;
    video.playbackRate = rate;
    $('#btnSpeed').textContent = `${Number.isInteger(rate) ? rate.toFixed(1) : String(rate)}×`;
  }

  function applyRepeat() {
    document.body.dataset.repeat = state.settings.repeat;
    $('#btnRepeat').classList.toggle('active', state.settings.repeat !== 'off');
    $('#btnRepeat').setAttribute('aria-label', state.settings.repeat === 'one' ? '单曲循环' : state.settings.repeat === 'all' ? '列表循环' : '不循环');
  }

  function applyShuffle() {
    $('#btnShuffle').classList.toggle('active', Boolean(state.settings.shuffle));
    $('#btnShuffle').setAttribute('aria-pressed', String(Boolean(state.settings.shuffle)));
  }

  function applyZoom(value) {
    const zoom = Math.min(1.4, Math.max(0.8, Number(value) || 1));
    state.settings.zoom = zoom;
    const label = $('#zoomValue');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    bridge.zoom('set', zoom).catch(() => {});
  }

  async function zoomUi(action) {
    try {
      const value = await bridge.zoom(action);
      if (typeof value !== 'number') return;
      state.settings.zoom = value;
      $('#zoomValue').textContent = `${Math.round(value * 100)}%`;
      scheduleSave();
    } catch {
      /* Zoom is a convenience; ignore IPC failure. */
    }
  }

  function playMedia() {
    if (!ui.current) return;
    if (ui.current.missing) {
      toast('这个文件已经找不到了，可能在移动硬盘里？', 'error');
      return;
    }
    if (ui.current.isVideo) openStage();
    const media = currentMedia();
    const promise = media.play();
    if (promise && promise.catch) {
      promise.catch((error) => {
        if (error?.name === 'AbortError') return;
        toast('播放失败，可能是格式或编码暂不支持', 'error', 3600);
      });
    }
  }

  function stopMedia() {
    audio.pause();
    video.pause();
    audio.removeAttribute('src');
    video.removeAttribute('src');
    delete audio.dataset.trackId;
    delete video.dataset.trackId;
    audio.load();
    video.load();
    ui.playing = false;
    document.body.classList.remove('is-playing');
  }

  function setMediaUrl(media, url) {
    const value = String(url || '');
    const scheme = value.slice(0, value.indexOf(':')).toLowerCase();
    if (scheme === 'whale-bili' || scheme === 'qianqu-music') {
      // B 站音频走自定义协议，必须声明 CORS 模式，否则 Web Audio 会输出全零导致静音
      if (media.crossOrigin !== 'anonymous') media.crossOrigin = 'anonymous';
    } else if (media.hasAttribute('crossorigin')) {
      media.removeAttribute('crossorigin');
    }
    media.src = value;
  }

  function playTrack(id, options = {}) {
    const track = getTrack(id);
    if (!track) return;
    if (ui.videoCinema && !track.isVideo) exitVideoCinema();
    if (track.missing) {
      toast('这个文件已经找不到了，跳过它吧', 'error');
      return;
    }
    if (track.isRemote && track.needsStream && !track.url) {
      const token = ++ui.playToken;
      audio.pause();
      video.pause();
      ui.playing = false;
      ui.current = track;
      updatePlayerBar();
      updatePlayIcon();
      toast(`正在解析「${track.title}」的音频…`);
      ensureRemoteStream(track)
        .then(() => {
          if (token === ui.playToken) playTrack(id, options);
        })
        .catch((error) => {
          if (token === ui.playToken) toast(`音频解析失败：${error.message}`, 'error', 4600);
        });
      return;
    }
    ui.playToken += 1;
    const previousId = ui.current?.id;
    const media = track.isVideo ? video : audio;
    if (track.isVideo && ui.immerseOpen) closeLyricStage();
    ui.current = track;
    if (!track.isRemote || track.source === 'bilibili' || ONLINE_PROVIDERS[track.source]) {
      state.lastPlayedId = track.id;
      state.recent = [track.id, ...state.recent.filter((recentId) => recentId !== track.id)].slice(0, 60);
      if (track.source === 'bilibili') rememberBiliTrack(track);
      else if (ONLINE_PROVIDERS[track.source]) rememberOnlineTrack(track);
    }
    ui.countedId = null;

    const sameTrack = previousId === track.id
      && media.dataset.trackId === track.id
      && media.dataset.streamUrl === String(track.url || '');
    if (!sameTrack) {
      const other = track.isVideo ? audio : video;
      other.pause();
      if (other.dataset.trackId) {
        other.removeAttribute('src');
        other.load();
        delete other.dataset.trackId;
      }
      setMediaUrl(media, track.url);
      media.dataset.trackId = track.id;
      media.dataset.streamUrl = String(track.url || '');
      media.load();
    }

    applyVolume();
    applyRate();
    updatePlayerBar();
    updatePlayIcon();
    updateStageContent();
    if (ui.immerseOpen) {
      updateImmersiveTrack();
      if (ui.lyricsFor !== track.id) loadLyrics(track);
      else updateImmersiveContent(true);
    } else if (stage.classList.contains('open') && ui.lyricsFor !== track.id) {
      loadLyrics(track);
    }
    refreshCurrentMarkers();
    if (track.isVideo) openStage();
    if (options.autoplay !== false) playMedia();
    if (!track.isRemote || track.source === 'bilibili' || ONLINE_PROVIDERS[track.source]) scheduleSave();
  }

  function playFromList(id) {
    playWithContext(ui.currentList, id, ui.currentOrigin);
  }

  function playWithContext(ids, id, origin) {
    const list = Array.isArray(ids) && ids.length ? ids.slice() : [id];
    let index = list.indexOf(id);
    if (index < 0) {
      list.push(id);
      index = list.length - 1;
    }
    ui.queue = list;
    ui.queueIndex = index;
    ui.queueOrigin = origin || '单曲播放';
    renderQueue();
    playTrack(id);
  }

  function playRandom() {
    if (!state.tracks.length) {
      addFiles();
      return;
    }
    const shuffled = state.tracks.slice().sort(() => Math.random() - 0.5);
    ui.queue = shuffled.map((track) => track.id);
    ui.queueIndex = 0;
    ui.queueOrigin = '随便听听';
    renderQueue();
    playTrack(ui.queue[0]);
  }

  function playAll(list) {
    if (!list.length) return;
    ui.queue = list.map((track) => track.id);
    ui.queueIndex = 0;
    ui.queueOrigin = ui.currentOrigin;
    renderQueue();
    playTrack(ui.queue[0]);
  }

  function shuffleAll(list) {
    if (!list.length) return;
    const shuffled = list.slice().sort(() => Math.random() - 0.5);
    state.settings.shuffle = true;
    applyShuffle();
    ui.queue = shuffled.map((track) => track.id);
    ui.queueIndex = 0;
    ui.queueOrigin = `${ui.currentOrigin} · 随机`;
    renderQueue();
    playTrack(ui.queue[0]);
    toast('随机播放已开启');
  }

  function nextTrack(auto = false) {
    if (!ui.queue.length) {
      if (state.tracks.length) playRandom();
      return;
    }
    if (state.settings.repeat === 'one' && auto) {
      const media = currentMedia();
      media.currentTime = 0;
      playMedia();
      return;
    }
    let nextIndex = ui.queueIndex + 1;
    if (state.settings.shuffle) {
      const candidates = ui.queue
        .map((trackId, index) => ({ trackId, index }))
        .filter(({ index }) => index !== ui.queueIndex);
      if (candidates.length) {
        nextIndex = candidates[Math.floor(Math.random() * candidates.length)].index;
      }
    }
    if (nextIndex >= ui.queue.length) {
      if (state.settings.repeat === 'all') nextIndex = 0;
      else {
        if (!auto) toast('已经是队列最后一首了', 'warn');
        return;
      }
    }
    ui.queueIndex = nextIndex;
    playTrack(ui.queue[nextIndex], { autoplay: true });
    renderQueue();
  }

  function prevTrack() {
    const media = currentMedia();
    if (media.currentTime > 4) {
      media.currentTime = 0;
      updateProgress();
      return;
    }
    if (!ui.queue.length) return;
    let prevIndex = ui.queueIndex - 1;
    if (prevIndex < 0) prevIndex = state.settings.repeat === 'all' ? ui.queue.length - 1 : 0;
    ui.queueIndex = prevIndex;
    playTrack(ui.queue[prevIndex], { autoplay: true });
    renderQueue();
  }

  function togglePlay() {
    if (!ui.current) {
      if (ui.currentList.length) playFromList(ui.currentList[0]);
      else if (state.tracks.length) playRandom();
      else addFiles();
      return;
    }
    const media = currentMedia();
    if (media.paused || media.ended) {
      if (!media.getAttribute('src') && ui.current.url) {
        setMediaUrl(media, ui.current.url);
        media.dataset.trackId = ui.current.id;
        media.load();
      }
      playMedia();
    } else {
      media.pause();
    }
  }

  function handleEnded(media) {
    if (media !== currentMedia()) return;
    if (state.settings.repeat === 'one') {
      media.currentTime = 0;
      playMedia();
      return;
    }
    const atEnd = ui.queueIndex >= ui.queue.length - 1;
    if (atEnd && state.settings.repeat !== 'all') {
      ui.playing = false;
      document.body.classList.remove('is-playing');
      updatePlayIcon();
      updateProgress();
      return;
    }
    nextTrack(true);
  }

  function startTicker() {
    if (ui.ticker) return;
    const tick = () => {
      ui.ticker = null;
      if (!ui.playing) return;
      updateProgress();
      updateLyrics(currentMedia().currentTime);
      ui.ticker = requestAnimationFrame(tick);
    };
    ui.ticker = requestAnimationFrame(tick);
  }

  function stopTicker() {
    if (ui.ticker) cancelAnimationFrame(ui.ticker);
    ui.ticker = null;
  }

  function updateProgress() {
    const media = currentMedia();
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : (ui.current?.duration || 0);
    const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const fraction = duration ? Math.min(1, current / duration) : 0;
    const displayFraction = ui.seekDrag ?? fraction;
    $('#seekFill').style.width = `${displayFraction * 100}%`;
    $('#seekKnob').style.left = `${displayFraction * 100}%`;
    $('#timeCur').textContent = fmtTime(ui.seekDrag != null ? ui.seekDrag * duration : current);
    $('#timeTotal').textContent = fmtTime(duration || ui.current?.duration || 0);
    if (ui.immerseOpen) updateImmersiveProgress(ui.seekDrag != null ? ui.seekDrag * duration : current);

    try {
      if (media.buffered.length && duration) {
        const end = media.buffered.end(media.buffered.length - 1);
        $('#seekBuffer').style.width = `${Math.min(100, (end / duration) * 100)}%`;
      }
    } catch {
      /* buffered ranges can be transiently unavailable */
    }

    if ('mediaSession' in navigator && duration > 0 && !ui.seekDrag) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: media.playbackRate || 1,
          position: Math.min(duration, current),
        });
      } catch {
        /* Some media states reject position updates. */
      }
    }
  }

  function updatePlayIcon() {
    document.body.classList.toggle('is-playing', ui.playing);
    $('#btnPlay').setAttribute('aria-label', ui.playing ? '暂停' : '播放');
    $$('.network-row.is-current .network-play use').forEach((use) => {
      use.setAttribute('href', ui.playing ? '#i-pause' : '#i-play');
    });
  }

  function updatePlayerBar() {
    const track = ui.current;
    const cover = $('#miniCover');
    const img = $('#miniCoverImg');
    const fallback = cover.querySelector('[data-fallback]');
    const fav = $('#miniFav');
    if (!track) {
      $('#miniTitle').textContent = '还没有播放';
      $('#miniArtist').textContent = '选一首歌，让qianqu开始唱歌';
      img.hidden = true;
      img.removeAttribute('src');
      fallback.style.display = '';
      fallback.style.background = gradientFor('empty');
      fallback.innerHTML = `<span class="fallback-icon">${icon('music')}</span>`;
      fav.classList.remove('active');
      fav.querySelector('use').setAttribute('href', '#i-heart');
      fav.title = '';
      document.title = 'qianqu';
      return;
    }
    $('#miniTitle').textContent = track.title;
    $('#miniArtist').textContent = `${track.artist}${track.album ? ` · ${track.album}` : ''}`;
    if (track.cover) {
      img.src = track.cover;
      img.hidden = false;
      fallback.style.display = 'none';
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      fallback.style.display = '';
      fallback.style.background = gradientFor(track.id);
      fallback.innerHTML = `<span class="fallback-icon">${icon(track.isVideo ? 'video' : 'music')}</span>`;
    }
    const canFavorite = !track.isRemote || track.source === 'bilibili' || Boolean(ONLINE_PROVIDERS[track.source]);
    const favorite = canFavorite && isFavorite(track.id);
    fav.classList.toggle('active', favorite);
    fav.querySelector('use').setAttribute('href', favorite ? '#i-heart-fill' : '#i-heart');
    fav.title = canFavorite ? '' : '这首网络曲目暂不支持收藏';
    document.title = `${track.title} · ${track.artist} — qianqu`;
    updateLyricOffsetLabel();
    if ('mediaSession' in navigator && window.MediaMetadata) {
      try {
        const artwork = track.cover && /^(https?:|data:|blob:)/i.test(track.cover)
          ? [{ src: track.cover, sizes: '512x512', type: 'image/jpeg' }]
          : [];
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || 'qianqu',
          artwork,
        });
      } catch {
        /* ignore unsupported metadata */
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Stage                                                              */
  /* ------------------------------------------------------------------ */

  function openStage() {
    if (!ui.current) {
      toast('先挑一首歌吧', 'warn');
      return;
    }
    stage.classList.add('open');
    stage.setAttribute('aria-hidden', 'false');
    updateStageContent();
    loadLyrics(ui.current);
  }

  function enterVideoCinema() {
    if (!ui.current?.isVideo) return;
    ui.videoCinema = true;
    document.body.classList.add('video-cinema');
    stage.classList.add('video-cinema');
    video.controls = true;
    if (!ui.windowFullscreen) {
      bridge.toggleFullscreen().catch(() => {});
    }
  }

  function exitVideoCinema(options = {}) {
    if (!ui.videoCinema) return;
    ui.videoCinema = false;
    document.body.classList.remove('video-cinema');
    stage.classList.remove('video-cinema');
    video.controls = false;
    if (!options.keepWindow && ui.windowFullscreen) {
      bridge.toggleFullscreen().catch(() => {});
    }
  }

  function toggleVideoCinema() {
    if (!ui.current?.isVideo) {
      bridge.toggleFullscreen().catch(() => {});
      return;
    }
    if (ui.videoCinema) exitVideoCinema();
    else enterVideoCinema();
  }

  function closeStage() {
    if (ui.videoCinema) exitVideoCinema({ keepWindow: true });
    if (ui.immerseOpen) closeLyricStage();
    stage.classList.remove('open');
    stage.setAttribute('aria-hidden', 'true');
    if (ui.windowFullscreen) {
      bridge.toggleFullscreen().catch(() => {});
    }
  }

  function updateStageContent() {
    const track = ui.current;
    if (!track) return;
    const artWrap = $('#stageArtWrap');
    const art = $('#stageArt');
    const fallback = artWrap.querySelector('[data-fallback]');

    $('#stageTitle').textContent = track.title;
    $('#stageArtist').textContent = `${track.artist}${track.album ? ` — ${track.album}` : ''}`;
    $('#stageEyebrow').textContent = track.album || '正在播放';
    $('#stageKicker').textContent = track.isVideo ? 'CINEMA' : 'NOW PLAYING';
    stage.classList.toggle('mode-video', Boolean(track.isVideo));
    stage.classList.toggle('has-video', Boolean(track.isVideo));

    if (track.cover) {
      art.src = track.cover;
      art.hidden = false;
      fallback.style.display = 'none';
    } else {
      art.hidden = true;
      art.removeAttribute('src');
      fallback.style.display = '';
      fallback.style.background = gradientFor(track.id);
      fallback.innerHTML = `<span class="fallback-icon">${icon(track.isVideo ? 'video' : 'music')}</span>`;
    }

    if (track.cover) {
      $('#stageBackdrop').style.backgroundImage = `url("${track.cover.replace(/"/g, '\\"')}")`;
      $('#stageBackdrop').style.backgroundColor = '#050b14';
    } else {
      $('#stageBackdrop').style.backgroundImage = 'none';
      $('#stageBackdrop').style.background = stageGradientFor(track.id);
    }

    const tags = [];
    if (track.isRemote) tags.push(track.sourceLabel || '网络音乐');
    if (track.isRemote && track.qualityLabel) tags.push(track.qualityLabel);
    const ext = extOf(track);
    if (ext) tags.push(MEDIA_LABEL[ext] || ext.toUpperCase());
    if (track.isVideo) {
      if (track.codec) tags.push(track.codec.split('.')[0].toUpperCase());
      const size = fmtSize(track.fileSize);
      if (size) tags.push(size);
    } else {
      if (track.lossless) tags.push('LOSSLESS');
      if (track.sampleRate) tags.push(fmtSampleRate(track.sampleRate));
      if (track.bitrate) tags.push(`${Math.round(track.bitrate / 1000)} kbps`);
      if (track.year) tags.push(String(track.year));
    }
    $('#stageTags').innerHTML = tags.map((tag) => `<span class="stage-tag">${esc(tag)}</span>`).join('');

    const canFavorite = !track.isRemote || track.source === 'bilibili' || Boolean(ONLINE_PROVIDERS[track.source]);
    const favorite = canFavorite && isFavorite(track.id);
    const favButton = $('#stageFav');
    favButton.classList.toggle('active', favorite);
    favButton.querySelector('use').setAttribute('href', favorite ? '#i-heart-fill' : '#i-heart');
    favButton.querySelector('span').textContent = favorite ? '已收藏' : '收藏';
    favButton.title = canFavorite ? '' : '这首网络曲目暂不支持收藏';

    if (track.isVideo && video.dataset.trackId !== track.id && track.url) {
      setMediaUrl(video, track.url);
      video.dataset.trackId = track.id;
      video.load();
    }
    updatePlayerBar();
  }

  function parseLrc(text) {
    const lines = [];
    let offset = 0;
    const offsetMatch = text.match(/\[offset:\s*(-?\d+)\s*\]/i);
    if (offsetMatch) offset = Number(offsetMatch[1]) / 1000;
    const pattern = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const rawLine of String(text).split(/\r?\n/)) {
      const stamps = [...rawLine.matchAll(pattern)];
      if (!stamps.length) continue;
      const content = rawLine.replace(/\[[^\]]*\]/g, '').trim();
      if (!content) continue;
      for (const stamp of stamps) {
        const min = Number(stamp[1]);
        const sec = Number(stamp[2]);
        let ms = stamp[3] || '0';
        if (ms.length === 1) ms = `${ms}00`;
        else if (ms.length === 2) ms = `${ms}0`;
        const time = min * 60 + sec + Number(ms) / 1000 + offset;
        lines.push({ time, text: content });
      }
    }
    lines.sort((a, b) => a.time - b.time);

    /* A second line with the same timestamp is usually a translation. */
    const merged = [];
    for (const entry of lines) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(entry.time - last.time) < 0.08) {
        if (entry.text === last.text) continue;
        if (!last.translation) last.translation = entry.text;
        else if (!last.translation.split(' / ').includes(entry.text)) last.translation += ` / ${entry.text}`;
        continue;
      }
      merged.push({ time: entry.time, text: entry.text, translation: '' });
    }
    return merged;
  }

  function lyricLineMarkup(line, index, extraClass = '') {
    const translation = line.translation
      ? `<span class="lyric-trans">${esc(line.translation)}</span>`
      : '';
    return `<div class="lyric-line ${extraClass}" data-line="${index}" title="双击把这一句对齐到当前播放时间">${esc(line.text)}${translation}</div>`;
  }

  function updateLyricOffsetLabel() {
    const label = $('#lyricOffset');
    if (!label) return;
    const offset = Number(ui.current?.lyricOffset) || 0;
    label.textContent = Math.abs(offset) < 0.05
      ? '0.0s'
      : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
    label.title = offset
      ? `歌词偏移 ${offset >= 0 ? '+' : ''}${offset.toFixed(1)} 秒，点击归零`
      : '歌词偏移 0 秒';
  }

  function shiftLyricOffset(amount, options = {}) {
    const track = ui.current;
    if (!track) return;
    const previous = Number(track.lyricOffset) || 0;
    const next = options.reset
      ? 0
      : Math.min(30, Math.max(-30, Math.round((previous + Number(amount || 0)) * 10) / 10));
    const actualDelta = Math.round((next - previous) * 10) / 10;
    track.lyricOffset = next;
    if (ui.lyricsRawText) {
      applyLyricsText(ui.lyricsRawText, ui.lyricsRawSource, track);
    } else {
      updateLyricOffsetLabel();
    }
    if (track.source === 'bilibili') rememberBiliTrack(track);
    scheduleSave();
    updateLyricOffsetLabel();
    if (ui.immerseOpen) {
      flashImmersiveHint(`歌词偏移 ${next >= 0 ? '+' : ''}${next.toFixed(1)}s`);
    }
    toast(options.message || (options.reset
      ? '歌词偏移已归零'
      : `歌词${actualDelta >= 0 ? '延后' : '提前'} ${Math.abs(actualDelta).toFixed(1)} 秒 · 当前 ${next >= 0 ? '+' : ''}${next.toFixed(1)}s`));
  }

  function alignLyricLineToNow(index) {
    const track = ui.current;
    const line = ui.lyrics[index];
    if (!track || !line) return;
    const media = currentMedia();
    const actual = Number(media.currentTime);
    if (!Number.isFinite(actual)) return;
    const delta = actual - line.time;
    shiftLyricOffset(delta, {
      message: `已将「${line.text}」对齐到 ${fmtTime(actual)}`,
    });
  }

  function lyricPickerQuery(track) {
    return String(track?.title || '')
      .replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
      .replace(/[《》]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function openLyricPicker() {
    const track = ui.current;
    if (!track) return;
    if (!bridge?.searchLyrics || !bridge?.getLyricCandidate) {
      toast('歌词搜索接口没有加载，请重启qianqu', 'warn');
      return;
    }
    const hasCustom = Boolean(track.customLyrics?.trim());
    openModal({
      title: '更换歌词版本',
      body: `
        <p>歌词文本选错或版本不对时，可以从网易云和 QQ 音乐里手动换一份。换完仍对不上，再双击歌词行校准时间。</p>
        <div class="lyric-picker-search">
          <input id="lyricPickerQuery" type="text" maxlength="80" autocomplete="off" spellcheck="false" value="${esc(lyricPickerQuery(track))}" placeholder="歌名 / 歌手 / 专辑">
          <button class="soft-btn" id="lyricPickerSearch" type="button">搜索</button>
        </div>
        <div class="lyric-picker-status" id="lyricPickerStatus">正在搜索…</div>
        <div class="lyric-candidate-list" id="lyricCandidateList"></div>
      `,
      actions: [
        ...(hasCustom ? [{
          label: '恢复自动匹配',
          onClick: async (close) => {
            delete track.customLyrics;
            delete track.customLyricsSource;
            delete track.customLyricTitle;
            delete track.customLyricArtist;
            track.lyricOffset = 0;
            if (track.source === 'bilibili') rememberBiliTrack(track);
            scheduleSave();
            close();
            await loadLyrics(track, { force: true });
          },
        }] : []),
        { label: '关闭', onClick: (close) => close() },
      ],
      onMount: () => {
        const input = $('#lyricPickerQuery');
        const button = $('#lyricPickerSearch');
        const status = $('#lyricPickerStatus');
        const list = $('#lyricCandidateList');
        const run = async () => {
          const query = String(input?.value || '').trim();
          status.textContent = '正在搜索…';
          list.innerHTML = '';
          try {
            const response = await bridge.searchLyrics({
              query,
              title: track.title,
              artist: track.artist,
              duration: track.duration,
            });
            if (!response?.ok) throw new Error(response?.error || '搜索失败');
            const candidates = Array.isArray(response.candidates) ? response.candidates : [];
            status.textContent = candidates.length
              ? `找到 ${candidates.length} 个候选，优先按标题、歌手和时长排序`
              : '没有找到候选，可以换个关键词再试';
            list.innerHTML = candidates.map((item) => `
              <button class="lyric-candidate" type="button"
                data-candidate-provider="${esc(item.provider)}"
                data-candidate-id="${esc(item.id)}"
                data-candidate-title="${esc(item.title)}"
                data-candidate-artist="${esc(item.artist)}">
                <span class="provider">${item.provider === 'qq' ? 'QQ 音乐' : '网易云'}</span>
                ${Number(item.variantPenalty) > 0.1 ? '<span class="provider warn">版本可能不同</span>' : ''}
                <strong>${esc(item.title)}</strong>
                <small>${esc(item.artist || '未知歌手')}${item.album ? ` · ${esc(item.album)}` : ''}${item.duration ? ` · ${fmtTime(item.duration)}` : ''}</small>
              </button>
            `).join('');
          } catch (error) {
            status.textContent = error?.message || '歌词候选搜索失败';
          }
        };
        button?.addEventListener('click', run);
        input?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            run();
          }
        });
        list?.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-candidate-provider]');
          if (!button) return;
          status.textContent = '正在获取歌词…';
          try {
            const response = await bridge.getLyricCandidate({
              provider: button.dataset.candidateProvider,
              id: button.dataset.candidateId,
              title: button.dataset.candidateTitle,
              artist: button.dataset.candidateArtist,
            });
            if (!response?.ok || !response.lrc) throw new Error(response?.error || '这个候选没有歌词');
            track.customLyrics = response.lrc;
            track.customLyricsSource = response.source || '手动选择歌词';
            track.customLyricTitle = response.title || button.dataset.candidateTitle || '';
            track.customLyricArtist = response.artist || button.dataset.candidateArtist || '';
            track.lyricOffset = 0;
            if (track.source === 'bilibili') rememberBiliTrack(track);
            scheduleSave();
            closeModal();
            await loadLyrics(track, { force: true });
            toast(`已换用 ${response.source || '手动选择歌词'}`);
          } catch (error) {
            status.textContent = error?.message || '歌词获取失败';
          }
        });
        run();
      },
    });
  }

  function applyLyricsText(text, source, track = ui.current) {
    if (!text || !text.trim()) return false;
    ui.lyricsRawText = text;
    ui.lyricsRawSource = source || '';
    const offset = Number(track?.lyricOffset) || 0;
    const timed = parseLrc(text)
      .map((line) => ({ ...line, time: line.time + offset }))
      .filter((line) => line.time >= -0.05);
    ui.lyricsLoading = false;
    ui.lyricsStatus = 'ok';
    ui.lyricsMessage = '';
    ui.lyricsDetail = '';
    if (timed.length) {
      ui.lyrics = timed;
      ui.plainLyrics = [];
      ui.lyricIndex = -1;
      $('#lyricsSource').textContent = source || '歌词';
      lyricsEl.classList.remove('plain');
      lyricsEl.innerHTML = timed.map((line, index) => lyricLineMarkup(line, index)).join('');
      updateLyrics(currentMedia().currentTime, true);
      updateLyricOffsetLabel();
      if (ui.immerseOpen) updateImmersiveContent(true);
      return true;
    }
    const plainLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!plainLines.length) return false;
    ui.lyrics = [];
    ui.plainLyrics = plainLines;
    ui.lyricIndex = -1;
    $('#lyricsSource').textContent = source || '未同步歌词';
    lyricsEl.classList.add('plain');
    lyricsEl.innerHTML = plainLines.map((line) => `<div class="lyric-line">${esc(line)}</div>`).join('');
    updateLyricOffsetLabel();
    if (ui.immerseOpen) updateImmersiveContent(true);
    return true;
  }

  function showLyricsNotice(status, message, detail, options = {}) {
    ui.lyricsLoading = false;
    ui.lyricsStatus = status;
    ui.lyricsMessage = message || '';
    ui.lyricsDetail = detail || '';
    ui.lyrics = [];
    ui.plainLyrics = [];
    ui.lyricsRawText = '';
    ui.lyricsRawSource = '';
    ui.lyricIndex = -1;
    lyricsEl.classList.remove('plain');
    $('#lyricsSource').textContent = options.source || '';
    const retry = options.retry
      ? '<button class="soft-btn lyrics-retry" type="button" data-lyrics-retry>重新匹配</button>'
      : '';
    lyricsEl.innerHTML = `
      <div class="lyrics-empty">
        ${esc(ui.lyricsMessage)}
        <span>${esc(ui.lyricsDetail)}</span>
        ${retry}
      </div>`;
    if (ui.immerseOpen) updateImmersiveContent(true);
  }

  function showLyricsLoading(track) {
    ui.lyricsStatus = 'loading';
    ui.lyricsMessage = '正在匹配歌词…';
    ui.lyricsDetail = '先找 B 站字幕，再看云歌词';
    ui.lyricsRawText = '';
    ui.lyricsRawSource = '';
    lyricsEl.classList.remove('plain');
    $('#lyricsSource').textContent = '正在匹配';
    lyricsEl.innerHTML = `
      <div class="lyrics-empty">
        正在为这首 B 站音轨找歌词…
        <span>B 站字幕优先，没有字幕时再匹配云歌词</span>
      </div>`;
    if (ui.immerseOpen) updateImmersiveContent(true);
  }

  async function loadBiliLyrics(track, token, force = false) {
    if (!bridge?.biliLyrics) {
      showLyricsNotice('error', '歌词接口没有加载', '请重新启动qianqu后再试', { source: '未加载', retry: true });
      return;
    }
    try {
      const result = await bridge.biliLyrics({
        bvid: track.bvid,
        cid: track.cid || null,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        force,
      });
      if (token !== ui.lyricsToken) return;
      if (!result?.ok) throw new Error(result?.error || '歌词获取失败');
      if (result.cid && !track.cid) track.cid = Number(result.cid) || track.cid;
      if (result.status === 'ok' && result.lrc && applyLyricsText(result.lrc, result.source, track)) {
        return;
      }
      if (result.status === 'instrumental') {
        showLyricsNotice(
          'instrumental',
          '纯音乐 · 不用等歌词',
          result.message || '这首歌是纯音乐或伴奏，安静听就好',
          { source: '纯音乐' },
        );
        return;
      }
      showLyricsNotice(
        'empty',
        '暂时没有找到这首歌的歌词',
        result.message || 'B 站字幕和云歌词都没有匹配到',
        { source: '未匹配', retry: true },
      );
    } catch (error) {
      if (token !== ui.lyricsToken) return;
      showLyricsNotice(
        'error',
        '歌词加载失败',
        error?.message || '网络连接暂时不可用',
        { source: '加载失败', retry: true },
      );
    }
  }

  async function loadOnlineLyrics(track, token) {
    ui.lyricsLoading = true;
    ui.lyricsStatus = 'loading';
    ui.lyricsMessage = '正在读取歌词…';
    ui.lyricsDetail = `${ONLINE_PROVIDERS[track.source]?.short || '网络音乐'}歌词`;
    lyricsEl.classList.remove('plain');
    $('#lyricsSource').textContent = '正在读取';
    lyricsEl.innerHTML = '<div class="lyrics-empty">正在读取歌词…<br><span>可以直接双击歌词行校准时间</span></div>';
    if (ui.immerseOpen) updateImmersiveContent(true);
    try {
      const result = await bridge.musicLyric(track.providerId || track.source, track.lyricId || track.urlId);
      if (token !== ui.lyricsToken) return;
      if (result?.ok && result.lrc && applyLyricsText(result.lrc, result.source || '网络歌词', track)) return;
      showLyricsNotice('empty', '这首歌暂时没有歌词', '可以继续听歌，或点「换词」试着换一个版本', { source: '无歌词' });
    } catch (error) {
      if (token !== ui.lyricsToken) return;
      showLyricsNotice('error', '歌词加载失败', error?.message || '网络连接暂时不可用', { source: '加载失败', retry: true });
    }
  }

  async function loadLyrics(track, options = {}) {
    const token = ++ui.lyricsToken;
    ui.lyrics = [];
    ui.plainLyrics = [];
    ui.lyricsRawText = '';
    ui.lyricsRawSource = '';
    ui.lyricsLoading = true;
    ui.lyricsStatus = 'loading';
    ui.lyricsMessage = '';
    ui.lyricsDetail = '';
    ui.lyricIndex = -1;
    ui.lyricsFor = track?.id || null;
    ui.immerseLineKey = '';
    $('#lyricsSource').textContent = '';
    lyricsEl.classList.remove('plain');
    if (!track) {
      ui.lyricsLoading = false;
      return;
    }
    if (track.customLyrics?.trim()) {
      if (applyLyricsText(track.customLyrics, track.customLyricsSource || '手动选择歌词', track)) {
        return;
      }
    }
    if (track.isRemote) {
      if (ONLINE_PROVIDERS[track.source]) {
        await loadOnlineLyrics(track, token);
        return;
      }
      if (track.source !== 'bilibili') {
        ui.lyricsLoading = false;
        showLyricsNotice(
          'preview',
          '网络音乐没有同步歌词',
          '可以换一首，或稍后重新匹配',
          { source: '网络音乐' },
        );
        return;
      }
      showLyricsLoading(track);
      await loadBiliLyrics(track, token, Boolean(options.force));
      return;
    }

    let text = '';
    let source = '';
    try {
      const external = await bridge.readLyrics(track.path);
      if (token !== ui.lyricsToken) return;
      if (external?.text) {
        text = external.text;
        source = '本地歌词';
      }
    } catch {
      /* fall through to embedded lyrics */
    }
    if (!text && track.lyrics) {
      text = track.lyrics;
      source = '内嵌歌词';
    }
    if (token !== ui.lyricsToken) return;

    if (!text.trim()) {
      showLyricsNotice(
        'empty',
        '这里还没有歌词',
        '把同名 .lrc 文件放在歌曲旁边就能显示',
        { source: '本地' },
      );
      return;
    }
    applyLyricsText(text, source, track);
  }

  function updateLyrics(time, force = false) {
    if (!ui.lyrics.length || ui.lyricsFor !== ui.current?.id) return;
    let index = -1;
    for (let i = 0; i < ui.lyrics.length; i += 1) {
      if (ui.lyrics[i].time <= time + 0.15) index = i;
      else break;
    }
    if (index === ui.lyricIndex && !force) return;
    ui.lyricIndex = index;
    const lines = lyricsEl.querySelectorAll('.lyric-line');
    lines.forEach((line, i) => {
      line.classList.toggle('active', i === index);
      line.classList.toggle('near', Math.abs(i - index) === 1 && index >= 0);
    });
    if (index >= 0 && lines[index]) {
      const line = lines[index];
      const target = line.offsetTop - lyricsEl.clientHeight / 2 + line.clientHeight / 2;
      lyricsEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
    if (ui.immerseOpen) {
      updateImmersiveContent();
      updateImmersiveProgress(time, true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Immersive lyric stage                                              */
  /* ------------------------------------------------------------------ */

  function currentLyricTheme() {
    return LYRIC_THEMES.find((theme) => theme.id === state.settings.lyricTheme) || LYRIC_THEMES[0];
  }

  function cssUrl(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = (((Number(hue) || 0) % 360) + 360) % 360 / 360;
    const s = Math.min(1, Math.max(0, saturation / 100));
    const l = Math.min(1, Math.max(0, lightness / 100));
    if (s === 0) {
      const value = Math.round(l * 255);
      return [value, value, value];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      let value = t;
      if (value < 0) value += 1;
      if (value > 1) value -= 1;
      if (value < 1 / 6) return p + (q - p) * 6 * value;
      if (value < 1 / 2) return q;
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
      return p;
    };
    return [
      Math.round(channel(h + 1 / 3) * 255),
      Math.round(channel(h) * 255),
      Math.round(channel(h - 1 / 3) * 255),
    ];
  }

  function paletteFromHue(hue, saturation = 62, lightness = 60) {
    const h = ((Math.round(hue) % 360) + 360) % 360;
    const s = Math.min(90, Math.max(42, saturation));
    const l = Math.min(76, Math.max(52, lightness));
    const h2 = (h + 42) % 360;
    const rgb = hslToRgb(h, s, l);
    return {
      h,
      h2,
      s,
      l,
      rgb,
      rgbText: rgb.join(', '),
      accent: `hsl(${h} ${s}% ${l}%)`,
      accent2: `hsl(${h2} ${Math.max(40, s - 8)}% ${Math.max(44, l - 6)}%)`,
    };
  }

  const paletteCache = new Map();

  function fallbackPalette(seed) {
    const hues = [186, 194, 202, 210, 220, 231, 243, 255, 268, 282];
    const index = hashString(seed) % hues.length;
    return paletteFromHue(hues[index], 60, 58);
  }

  function paletteFromPixels(data) {
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 180) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 18) continue;
      const saturation = (max - min) / max;
      const lightness = (max + min) / 510;
      if (saturation < 0.16 || lightness < 0.12 || lightness > 0.9) continue;
      let hue;
      if (max === r) hue = ((g - b) / (max - min)) * 60;
      else if (max === g) hue = ((b - r) / (max - min) + 2) * 60;
      else hue = ((r - g) / (max - min) + 4) * 60;
      hue = ((hue % 360) + 360) % 360;
      const bucket = Math.floor(hue / 15);
      const entry = buckets.get(bucket) || { count: 0, saturation: 0, lightness: 0 };
      entry.count += 1;
      entry.saturation += saturation;
      entry.lightness += lightness;
      buckets.set(bucket, entry);
    }
    let best = null;
    for (const [bucket, entry] of buckets) {
      const score = entry.count * (0.55 + entry.saturation / entry.count);
      if (!best || score > best.score) best = { bucket, entry, score };
    }
    if (!best) return null;
    const count = best.entry.count;
    const saturation = Math.round((best.entry.saturation / count) * 100 * 0.9 + 20);
    const lightness = Math.round((best.entry.lightness / count) * 100 + 8);
    return paletteFromHue(best.bucket * 15 + 7.5, saturation, lightness);
  }

  async function paletteForTrack(track) {
    const fallback = fallbackPalette(`${track.id}|${track.title}`);
    if (!track.cover || !bridge.coverThumb) return fallback;
    if (paletteCache.has(track.cover)) return paletteCache.get(track.cover);
    try {
      const thumbnail = await bridge.coverThumb(track.cover);
      if (!thumbnail) return fallback;
      const image = new Image();
      image.src = thumbnail;
      if (image.decode) await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      const size = 26;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, size, size);
      const palette = paletteFromPixels(context.getImageData(0, 0, size, size).data) || fallback;
      paletteCache.set(track.cover, palette);
      return palette;
    } catch {
      paletteCache.set(track.cover, fallback);
      return fallback;
    }
  }

  function applyImmersivePalette(palette) {
    if (!palette) return;
    ui.palette = palette;
    lyricStage.style.setProperty('--ls-accent', palette.accent);
    lyricStage.style.setProperty('--ls-accent-2', palette.accent2);
    lyricStage.style.setProperty('--ls-accent-rgb', palette.rgbText);
    lyricStage.style.setProperty('--ls-h', String(palette.h));
  }

  function buildImmersiveStars(seed) {
    const stars = [];
    for (let i = 0; i < 48; i += 1) {
      const hash = hashString(`${seed}|star|${i}`);
      const x = (hash % 1000) / 10;
      const y = ((hash >> 10) % 1000) / 10;
      const size = 1 + ((hash >> 5) % 20) / 10;
      const duration = 2.6 + ((hash >> 8) % 45) / 10;
      const delay = -((hash >> 3) % 70) / 10;
      stars.push(`<span style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--s:${size.toFixed(1)}px;--t:${duration.toFixed(1)}s;--d:${delay.toFixed(1)}s"></span>`);
    }
    $('#lsStars').innerHTML = stars.join('');
  }

  function updateImmersiveTrack() {
    const track = ui.current;
    if (!track) return;
    const title = $('#lsTitle');
    const artist = $('#lsArtist');
    const album = $('#lsAlbum');
    const cover = $('#lsCover');

    title.textContent = track.title;
    artist.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ''}`;
    album.textContent = track.album || 'qianqu';
    lyricStage.classList.toggle('is-video', Boolean(track.isVideo));

    if (track.cover) {
      cover.style.background = '';
      cover.style.backgroundImage = `url("${track.cover.replace(/"/g, '\\"')}")`;
      cover.style.opacity = '';
    } else {
      cover.style.backgroundImage = 'none';
      cover.style.background = gradientFor(track.id);
      cover.style.opacity = '0.32';
    }

    buildImmersiveStars(`${track.id}|${track.title}`);
    ui.paletteToken += 1;
    const token = ui.paletteToken;
    applyImmersivePalette(fallbackPalette(track.id));
    paletteForTrack(track).then((palette) => {
      if (token !== ui.paletteToken || ui.current?.id !== track.id) return;
      applyImmersivePalette(palette);
      if (ui.immerseOpen) createImmersiveParticles(true);
    });
  }

  function buildThemeTray() {
    $('#lsThemes').innerHTML = LYRIC_THEMES.map((theme) => (
      `<button class="ls-theme-btn" data-lyric-theme="${theme.id}" title="${theme.label}">${theme.name}</button>`
    )).join('');
    updateThemeTray();
  }

  function updateThemeTray() {
    $$('#lsThemes [data-lyric-theme]').forEach((button) => {
      const active = button.dataset.lyricTheme === state.settings.lyricTheme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setLyricTheme(id, options = {}) {
    const theme = LYRIC_THEMES.find((item) => item.id === id);
    if (!theme) return;
    state.settings.lyricTheme = theme.id;
    lyricStage.dataset.theme = theme.id;
    $('#lsThemeName').textContent = theme.name;
    updateThemeTray();
    ui.immerseLineKey = '';
    if (ui.immerseOpen) {
      updateImmersiveContent(true);
      updateImmersiveProgress(currentMedia().currentTime, true);
      createImmersiveParticles(true);
    }
    if (options.save !== false) scheduleSave();
    if (options.announce) flashImmersiveHint(`歌词主题 · ${theme.name}`);
  }

  function cycleLyricTheme(direction = 1) {
    const index = LYRIC_THEMES.findIndex((theme) => theme.id === state.settings.lyricTheme);
    const next = (index + direction + LYRIC_THEMES.length) % LYRIC_THEMES.length;
    setLyricTheme(LYRIC_THEMES[next].id, { announce: true });
  }

  function openLyricStage() {
    if (!ui.current) {
      toast('先挑一首歌吧', 'warn');
      return;
    }
    if (ui.current.isVideo) {
      toast('视频请在影院模式观看', 'warn');
      return;
    }
    if (ui.lyricsFor !== ui.current.id) loadLyrics(ui.current);
    ui.immerseOpen = true;
    ui.immerseLineKey = '';
    ui.immerseLitCount = -1;
    ui.immerseFullBefore = document.body.classList.contains('is-fullscreen');
    lyricStage.classList.add('open');
    lyricStage.setAttribute('aria-hidden', 'false');
    document.body.classList.add('immerse-on');
    setLyricTheme(state.settings.lyricTheme, { save: false });
    updateImmersiveTrack();
    updateImmersiveContent(true);
    updateImmersiveProgress(currentMedia().currentTime, true);
    startImmersiveCanvas();
    ensureAudioGraph();
    pokeImmersive();
  }

  function closeLyricStage() {
    if (!ui.immerseOpen) return;
    ui.immerseOpen = false;
    lyricStage.classList.remove('open', 'idle');
    lyricStage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('immerse-on');
    clearTimeout(ui.immerseIdleTimer);
    clearTimeout(ui.immerseHintTimer);
    stopImmersiveCanvas();
    if (!ui.immerseFullBefore && document.body.classList.contains('is-fullscreen')) {
      bridge.toggleFullscreen().catch(() => {});
    }
  }

  function flashImmersiveHint(text) {
    const hint = $('#lsHint');
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(ui.immerseHintTimer);
    ui.immerseHintTimer = setTimeout(() => hint.classList.remove('show'), 2200);
  }

  function pokeImmersive() {
    if (!ui.immerseOpen) return;
    lyricStage.classList.remove('idle');
    clearTimeout(ui.immerseIdleTimer);
    ui.immerseIdleTimer = setTimeout(() => {
      if (ui.immerseOpen && ui.playing) lyricStage.classList.add('idle');
    }, 4800);
  }

  function createImmersiveCharMarkup(line) {
    const chars = Array.from(String(line.text || ''));
    const markup = chars.map((char, index) => {
      if (char === ' ') return `<span class="ls-char ls-space" style="--i:${index}"> </span>`;
      const seed = hashString(`${line.time}|${index}|${char}`);
      const dx = (seed % 49) - 24;
      const dy = ((seed >> 4) % 85) - 42;
      const rotate = ((seed >> 8) % 21) - 10;
      const scale = 0.94 + ((seed >> 12) % 16) / 100;
      const depth = ((seed >> 16) % 160) - 80;
      const blur = ((seed >> 20) % 10) / 10;
      return `<span class="ls-char" style="--i:${index};--dx:${dx}px;--dy:${dy}px;--rot:${rotate}deg;--scale:${scale.toFixed(2)};--dz:${depth}px;--blur:${blur.toFixed(1)}px">${esc(char)}</span>`;
    }).join('');
    return { markup, count: chars.length };
  }

  function fittedSize(text, themeId, factor = 1) {
    const chars = Math.max(4, Array.from(String(text || '')).length);
    const available = Math.max(320, lyricStage.clientWidth) * 0.88 * factor;
    const caps = {
      tide: [30, 96],
      lumi: [46, 152],
      fume: [34, 132],
      cad: [40, 110],
      pat: [30, 94],
      tilt: [32, 112],
      diorama: [34, 118],
      cappella: [16, 34],
      clock: [18, 38],
    };
    const [min, max] = caps[themeId] || [28, 96];
    const ideal = available / (chars * 0.94);
    return Math.round(Math.min(max, Math.max(min, ideal)));
  }

  function fitImmersiveText() {
    if (!ui.immerseOpen || !ui.lyrics.length) return;
    const theme = currentLyricTheme().id;
    const index = ui.lyricIndex;
    const line = index >= 0 ? ui.lyrics[index] : null;
    const next = ui.lyrics[index + 1] || (index < 0 ? ui.lyrics[0] : null);
    if (line) $('#lsLine').style.setProperty('--fit-size', `${fittedSize(line.text, theme)}px`);
    if (theme === 'tilt' && next) {
      $('#lsNext').style.setProperty('--fit-size-next', `${fittedSize(next.text, theme, 0.72)}px`);
    }
  }

  function renderImmersiveChat(index, track) {
    const start = Math.max(0, index - 3);
    const end = Math.min(ui.lyrics.length, Math.max(index + 3, 1) + 1);
    const activeIndex = Math.max(0, index);
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const line = ui.lyrics[i];
      const active = i === activeIndex;
      const side = i % 2 === 0 ? 'left' : 'right';
      const avatar = track.cover
        ? `<span class="ls-avatar" style="background-image:url('${cssUrl(track.cover)}')"></span>`
        : `<span class="ls-avatar">${icon(track.isVideo ? 'video' : 'music')}</span>`;
      const translation = line.translation ? `<span class="ls-bubble-trans">${esc(line.translation)}</span>` : '';
      rows.push(`
        <div class="ls-bubble-row ${side} ${active ? 'active' : ''}" style="animation-delay:${(i - start) * 40}ms">
          ${avatar}
          <div class="ls-bubble">${esc(line.text)}${translation}<span class="ls-bubble-time">${fmtTime(line.time)}</span></div>
        </div>
      `);
    }
    $('#lsChat').innerHTML = rows.join('');
    requestAnimationFrame(() => {
      const active = $('#lsChat .ls-bubble-row.active');
      if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function renderImmersiveClock(index) {
    const activeIndex = Math.max(0, index);
    const start = Math.max(0, activeIndex - 2);
    const end = Math.min(ui.lyrics.length, activeIndex + 3);
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const line = ui.lyrics[i];
      const translation = line.translation ? `<span class="clock-trans">${esc(line.translation)}</span>` : '';
      rows.push(`
        <div class="ls-clock-row ${i === activeIndex ? 'active' : ''}">
          <span class="clock-time">${fmtTime(line.time)}</span>
          <span class="clock-text">${esc(line.text)}${translation}</span>
        </div>
      `);
    }
    $('#lsClock').innerHTML = rows.join('');
  }

  function renderImmersivePoem(lines, track, plain) {
    const poem = $('#lsPoem');
    poem.hidden = false;
    if (track.isRemote) {
      const isBili = track.source === 'bilibili';
      if (isBili && ui.lyricsStatus === 'instrumental') {
        poem.innerHTML = `
          <div class="poem-mark">INSTRUMENTAL</div>
          <div class="poem-title">${esc(track.title)}</div>
          <div class="poem-line" style="--i:0">${esc(track.artist)}</div>
          <div class="poem-line" style="--i:1">纯音乐 · 不用等歌词</div>
          <div class="poem-note">${esc(ui.lyricsDetail || '让qianqu陪你把这一段听完')}</div>
        `;
        return;
      }
      if (isBili && ui.lyricsStatus === 'empty') {
        poem.innerHTML = `
          <div class="poem-mark">NO SYNCED LYRICS</div>
          <div class="poem-title">${esc(track.title)}</div>
          <div class="poem-line" style="--i:0">${esc(track.artist)}</div>
          <div class="poem-line" style="--i:1">暂时没有匹配到同步歌词</div>
          <div class="poem-note">${esc(ui.lyricsDetail || '可以回到播放页点「重新匹配」')}</div>
        `;
        return;
      }
      if (isBili && ui.lyricsStatus === 'error') {
        poem.innerHTML = `
          <div class="poem-mark">LYRICS OFFLINE</div>
          <div class="poem-title">${esc(track.title)}</div>
          <div class="poem-line" style="--i:0">${esc(track.artist)}</div>
          <div class="poem-line" style="--i:1">歌词暂时没有加载出来</div>
          <div class="poem-note">${esc(ui.lyricsDetail || '检查网络后回到播放页重试')}</div>
        `;
        return;
      }
      poem.innerHTML = `
        <div class="poem-mark">${isBili ? 'BILIBILI AUDIO' : 'NETWORK AUDIO'}</div>
        <div class="poem-title">${esc(track.title)}</div>
        <div class="poem-line" style="--i:0">${esc(track.artist)}</div>
        <div class="poem-line" style="--i:1">${isBili ? '正在读取歌词' : '正在读取平台歌词'}</div>
        <div class="poem-note">${isBili ? 'B 站字幕优先，没有字幕时再匹配云歌词' : '歌词来自当前平台接口'}</div>
      `;
      return;
    }
    if (plain && lines.length) {
      poem.innerHTML = `
        <div class="poem-mark">UNSYNCED LYRICS</div>
        <div class="poem-title">${esc(track.title)}</div>
        ${lines.slice(0, 6).map((line, index) => `<div class="poem-line" style="--i:${index}">${esc(line)}</div>`).join('')}
        <div class="poem-note">未同步歌词 · 跟着音乐慢慢读</div>
      `;
    } else {
      poem.innerHTML = `
        <div class="poem-mark">INSTRUMENTAL</div>
        <div class="poem-title">${esc(track.title)}</div>
        <div class="poem-line" style="--i:0">这首歌没有歌词</div>
        <div class="poem-line" style="--i:1">也可以让qianqu陪你，安静听一会儿海</div>
        <div class="poem-note">把同名 .lrc 文件放在歌曲旁边，就能看到同步歌词</div>
      `;
    }
  }

  function renderImmersiveLoading(track) {
    const poem = $('#lsPoem');
    poem.hidden = false;
    poem.innerHTML = `
      <div class="poem-mark">READING LYRICS</div>
      <div class="poem-title">${esc(track.title)}</div>
      <div class="poem-line" style="--i:0">正在找歌词…</div>
      <div class="poem-note">${track.source === 'bilibili' ? '先找 B 站字幕，再看云歌词' : '让qianqu再看一眼这首歌旁边的文字'}</div>
    `;
  }

  function renderOnlineAccount(providerId) {
    const provider = ONLINE_PROVIDERS[providerId];
    const auth = ui.online.auth;
    if (auth.loading) {
      return `
        <section class="bili-account is-loading">
          <span class="spinner"></span>
          <div class="bili-account-copy">
            <span class="bili-account-label">${provider.name}</span>
            <strong>正在检查登录状态…</strong>
          </div>
        </section>`;
    }
    if (auth.user) {
      return `
        <section class="bili-account is-in">
          <span class="bili-account-icon">${icon('user')}</span>
          <div class="bili-account-copy">
            <span class="bili-account-label">已登录 ${provider.name}</span>
            <strong>${esc(auth.user.name || provider.name)}</strong>
            <small>可导入账号歌单，音质取决于当前账号的可用权限。</small>
          </div>
          <div class="bili-account-actions">
            <button class="round-play bili-import-btn" data-action="online-import" ${ui.online.importing ? 'disabled' : ''}>
              ${icon('download')}<span>${ui.online.importing ? '导入中…' : '导入歌单'}</span>
            </button>
            <button class="soft-btn bili-logout-btn" data-action="online-logout">退出</button>
          </div>
        </section>`;
    }
    return `
      <section class="bili-account">
        <span class="bili-account-icon">${icon('user')}</span>
        <div class="bili-account-copy">
          <span class="bili-account-label">${provider.name}</span>
          <strong>登录后可以导入账号歌单</strong>
          <small>也可以不登录，直接搜索和播放平台公开音源。${auth.error ? ` ${esc(auth.error)}` : ''}</small>
        </div>
        <div class="bili-account-actions">
          <button class="soft-btn" data-action="online-login">${icon('user')}<span>登录 ${provider.short}</span></button>
        </div>
      </section>`;
  }

  function renderOnlineRow(item) {
    const track = ui.remoteTracks.get(item.id) || onlineToRemote(item);
    const current = ui.current?.id === item.id;
    const playing = current && ui.playing;
    const favorite = isFavorite(item.id);
    const provider = ONLINE_PROVIDERS[item.source] || ONLINE_PROVIDERS[item.providerId];
    return `
      <div class="network-row ${current ? 'is-current' : ''}" data-action="play-online" data-net-id="${esc(item.id)}" role="button" tabindex="0">
        <span class="network-cover">${coverMarkup(track)}<span class="network-badge">${esc(provider?.short || '网络')}</span></span>
        <span class="network-info">
          <strong title="${esc(item.title)}">${esc(item.title)}</strong>
          <span>${esc([item.artist, item.album].filter(Boolean).join(' · ') || '未知歌手')}</span>
        </span>
        <span class="network-duration"><b>${item.duration ? fmtTime(item.duration) : '--:--'}</b><small>${esc(provider?.short || '')}</small></span>
        <span class="network-actions">
          <button class="network-fav ${favorite ? 'active' : ''}" data-action="online-favorite" data-net-id="${esc(item.id)}" title="${favorite ? '取消收藏' : '收藏到 qianqu'}">${icon(favorite ? 'heart-fill' : 'heart')}</button>
          <button class="network-play" data-action="play-online" data-net-id="${esc(item.id)}" aria-label="${playing ? '暂停' : '播放'} ${esc(item.title)}">${icon(playing ? 'pause' : 'play')}</button>
          ${item.pageUrl ? `<button class="network-open" data-action="open-net-source" data-net-id="${esc(item.id)}" title="打开来源页面">${icon('external')}</button>` : ''}
        </span>
      </div>`;
  }

  function renderOnlineResults() {
    const online = ui.online;
    if (online.loading) return renderNetworkSkeleton();
    if (online.error) {
      return `
        <div class="network-state">
          <div class="network-state-icon">${icon('wave')}</div>
          <h3>这次没连上</h3>
          <p>${esc(online.error)}</p>
          <button class="soft-btn" data-action="online-retry">${icon('repeat')}<span>再试一次</span></button>
        </div>`;
    }
    if (online.items.length) {
      return `
        <div class="network-result-head">
          <strong>“${esc(online.query)}”</strong>
          <span>${online.items.length} 个结果 · ${esc(ONLINE_PROVIDERS[online.provider]?.short)}</span>
        </div>
        <div class="network-list">${online.items.map(renderOnlineRow).join('')}</div>`;
    }
    return `
      <div class="network-state idle">
        <div class="network-state-icon">${icon('music')}</div>
        <h3>${esc(ONLINE_PROVIDERS[online.provider]?.name)}</h3>
        <p>搜索歌名、歌手或专辑。登录后可导入账号歌单；音质和可播放范围以平台账号权限为准。</p>
      </div>`;
  }

  function renderOnlineNetwork(providerId) {
    const provider = ONLINE_PROVIDERS[providerId];
    const online = ui.online;
    let html = pageHead({
      eyebrow: 'NETWORK',
      title: '网络音乐',
      subtitle: 'Bilibili、网易云、QQ 音乐、酷狗统一搜索与歌单导入，默认使用 Bilibili。',
    });
    html += `
      <section class="network-hero">
        ${networkSourceButtons(providerId)}
        <div class="network-kicker">${icon('music')}<span>${esc(provider.name.toUpperCase())} · ONLINE SOURCE</span></div>
        <h2>${esc(provider.name)}</h2>
        <p>搜索 ${esc(provider.name)} 曲库。登录后可以导入账号歌单；播放音质以当前账号能获得的最高档为准。</p>
        <div class="network-search">
          <span class="network-search-icon">${icon('search')}</span>
          <input id="netQuery" class="network-input" type="text" maxlength="80" value="${esc(online.query)}" placeholder="搜索歌名、歌手或专辑…" autocomplete="off" spellcheck="false">
          <button class="network-go" data-action="online-search" ${online.loading ? 'disabled' : ''}>
            ${online.loading ? '<span class="spinner"></span><span>搜索中</span>' : `${icon('search')}<span>搜索</span>`}
          </button>
        </div>
        <div class="network-note">${icon('sparkles')}<span>播放链接由平台接口返回；无版权、无会员或地区限制时会明确提示，不会绕过平台权限。</span></div>
      </section>`;
    html += renderOnlineAccount(providerId);
    if (online.importing) {
      html += '<div class="bili-import-strip"><span class="spinner"></span><span>正在导入歌单…</span></div>';
    }
    html += renderOnlineResults();
    return html;
  }

  function updateImmersiveContent(force = false) {
    if (!ui.immerseOpen) return;
    const track = ui.current;
    if (!track) return;
    const theme = currentLyricTheme().id;
    const index = ui.lyricIndex;
    const key = `${track.id}|${theme}|${index}|${ui.lyrics.length}|${ui.plainLyrics.length}|${ui.lyricsStatus}|${ui.lyricsDetail}`;
    if (!force && key === ui.immerseLineKey) return;
    ui.immerseLineKey = key;

    const content = $('#lsContent');
    const chat = $('#lsChat');
    const clock = $('#lsClock');
    const poem = $('#lsPoem');
    const lineEl = $('#lsLine');
    const transEl = $('#lsTrans');

    if (ui.lyrics.length) {
      poem.hidden = true;
      chat.style.display = theme === 'cappella' ? 'flex' : 'none';
      clock.style.display = theme === 'clock' ? 'flex' : 'none';
      content.style.display = theme === 'cappella' || theme === 'clock' ? 'none' : 'flex';

      const line = index >= 0 ? ui.lyrics[index] : null;
      const prev = index > 0 ? ui.lyrics[index - 1] : null;
      const next = ui.lyrics[index + 1] || (index < 0 ? ui.lyrics[0] : null);

      if (line) {
        const built = createImmersiveCharMarkup(line);
        lineEl.innerHTML = built.markup;
        lineEl.style.setProperty('--chars', String(built.count));
        transEl.textContent = line.translation || '';
        $('#lsPrev').textContent = prev?.text || '';
        $('#lsNext').textContent = next?.text || '';
      } else {
        lineEl.innerHTML = `<span class="ls-char intro">${esc(track.title)}</span>`;
        transEl.textContent = '前奏';
        $('#lsPrev').textContent = '';
        $('#lsNext').textContent = next?.text || '';
      }
      ui.immerseLitCount = -1;
      fitImmersiveText();
      if (theme === 'cappella') renderImmersiveChat(index, track);
      if (theme === 'clock') renderImmersiveClock(index);
    } else if (ui.plainLyrics.length) {
      content.style.display = 'none';
      chat.style.display = 'none';
      clock.style.display = 'none';
      renderImmersivePoem(ui.plainLyrics, track, true);
    } else {
      content.style.display = 'none';
      chat.style.display = 'none';
      clock.style.display = 'none';
      if (ui.lyricsLoading) renderImmersiveLoading(track);
      else renderImmersivePoem([], track, false);
    }
  }

  function updateImmersiveProgress(time, force = false) {
    if (!ui.immerseOpen) return;
    const media = currentMedia();
    const duration = Number.isFinite(media.duration) && media.duration > 0
      ? media.duration
      : (ui.current?.duration || 0);
    const current = Number.isFinite(time) ? time : (media.currentTime || 0);
    const fraction = duration ? Math.min(1, Math.max(0, current / duration)) : 0;
    $('#lsSeekFill').style.width = `${fraction * 100}%`;
    $('#lsSeekFill').nextElementSibling.style.left = `${fraction * 100}%`;
    $('#lsCur').textContent = fmtTime(current);
    $('#lsTotal').textContent = fmtTime(duration || ui.current?.duration || 0);

    if (!ui.lyrics.length || ui.lyricIndex < 0) return;
    const line = ui.lyrics[ui.lyricIndex];
    const next = ui.lyrics[ui.lyricIndex + 1];
    let end = next ? next.time : line.time + 5;
    if (!Number.isFinite(end) || end <= line.time + 0.25) end = line.time + 4;
    const progress = Math.min(1, Math.max(0, (current - line.time) / (end - line.time)));
    $('#lsCurrent').style.setProperty('--line-p', progress.toFixed(3));

    const chars = $$('#lsLine .ls-char:not(.ls-space)');
    if (!chars.length) return;
    const lit = Math.min(chars.length, Math.floor(progress * chars.length) + 1);
    if (!force && lit === ui.immerseLitCount) return;
    ui.immerseLitCount = lit;
    chars.forEach((char, index) => {
      char.classList.toggle('lit', index < lit);
      char.classList.toggle('current', index === lit - 1);
    });
  }

  /* Ambient particles and a subtle audio-reactive wave. */

  function resizeImmersiveCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = lyricStage.clientWidth || window.innerWidth;
    const height = lyricStage.clientHeight || window.innerHeight;
    lyricCanvas.width = Math.round(width * dpr);
    lyricCanvas.height = Math.round(height * dpr);
    lyricCanvas.style.width = `${width}px`;
    lyricCanvas.style.height = `${height}px`;
    const context = lyricCanvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    ui.immerseCanvasSize = { width, height };
  }

  function createImmersiveParticles(reset = false) {
    if (ui.immerseParticles.length && !reset) return;
    const theme = currentLyricTheme().id;
    const count = theme === 'lumi' ? 34 : theme === 'fume' ? 64 : theme === 'cad' ? 30 : theme === 'diorama' ? 26 : 48;
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      const seed = hashString(`${theme}|${ui.current?.id || 'whale'}|${i}`);
      particles.push({
        x: (seed % 1000) / 1000,
        y: ((seed >> 10) % 1000) / 1000,
        radius: 1.2 + ((seed >> 5) % 42) / 10,
        speed: 0.006 + ((seed >> 8) % 28) / 1000,
        drift: ((seed >> 12) % 200 - 100) / 1000,
        phase: ((seed >> 15) % 628) / 100,
        rotation: ((seed >> 18) % 360) * (Math.PI / 180),
        spin: (((seed >> 21) % 100) - 50) / 9000,
        kind: seed % 4,
      });
    }
    ui.immerseParticles = particles;
  }

  function ensureAudioGraph() {
    if (ui.audioGraphFailed) return null;
    if (ui.audioGraph) {
      if (ui.audioGraph.ctx.state === 'suspended') ui.audioGraph.ctx.resume().catch(() => {});
      return ui.audioGraph;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('AudioContext unavailable');
      const ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ui.audioGraph = {
        ctx,
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount),
      };
      ctx.resume().catch(() => {});
      return ui.audioGraph;
    } catch {
      ui.audioGraphFailed = true;
      return null;
    }
  }

  function startImmersiveCanvas() {
    if (ui.immerseRaf) return;
    resizeImmersiveCanvas();
    createImmersiveParticles(true);
    let last = performance.now();
    const draw = (now) => {
      ui.immerseRaf = requestAnimationFrame(draw);
      const elapsed = Math.min(60, now - last);
      last = now;
      drawImmersiveFrame(now / 1000, elapsed / 1000);
    };
    ui.immerseRaf = requestAnimationFrame(draw);
  }

  function stopImmersiveCanvas() {
    if (ui.immerseRaf) cancelAnimationFrame(ui.immerseRaf);
    ui.immerseRaf = null;
  }

  function drawImmersiveFrame(seconds, delta) {
    const context = lyricCanvas.getContext('2d');
    const size = ui.immerseCanvasSize || { width: lyricStage.clientWidth, height: lyricStage.clientHeight };
    const { width, height } = size;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const theme = currentLyricTheme().id;
    const palette = ui.palette || paletteFromHue(190, 62, 58);
    const { h, s, l } = palette;
    const color = (alpha) => `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    const color2 = (alpha) => `hsla(${palette.h2}, ${Math.max(40, s - 8)}%, ${Math.max(44, l - 6)}%, ${alpha})`;

    if (ui.audioGraph) {
      ui.audioGraph.analyser.getByteFrequencyData(ui.audioGraph.data);
      let sum = 0;
      const bins = Math.max(8, Math.floor(ui.audioGraph.data.length * 0.36));
      for (let i = 0; i < bins; i += 1) sum += ui.audioGraph.data[i];
      const target = Math.min(1, sum / bins / 150);
      ui.immerseEnergy += (target - ui.immerseEnergy) * 0.08;
    } else {
      ui.immerseEnergy = 0.24 + Math.sin(seconds * 0.8) * 0.05;
    }
    const energy = ui.immerseEnergy;

    if (theme === 'tide' || theme === 'tilt') {
      context.lineWidth = 1;
      for (let wave = 0; wave < 3; wave += 1) {
        context.beginPath();
        for (let x = -20; x <= width + 20; x += 12) {
          const y = height * (0.72 + wave * 0.055)
            + Math.sin(x * 0.0065 + seconds * (0.7 + wave * 0.16) + wave * 1.7) * (10 + energy * 22 + wave * 5)
            + Math.sin(x * 0.0021 - seconds * 0.34) * 18;
          if (x < 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = wave === 1 ? color(0.12 + energy * 0.12) : color2(0.07 + energy * 0.06);
        context.stroke();
      }
    }

    if (theme === 'clock') {
      const cx = width * 0.28;
      const cy = height * 0.5;
      for (let ring = 0; ring < 3; ring += 1) {
        context.beginPath();
        context.arc(cx, cy, Math.min(width, height) * (0.18 + ring * 0.075), 0, Math.PI * 2);
        context.strokeStyle = color(0.08 + ring * 0.025);
        context.lineWidth = 1;
        context.stroke();
      }
    }

    if (theme === 'diorama') {
      const beam = context.createLinearGradient(0, 0, 0, height);
      beam.addColorStop(0, color(0.1 + energy * 0.06));
      beam.addColorStop(0.62, color(0.02 + energy * 0.015));
      beam.addColorStop(1, color(0));
      context.fillStyle = beam;
      context.beginPath();
      context.moveTo(width * 0.37, 0);
      context.lineTo(width * 0.63, 0);
      context.lineTo(width * 0.88, height * 0.82);
      context.lineTo(width * 0.12, height * 0.82);
      context.closePath();
      context.fill();

      context.strokeStyle = color(0.12);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height * 0.82);
      context.lineTo(width, height * 0.82);
      context.stroke();
    }

    for (const particle of ui.immerseParticles) {
      const phase = seconds * (theme === 'fume' ? 0.24 : 0.4) + particle.phase;
      particle.x += particle.drift * delta;
      particle.y += (theme === 'tide' ? -1 : 0.45) * particle.speed * delta;
      particle.rotation += particle.spin * delta * 60;
      if (particle.x < -0.05) particle.x = 1.05;
      if (particle.x > 1.05) particle.x = -0.05;
      if (particle.y < -0.06) particle.y = 1.06;
      if (particle.y > 1.06) particle.y = -0.06;
      const x = particle.x * width;
      const y = particle.y * height;
      const alpha = 0.12 + (Math.sin(phase) + 1) * 0.1 + energy * 0.15;

      if (theme === 'lumi') {
        const gradient = context.createRadialGradient(x, y, 0, x, y, particle.radius * 5);
        gradient.addColorStop(0, color(alpha * 0.75));
        gradient.addColorStop(1, color(0));
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, particle.radius * 5, 0, Math.PI * 2);
        context.fill();
      } else if (theme === 'cad') {
        context.save();
        context.translate(x, y);
        context.rotate(particle.rotation + seconds * 0.08);
        context.strokeStyle = particle.kind % 2 ? color(alpha * 0.9) : color2(alpha * 0.8);
        context.lineWidth = 1;
        const side = particle.radius * 2.6;
        if (particle.kind === 0) context.strokeRect(-side / 2, -side / 2, side, side);
        else if (particle.kind === 1) {
          context.beginPath();
          context.moveTo(0, -side / 2);
          context.lineTo(side / 2, side / 2);
          context.lineTo(-side / 2, side / 2);
          context.closePath();
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(-side / 2, 0);
          context.lineTo(side / 2, 0);
          context.moveTo(0, -side / 2);
          context.lineTo(0, side / 2);
          context.stroke();
        }
        context.restore();
      } else if (theme === 'cappella') {
        context.strokeStyle = color(alpha * 0.6);
        context.lineWidth = 1;
        const arm = particle.radius * 1.3;
        context.beginPath();
        context.moveTo(x - arm, y);
        context.lineTo(x + arm, y);
        context.moveTo(x, y - arm);
        context.lineTo(x, y + arm);
        context.stroke();
      } else if (theme === 'fume') {
        context.fillStyle = `rgba(255, 236, 198, ${alpha * 0.9})`;
        context.beginPath();
        context.arc(x, y, particle.radius * 0.55, 0, Math.PI * 2);
        context.fill();
        if (particle.kind === 0) {
          context.strokeStyle = `rgba(255, 226, 170, ${alpha * 0.5})`;
          const arm = particle.radius * 1.8;
          context.beginPath();
          context.moveTo(x - arm, y);
          context.lineTo(x + arm, y);
          context.moveTo(x, y - arm);
          context.lineTo(x, y + arm);
          context.stroke();
        }
      } else if (theme === 'pat') {
        context.strokeStyle = color(alpha * 0.55);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x - particle.radius * 2.2, y);
        context.lineTo(x + particle.radius * 2.2, y);
        context.stroke();
      } else if (theme === 'diorama') {
        const beamHeight = 20 + particle.radius * 9;
        const glow = context.createLinearGradient(x, y - beamHeight, x, y + 8);
        glow.addColorStop(0, color(0));
        glow.addColorStop(0.58, color(alpha * 0.55));
        glow.addColorStop(1, color(0));
        context.fillStyle = glow;
        context.fillRect(x - particle.radius * 0.85, y - beamHeight, particle.radius * 1.7, beamHeight + 8);
        context.fillStyle = color(alpha * 0.8);
        context.beginPath();
        context.arc(x, y, particle.radius * 0.55, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = color(alpha);
        context.beginPath();
        context.arc(x, y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function bindImmersiveSeek() {
    const track = $('#lsSeekTrack');
    let dragging = false;
    const apply = (event) => {
      const rect = track.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const media = currentMedia();
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : (ui.current?.duration || 0);
      if (!duration) return;
      media.currentTime = fraction * duration;
      $('#lsSeekFill').style.width = `${fraction * 100}%`;
      $('#lsSeekFill').nextElementSibling.style.left = `${fraction * 100}%`;
      updateImmersiveProgress(fraction * duration, true);
      updateLyrics(fraction * duration, true);
    };
    track.addEventListener('pointerdown', (event) => {
      if (!ui.current) return;
      dragging = true;
      track.classList.add('dragging');
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic pointers from tests may not have an active capture. */
      }
      apply(event);
    });
    track.addEventListener('pointermove', (event) => {
      if (dragging) apply(event);
    });
    const stop = () => {
      dragging = false;
      track.classList.remove('dragging');
    };
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', stop);
  }

  function bindImmersive() {
    buildThemeTray();
    setLyricTheme(state.settings.lyricTheme, { save: false });
    $('#stageImmerse').addEventListener('click', openLyricStage);
    $('#lsClose').addEventListener('click', closeLyricStage);
    $('#lsFull').addEventListener('click', () => {
      bridge.toggleFullscreen().catch(() => {});
    });
    $('#lsPlay').addEventListener('click', () => {
      togglePlay();
      pokeImmersive();
    });
    $('#lsThemeBtn').addEventListener('click', () => cycleLyricTheme(1));
    $('#lsThemes').addEventListener('click', (event) => {
      const button = event.target.closest('[data-lyric-theme]');
      if (!button) return;
      setLyricTheme(button.dataset.lyricTheme, { announce: true });
    });
    lyricStage.addEventListener('pointermove', pokeImmersive, { passive: true });
    lyricStage.addEventListener('pointerdown', pokeImmersive, { passive: true });
    lyricStage.addEventListener('click', (event) => {
      if (event.target === lyricStage || event.target.closest('.ls-stage')) pokeImmersive();
    });
    bindImmersiveSeek();
    window.addEventListener('resize', () => {
      if (!ui.immerseOpen) return;
      resizeImmersiveCanvas();
      fitImmersiveText();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Queue                                                              */
  /* ------------------------------------------------------------------ */

  function renderQueue() {
    const list = $('#queueList');
    $('#queueOrigin').textContent = ui.queueOrigin || '还未开始播放';
    if (!ui.queue.length) {
      list.innerHTML = '<div class="queue-empty">队列是空的。<br>从音乐库挑一首，或者点“随便听听”。</div>';
      return;
    }
    list.innerHTML = ui.queue.map((id, index) => {
      const track = getTrack(id);
      if (!track) return '';
      return `
        <button class="queue-row ${index === ui.queueIndex ? 'current' : ''}" data-queue-index="${index}">
          <span class="q-index">${index === ui.queueIndex ? icon('wave') : String(index + 1).padStart(2, '0')}</span>
          <span class="q-cover">${coverMarkup(track)}</span>
          <span class="q-text"><strong>${esc(track.title)}</strong><span>${esc(track.artist)}</span></span>
          <span class="q-time">${fmtTime(track.duration)}</span>
          <span class="q-remove" data-remove-queue="${index}" title="从队列移除">${icon('close')}</span>
        </button>`;
    }).join('');
  }

  function openQueue() {
    queuePanel.classList.add('open');
    queuePanel.setAttribute('aria-hidden', 'false');
    renderQueue();
  }

  function closeQueue() {
    queuePanel.classList.remove('open');
    queuePanel.setAttribute('aria-hidden', 'true');
  }

  /* ------------------------------------------------------------------ */
  /* Header / player bindings                                           */
  /* ------------------------------------------------------------------ */

  function onPlay(media) {
    if (media !== currentMedia()) return;
    ui.playing = true;
    updatePlayIcon();
    startTicker();
    updateProgress();
    if (ui.current && !ui.current.isRemote && ui.countedId !== ui.current.id) {
      ui.countedId = ui.current.id;
      ui.current.plays = (ui.current.plays || 0) + 1;
      scheduleSave();
    }
  }

  function onPause(media) {
    if (media !== currentMedia()) return;
    ui.playing = false;
    updatePlayIcon();
    stopTicker();
    updateProgress();
  }

  function onTimeUpdate(media) {
    if (media !== currentMedia()) return;
    updateProgress();
    updateLyrics(media.currentTime);
  }

  function onLoadedMetadata(media) {
    if (media !== currentMedia() || !ui.current) return;
    if (Number.isFinite(media.duration) && media.duration > 0) {
      if (Math.abs((ui.current.duration || 0) - media.duration) > 1) {
        ui.current.duration = media.duration;
        scheduleSave();
        renderQueue();
        if (ui.view.name === 'library' || ui.view.name === 'videos' || ui.view.name === 'favorites' || ui.view.name === 'playlist') {
          const durationLabel = viewRoot.querySelector(`[data-track-id="${ui.current.id}"] .card-duration`);
          if (durationLabel) durationLabel.textContent = fmtTime(media.duration);
        }
      }
    }
    updateProgress();
  }

  function onMediaError(media) {
    if (media !== currentMedia()) return;
    if (!media.getAttribute('src')) return;
    const track = ui.current;
    if (track?.isRemote && track.source === 'bilibili') {
      if (ui.bili.resolving.has(track.id)) return;
      const retries = Number(track.streamRetry) || 0;
      if (retries < 2) {
        track.streamRetry = retries + 1;
        track.url = '';
        track.needsStream = true;
        toast('B站音频流断开了，姐姐正在重新解析…', 'warn', 3200);
        playTrack(track.id, { autoplay: true });
        return;
      }
      ui.playing = false;
      updatePlayIcon();
      toast('B站音频流暂时不可用，稍后再点一次吧', 'error', 4200);
      return;
    }
    if (track?.isRemote && ONLINE_PROVIDERS[track.source]) {
      if (ui.online.resolving.has(track.id)) return;
      const retries = Number(track.streamRetry) || 0;
      if (retries < 2) {
        track.streamRetry = retries + 1;
        track.url = '';
        track.needsStream = true;
        toast('网络音轨断开了，正在重新解析…', 'warn', 3200);
        playTrack(track.id, { autoplay: true });
        return;
      }
      ui.playing = false;
      updatePlayIcon();
      toast('网络音轨暂时不可用，可能是版权或会员限制', 'error', 4200);
      return;
    }
    ui.playing = false;
    updatePlayIcon();
    toast('这个文件无法播放，可能是编码格式不受支持', 'error', 3800);
  }

  function bindMedia(media) {
    media.addEventListener('play', () => onPlay(media));
    media.addEventListener('pause', () => onPause(media));
    media.addEventListener('timeupdate', () => onTimeUpdate(media));
    media.addEventListener('loadedmetadata', () => onLoadedMetadata(media));
    media.addEventListener('ended', () => handleEnded(media));
    media.addEventListener('error', () => onMediaError(media));
    media.addEventListener('ratechange', () => {
      if (media === currentMedia()) applyRate();
    });
  }

  function bindPlayer() {
    $('#lyricsSync')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lyric-shift]');
      if (button) {
        shiftLyricOffset(Number(button.dataset.lyricShift) || 0);
        return;
      }
      if (event.target.closest('[data-lyric-reset]')) shiftLyricOffset(0, { reset: true });
      if (event.target.closest('[data-lyric-picker]')) {
        openLyricPicker();
        return;
      }
      if (event.target.closest('[data-lyric-help]')) {
        toast('双击任意歌词行，可把该句对齐到当前播放时间；[ / ] 可微调', 'info', 5200);
      }
    });
    lyricsEl.addEventListener('click', (event) => {
      if (event.target.closest('[data-lyrics-retry]') && ui.current) {
        loadLyrics(ui.current, { force: true });
      }
    });
    lyricsEl.addEventListener('dblclick', (event) => {
      const line = event.target.closest('.lyric-line[data-line]');
      if (!line) return;
      const index = Number(line.dataset.line);
      if (Number.isInteger(index)) alignLyricLineToNow(index);
    });
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnPrev').addEventListener('click', prevTrack);
    $('#btnNext').addEventListener('click', () => nextTrack(false));
    $('#btnShuffle').addEventListener('click', () => {
      state.settings.shuffle = !state.settings.shuffle;
      applyShuffle();
      scheduleSave();
      toast(state.settings.shuffle ? '随机播放已开启' : '随机播放已关闭');
    });
    $('#btnRepeat').addEventListener('click', () => {
      const order = ['off', 'all', 'one'];
      const next = order[(order.indexOf(state.settings.repeat) + 1) % order.length];
      state.settings.repeat = next;
      applyRepeat();
      scheduleSave();
      toast(next === 'one' ? '单曲循环' : next === 'all' ? '列表循环' : '循环已关闭');
    });
    $('#btnMute').addEventListener('click', () => {
      state.settings.muted = !state.settings.muted;
      applyVolume();
      scheduleSave();
    });
    $('#btnSpeed').addEventListener('click', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      showSpeedMenu(rect.left + rect.width / 2, rect.top);
    });
    $('#miniFav').addEventListener('click', () => {
      if (ui.current) toggleFavorite(ui.current.id);
    });
    $('#miniCover').addEventListener('click', openStage);
    $('#miniTitle').addEventListener('click', openStage);
    $('#btnStage').addEventListener('click', openStage);
    $('#btnLyrics').addEventListener('click', openStage);
    $('#btnQueue').addEventListener('click', () => {
      if (queuePanel.classList.contains('open')) closeQueue();
      else openQueue();
    });
    $('#queueClose').addEventListener('click', closeQueue);
    $('#queueClear').addEventListener('click', () => {
      if (!ui.current) {
        ui.queue = [];
        ui.queueIndex = -1;
        ui.queueOrigin = '';
      } else {
        ui.queue = [ui.current.id];
        ui.queueIndex = 0;
        ui.queueOrigin = '单曲播放';
      }
      renderQueue();
      toast('队列已清空，当前歌曲会继续播放');
    });
    $('#queueList').addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-queue]');
      if (remove) {
        event.stopPropagation();
        const index = Number(remove.dataset.removeQueue);
        if (index === ui.queueIndex) {
          toast('正在播放的歌曲不能从队列移除，先切歌吧', 'warn');
          return;
        }
        ui.queue.splice(index, 1);
        if (index < ui.queueIndex) ui.queueIndex -= 1;
        renderQueue();
        return;
      }
      const row = event.target.closest('[data-queue-index]');
      if (!row) return;
      const index = Number(row.dataset.queueIndex);
      ui.queueIndex = index;
      playTrack(ui.queue[index], { autoplay: true });
      renderQueue();
    });

    $('#stageClose').addEventListener('click', closeStage);
    $('#stageFull').addEventListener('click', toggleVideoCinema);
    $('#videoCinemaExit')?.addEventListener('click', () => exitVideoCinema());
    $('#stageFav').addEventListener('click', () => {
      if (ui.current) toggleFavorite(ui.current.id);
    });
    $('#stageReveal').addEventListener('click', () => {
      if (ui.current) bridge.reveal(ui.current.path);
    });
    $('#videoBigPlay').addEventListener('click', (event) => {
      event.stopPropagation();
      togglePlay();
    });
    video.addEventListener('click', () => {
      if (ui.current?.isVideo) togglePlay();
    });
    video.addEventListener('dblclick', () => {
      if (ui.current?.isVideo) toggleVideoCinema();
    });

    bindMedia(audio);
    bindMedia(video);
    bindSeek();
    bindVolume();

    for (const media of [audio, video]) {
      media.addEventListener('volumechange', applyVolume);
    }
  }

  function bindSeek() {
    const track = $('#seekTrack');
    const updateFromPointer = (event) => {
      const rect = track.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      ui.seekDrag = fraction;
      const duration = Number.isFinite(currentMedia().duration) ? currentMedia().duration : (ui.current?.duration || 0);
      $('#seekFill').style.width = `${fraction * 100}%`;
      $('#seekKnob').style.left = `${fraction * 100}%`;
      $('#timeCur').textContent = fmtTime(fraction * duration);
    };
    track.addEventListener('pointerdown', (event) => {
      if (!ui.current) return;
      const duration = Number.isFinite(currentMedia().duration) ? currentMedia().duration : (ui.current.duration || 0);
      if (!duration) return;
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic pointers may not have an active capture. */
      }
      track.classList.add('dragging');
      updateFromPointer(event);
    });
    track.addEventListener('pointermove', (event) => {
      if (ui.seekDrag == null) return;
      updateFromPointer(event);
    });
    const commit = (event) => {
      if (ui.seekDrag == null) return;
      const media = currentMedia();
      const duration = Number.isFinite(media.duration) ? media.duration : (ui.current?.duration || 0);
      if (duration) {
        media.currentTime = ui.seekDrag * duration;
      }
      ui.seekDrag = null;
      track.classList.remove('dragging');
      updateProgress();
      if (event) track.releasePointerCapture?.(event.pointerId);
    };
    track.addEventListener('pointerup', commit);
    track.addEventListener('pointercancel', commit);
    track.addEventListener('keydown', (event) => {
      if (!ui.current) return;
      const media = currentMedia();
      if (event.key === 'ArrowLeft') {
        media.currentTime = Math.max(0, media.currentTime - 5);
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        media.currentTime = Math.min(media.duration || media.currentTime + 5, media.currentTime + 5);
        event.preventDefault();
      }
      updateProgress();
    });
  }

  function bindVolume() {
    const track = $('#volTrack');
    const update = (event) => {
      const rect = track.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      state.settings.volume = fraction;
      if (fraction > 0) state.settings.muted = false;
      applyVolume();
      scheduleSave();
    };
    track.addEventListener('pointerdown', (event) => {
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic pointers may not have an active capture. */
      }
      ui.volumeDrag = true;
      update(event);
    });
    track.addEventListener('pointermove', (event) => {
      if (ui.volumeDrag) update(event);
    });
    const end = (event) => {
      ui.volumeDrag = false;
      if (event) track.releasePointerCapture?.(event.pointerId);
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        state.settings.volume = Math.min(1, Math.max(0, state.settings.volume + (event.key === 'ArrowRight' ? 0.05 : -0.05)));
        state.settings.muted = false;
        applyVolume();
        scheduleSave();
        event.preventDefault();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Menus / modal                                                      */
  /* ------------------------------------------------------------------ */

  function positionMenu(menu, x, y) {
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    const rect = menu.getBoundingClientRect();
    const barHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar')) || 94;
    const maxBottom = window.innerHeight - barHeight - 12;
    const left = Math.max(10, Math.min(x, window.innerWidth - rect.width - 12));
    const top = Math.max(10, Math.min(y, maxBottom - rect.height));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';
    ui.menuOpenAt = Date.now();
  }

  function hideMenus() {
    contextMenu.classList.remove('open');
    contextMenu.setAttribute('aria-hidden', 'true');
    $('#addPopover')?.classList.remove('is-open');
  }

  function showSpeedMenu(x, y) {
    contextMenu.innerHTML = `
      <div class="ctx-label">播放速度</div>
      ${[0.75, 1, 1.25, 1.5, 2].map((rate) => `
        <button class="ctx-item" data-speed="${rate}">
          ${state.settings.speed === rate ? icon('check') : '<span style="width:15px"></span>'}
          <span>${rate}×</span>
        </button>`).join('')}`;
    positionMenu(contextMenu, x - 100, y - 190);
    $$('[data-speed]', contextMenu).forEach((button) => {
      button.addEventListener('click', () => {
        state.settings.speed = Number(button.dataset.speed);
        applyRate();
        scheduleSave();
        hideMenus();
        toast(`播放速度 ${state.settings.speed}×`);
      });
    });
  }

  function showTrackMenu(track, x, y, playlistId = null) {
    const favorite = isFavorite(track.id);
    const inPlaylist = playlistId && getPlaylist(playlistId)?.trackIds.includes(track.id);
    const remote = Boolean(track.isRemote);
    const bili = track.source === 'bilibili';
    const canSave = !remote || bili;
    contextMenu.innerHTML = `
      <button class="ctx-item" data-menu-action="play">${icon('play')}<span>播放</span></button>
      <button class="ctx-item" data-menu-action="next">${icon('next')}<span>下一首播放</span></button>
      ${canSave ? `<button class="ctx-item" data-menu-action="favorite">${icon(favorite ? 'heart-fill' : 'heart')}<span>${favorite ? '取消收藏' : '收藏'}</span></button>
      <button class="ctx-item" data-menu-action="playlist">${icon('playlist')}<span>添加到歌单…</span></button>` : ''}
      <div class="ctx-sep"></div>
      ${remote && track.pageUrl ? `<button class="ctx-item" data-menu-action="source">${icon('external')}<span>${bili ? '打开 B 站视频页' : '打开来源页面'}</span></button>` : ''}
      ${!remote ? `<button class="ctx-item" data-menu-action="reveal">${icon('folder')}<span>在文件夹中显示</span></button>` : ''}
      ${inPlaylist ? `<button class="ctx-item" data-menu-action="unplaylist">${icon('close')}<span>从歌单移除</span></button>` : ''}
      <div class="ctx-sep"></div>
      <button class="ctx-item danger" data-menu-action="remove">${icon('trash')}<span>${remote ? '从qianqu移除' : '从音乐库移除'}</span></button>
    `;
    positionMenu(contextMenu, x, y);
    contextMenu.onclick = async (event) => {
      const button = event.target.closest('[data-menu-action]');
      if (!button) return;
      const action = button.dataset.menuAction;
      hideMenus();
      if (action === 'play') {
        playFromList(track.id);
      } else if (action === 'next') {
        setNextUp(track.id);
      } else if (action === 'favorite') {
        toggleFavorite(track.id);
      } else if (action === 'playlist') {
        openAddToPlaylist(track);
      } else if (action === 'source') {
        if (track.pageUrl) bridge.openExternal(track.pageUrl);
      } else if (action === 'reveal') {
        if (track.path) bridge.reveal(track.path);
      } else if (action === 'unplaylist' && playlistId) {
        removeFromPlaylist(playlistId, track.id);
      } else if (action === 'remove') {
        await removeTrack(track);
      }
    };
  }

  function showPlaylistMenu(playlist, x, y) {
    contextMenu.innerHTML = `
      <button class="ctx-item" data-menu-action="play">${icon('play')}<span>播放歌单</span></button>
      <button class="ctx-item" data-menu-action="rename">${icon('lyrics')}<span>重命名</span></button>
      <button class="ctx-item" data-menu-action="new">${icon('plus')}<span>新建歌单</span></button>
      <div class="ctx-sep"></div>
      <button class="ctx-item danger" data-menu-action="delete">${icon('trash')}<span>删除歌单</span></button>`;
    positionMenu(contextMenu, x, y);
    contextMenu.onclick = (event) => {
      const button = event.target.closest('[data-menu-action]');
      if (!button) return;
      hideMenus();
      if (button.dataset.menuAction === 'play') {
        const tracks = playlist.trackIds.map(getTrack).filter(Boolean);
        ui.view = { name: 'playlist', id: playlist.id };
        ui.query = '';
        if (searchInput) searchInput.value = '';
        searchWrap?.classList.remove('has-value');
        setPlaybackContext(tracks, playlist.name);
        ui.queue = tracks.map((track) => track.id);
        ui.queueIndex = 0;
        ui.queueOrigin = playlist.name;
        renderQueue();
        if (tracks.length) playTrack(tracks[0].id);
        render();
      } else if (button.dataset.menuAction === 'rename') {
        openRenamePlaylist(playlist);
      } else if (button.dataset.menuAction === 'new') {
        openCreatePlaylist();
      } else if (button.dataset.menuAction === 'delete') {
        openDeletePlaylist(playlist);
      }
    };
  }

  function openModal({ title, body, actions = [], onMount }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    const footer = $('#modalActions');
    footer.innerHTML = '';
    for (const action of actions) {
      const button = document.createElement('button');
      button.className = action.kind === 'primary' ? 'round-play' : 'soft-btn';
      button.textContent = action.label;
      if (action.danger) {
        button.classList.add('danger');
        button.style.color = '#ff97a5';
        button.style.borderColor = 'rgba(255,107,125,.25)';
      }
      button.addEventListener('click', () => action.onClick(closeModal));
      footer.appendChild(button);
    }
    modalRoot.classList.add('open');
    modalRoot.setAttribute('aria-hidden', 'false');
    if (onMount) requestAnimationFrame(() => onMount());
  }

  function closeModal() {
    modalRoot.classList.remove('open');
    modalRoot.setAttribute('aria-hidden', 'true');
  }

  function openCreatePlaylist(trackId = null) {
    openModal({
      title: '新建歌单',
      body: `<p>给这片小海域起个名字。</p><div class="field"><label for="playlistName">歌单名称</label><input id="playlistName" maxlength="40" placeholder="例如：深夜的海" autocomplete="off"></div>`,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '创建',
          kind: 'primary',
          onClick: (close) => {
            const input = $('#playlistName');
            const name = input.value.trim();
            if (!name) {
              input.focus();
              toast('先给歌单起个名字吧', 'warn');
              return;
            }
            const playlist = {
              id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              name,
              trackIds: [],
              createdAt: Date.now(),
            };
            state.playlists.push(playlist);
            if (trackId) {
              playlist.trackIds.push(trackId);
              const track = getTrack(trackId);
              if (track?.source === 'bilibili') rememberBiliTrack(track);
            }
            renderSidebarPlaylists();
            scheduleSave();
            close();
            toast(`歌单「${name}」已创建`);
            if (!trackId) switchView('playlist', playlist.id);
          },
        },
      ],
      onMount: () => {
        const input = $('#playlistName');
        input.focus();
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            $('.modal-actions .round-play')?.click();
          }
        });
      },
    });
  }

  function openRenamePlaylist(playlist) {
    openModal({
      title: '重命名歌单',
      body: `<div class="field"><label for="playlistName">歌单名称</label><input id="playlistName" maxlength="40" value="${esc(playlist.name)}" autocomplete="off"></div>`,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '保存',
          kind: 'primary',
          onClick: (close) => {
            const name = $('#playlistName').value.trim();
            if (!name) return;
            playlist.name = name;
            renderSidebarPlaylists();
            scheduleSave();
            if (ui.view.name === 'playlist' && ui.view.id === playlist.id) render();
            close();
            toast('歌单已重命名');
          },
        },
      ],
      onMount: () => {
        const input = $('#playlistName');
        input.focus();
        input.select();
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            $('.modal-actions .round-play')?.click();
          }
        });
      },
    });
  }

  async function openDeletePlaylist(playlist) {
    const ok = await bridge.confirm({
      title: '删除歌单',
      message: `确定删除「${playlist.name}」吗？`,
      detail: '只会删除歌单，不会删除音乐文件。',
      confirmLabel: '删除',
    });
    if (!ok) return;
    state.playlists = state.playlists.filter((item) => item.id !== playlist.id);
    renderSidebarPlaylists();
    scheduleSave();
    if (ui.view.name === 'playlist' && ui.view.id === playlist.id) switchView('library');
    toast('歌单已删除');
  }

  function openAddToPlaylist(track) {
    if (!state.playlists.length) {
      openModal({
        title: '添加到歌单',
        body: '<p>你还没有歌单，先创建一个吧。</p>',
        actions: [
          { label: '取消', onClick: (close) => close() },
          {
            label: '新建歌单',
            kind: 'primary',
            onClick: (close) => {
              close();
              openCreatePlaylist(track.id);
            },
          },
        ],
      });
      return;
    }
    openModal({
      title: '添加到歌单',
      body: `
        <p>把「${esc(track.title)}」放进：</p>
        <div class="playlist-pick">
          ${state.playlists.map((playlist) => `
            <button class="pick-row" data-pick="${esc(playlist.id)}">
              <span class="pick-icon">${icon('playlist')}</span>
              <span>${esc(playlist.name)}</span>
              <em>${playlist.trackIds.length} 首</em>
            </button>`).join('')}
        </div>`,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '新建歌单',
          onClick: (close) => {
            close();
            openCreatePlaylist(track.id);
          },
        },
      ],
      onMount: () => {
        $$('[data-pick]', $('#modalBody')).forEach((button) => {
          button.addEventListener('click', () => {
            const playlist = getPlaylist(button.dataset.pick);
            if (!playlist) return;
            if (!playlist.trackIds.includes(track.id)) playlist.trackIds.push(track.id);
            if (track.source === 'bilibili') rememberBiliTrack(track);
            renderSidebarPlaylists();
            scheduleSave();
            closeModal();
            toast(`已添加到「${playlist.name}」`);
            if (ui.view.name === 'playlist' && ui.view.id === playlist.id) render();
          });
        });
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Track / playlist actions                                           */
  /* ------------------------------------------------------------------ */

  function addToPlaylist(playlistId, trackId) {
    const playlist = getPlaylist(playlistId);
    if (!playlist) return;
    if (!playlist.trackIds.includes(trackId)) playlist.trackIds.push(trackId);
    const track = getTrack(trackId);
    if (track?.source === 'bilibili') rememberBiliTrack(track);
    scheduleSave();
    renderSidebarPlaylists();
  }

  function removeFromPlaylist(playlistId, trackId) {
    const playlist = getPlaylist(playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    scheduleSave();
    renderSidebarPlaylists();
    if (ui.view.name === 'playlist' && ui.view.id === playlistId) render();
    toast('已从歌单移除');
  }

  function setNextUp(trackId) {
    if (!ui.queue.length) {
      ui.queue = [trackId];
      ui.queueIndex = 0;
      ui.queueOrigin = '单曲播放';
      renderQueue();
      toast('已加入播放队列');
      return;
    }
    if (trackId === ui.current?.id) {
      toast('这首正在播放');
      return;
    }
    ui.queue = ui.queue.filter((id, index) => id !== trackId || index === ui.queueIndex);
    ui.queueIndex = ui.queue.indexOf(ui.current?.id);
    if (ui.queueIndex < 0) ui.queueIndex = 0;
    ui.queue.splice(ui.queueIndex + 1, 0, trackId);
    renderQueue();
    toast('将在下一首播放');
  }

  function toggleFavorite(trackId) {
    const track = getTrack(trackId);
    if (!track) return;
    if (track.isRemote && track.source !== 'bilibili' && !ONLINE_PROVIDERS[track.source]) {
      toast('这首网络曲目暂不支持收藏', 'warn');
      return;
    }
    if (isFavorite(trackId)) {
      state.favorites = state.favorites.filter((id) => id !== trackId);
      toast('已取消收藏');
    } else {
      state.favorites.push(trackId);
      if (track.source === 'bilibili') rememberBiliTrack(track);
      else if (ONLINE_PROVIDERS[track.source]) rememberOnlineTrack(track);
      toast('已收藏');
    }
    scheduleSave();
    updateFavoriteUi(trackId);
    updateSidebar();
    if (ui.view.name === 'favorites' && !ui.query) render();
  }

  function toggleBiliFavorite(id) {
    let track = getTrack(id);
    if (!track) {
      const item = findNetworkItem(id);
      if (item?.source === 'bilibili') {
        track = biliToRemote(item);
        ui.remoteTracks.set(track.id, track);
      }
    }
    if (!track) return;
    toggleFavorite(track.id);
    if (ui.view.name === 'network' && !ui.query) render();
  }

  function updateFavoriteUi(trackId) {
    const favorite = isFavorite(trackId);
    for (const button of [$('#miniFav'), $('#stageFav')]) {
      if (!button) continue;
      if (ui.current?.id === trackId) {
        button.classList.toggle('active', favorite);
        button.querySelector('use')?.setAttribute('href', favorite ? '#i-heart-fill' : '#i-heart');
      }
    }
    const stageLabel = $('#stageFav span');
    if (stageLabel && ui.current?.id === trackId) stageLabel.textContent = favorite ? '已收藏' : '收藏';
    $('#navFavCount').textContent = state.favorites.length;
  }

  async function removeTrack(track) {
    const remote = Boolean(track.isRemote);
    const ok = await bridge.confirm({
      title: remote ? '从qianqu移除' : '从音乐库移除',
      message: `确定移除「${track.title}」吗？`,
      detail: remote
        ? (track.source === 'bilibili'
          ? '只会从qianqu的收藏、歌单和最近播放里移除，不会删除 B 站视频。'
          : '只会从qianqu的收藏、歌单和最近播放里移除，不会删除来源页面。')
        : '只会从qianqu的列表里移除，不会删除电脑上的文件。',
      confirmLabel: '移除',
    });
    if (!ok) return;
    if (remote) {
      state.biliTracks = state.biliTracks.filter((item) => item.id !== track.id);
      state.onlineTracks = state.onlineTracks.filter((item) => item.id !== track.id);
      ui.remoteTracks.delete(track.id);
    } else {
      state.tracks = state.tracks.filter((item) => item.id !== track.id);
    }
    state.favorites = state.favorites.filter((id) => id !== track.id);
    state.recent = state.recent.filter((id) => id !== track.id);
    state.playlists.forEach((playlist) => {
      playlist.trackIds = playlist.trackIds.filter((id) => id !== track.id);
    });
    ui.queue = ui.queue.filter((id) => id !== track.id);
    if (ui.queueIndex >= ui.queue.length) ui.queueIndex = ui.queue.length - 1;
    if (ui.current?.id === track.id) {
      stopMedia();
      ui.current = null;
      updatePlayerBar();
      closeStage();
    }
    renderQueue();
    renderSidebarPlaylists();
    scheduleSave();
    render();
    toast(remote ? '已从qianqu移除' : '已从音乐库移除');
  }

  /* ------------------------------------------------------------------ */
  /* Import                                                             */
  /* ------------------------------------------------------------------ */

  function mergeTracks(incoming) {
    let added = 0;
    let updated = 0;
    for (const track of incoming) {
      if (!track || !track.path) continue;
      const existing = state.tracks.find((item) => item.path === track.path);
      if (existing) {
        Object.assign(existing, track, { addedAt: existing.addedAt || track.addedAt });
        updated += 1;
      } else {
        state.tracks.push(track);
        added += 1;
      }
    }
    return { added, updated };
  }

  async function importResult(result) {
    if (!result) return;
    if (!result.tracks?.length) {
      toast('没有找到支持的音视频文件', 'warn', 3400);
      return;
    }
    const { added, updated } = mergeTracks(result.tracks);
    scheduleSave();
    renderSidebarPlaylists();
    if (ui.view.name === 'home' || ui.view.name === 'library' || ui.view.name === 'videos' || ui.view.name === 'recent' || ui.view.name === 'favorites' || ui.query) {
      render();
    }
    const pieces = [];
    if (added) pieces.push(`新增 ${added} 首`);
    if (updated && !added) pieces.push(`刷新了 ${updated} 首`);
    if (result.errors) pieces.push(`${result.errors} 个读取失败`);
    toast(pieces.join('，') || `已读取 ${result.tracks.length} 首`);
  }

  async function addFiles() {
    try {
      showScan();
      const result = await bridge.openFiles();
      await importResult(result);
    } catch (error) {
      toast('打开文件失败', 'error');
    } finally {
      hideScanSoon();
    }
  }

  async function addFolder() {
    try {
      showScan();
      const result = await bridge.openFolder();
      await importResult(result);
    } catch (error) {
      toast('扫描文件夹失败', 'error');
    } finally {
      hideScanSoon();
    }
  }

  async function importDroppedPaths(paths) {
    if (!paths.length) return;
    try {
      showScan();
      const result = await bridge.importPaths(paths);
      await importResult(result);
    } catch {
      toast('导入失败，请再试一次', 'error');
    } finally {
      hideScanSoon();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Event wiring                                                       */
  /* ------------------------------------------------------------------ */

  function onViewClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const actionElement = target?.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    const id = actionElement.dataset.id;
    if (action === 'play' && id) {
      if (actionElement.dataset.context === 'recent') {
        const recentIds = state.recent.filter((recentId) => getTrack(recentId));
        playWithContext(recentIds, id, '最近播放');
        return;
      }
      playFromList(id);
      return;
    }
    if (action === 'menu' && id) {
      const track = getTrack(id);
      if (!track) return;
      const rect = actionElement.getBoundingClientRect();
      const playlistId = ui.view.name === 'playlist' ? ui.view.id : null;
      showTrackMenu(track, rect.right - 6, rect.bottom + 6, playlistId);
      return;
    }
    if (action === 'play-all') {
      playAll(ui.currentList.map(getTrack).filter(Boolean));
    } else if (action === 'shuffle-all') {
      shuffleAll(ui.currentList.map(getTrack).filter(Boolean));
    } else if (action === 'hero-random') {
      playRandom();
    } else if (action === 'add-files') {
      addFiles();
    } else if (action === 'add-folder') {
      addFolder();
    } else if (action === 'go-library') {
      switchView('library');
    } else if (action === 'go-videos') {
      switchView('videos');
    } else if (action === 'go-favorites') {
      switchView('favorites');
    } else if (action === 'go-recent') {
      switchView('recent');
    } else if (action === 'go-network') {
      switchView('network');
    } else if (action === 'net-search') {
      const activeQuery = ui.network.source === 'bilibili' ? ui.bili.query : ui.online.query;
      searchActiveNetwork($('#netQuery')?.value || activeQuery);
    } else if (action === 'online-search') {
      searchOnlineProvider($('#netQuery')?.value || ui.online.query);
    } else if (action === 'net-retry') {
      if (ui.network.source === 'bilibili') {
        if (ui.bili.mode === 'search') searchBilibili(ui.bili.query);
        else loadBiliMode(ui.bili.mode, true);
      } else if (ONLINE_PROVIDERS[ui.network.source]) {
        searchOnlineProvider(ui.online.query);
      }
    } else if (action === 'online-retry') {
      searchOnlineProvider(ui.online.query);
    } else if (action === 'net-source') {
      setNetworkSource(actionElement.dataset.source);
    } else if (action === 'bili-mode') {
      setBiliMode(actionElement.dataset.mode);
    } else if (action === 'bili-retry') {
      if (ui.bili.mode === 'search') searchBilibili(ui.bili.query);
      else loadBiliMode(ui.bili.mode, true);
    } else if (action === 'bili-login') {
      loginBili();
    } else if (action === 'bili-auth-retry') {
      refreshBiliAuth(true);
    } else if (action === 'bili-logout') {
      logoutBili();
    } else if (action === 'bili-import') {
      openBiliImportModal();
    } else if (action === 'online-login') {
      loginOnlineProvider();
    } else if (action === 'online-logout') {
      logoutOnlineProvider();
    } else if (action === 'online-import') {
      openOnlineImportModal();
    } else if (action === 'net-example') {
      searchActiveNetwork(actionElement.dataset.query || '');
    } else if (action === 'play-net') {
      playNetworkTrack(actionElement.dataset.netId);
    } else if (action === 'play-online') {
      playOnlineItem(actionElement.dataset.netId);
    } else if (action === 'bili-favorite') {
      toggleBiliFavorite(actionElement.dataset.netId);
    } else if (action === 'online-favorite') {
      toggleOnlineFavorite(actionElement.dataset.netId);
    } else if (action === 'open-net-source') {
      const track = getTrack(actionElement.dataset.netId);
      if (track?.pageUrl) bridge.openExternal(track.pageUrl);
    } else if (action === 'new-playlist') {
      openCreatePlaylist();
    } else if (action === 'clear-search') {
      clearSearch();
    } else if (action === 'rename-playlist') {
      const playlist = getPlaylist(ui.view.id);
      if (playlist) openRenamePlaylist(playlist);
    } else if (action === 'sync-bili-playlist') {
      syncBiliPlaylist(ui.view.id);
    } else if (action === 'delete-playlist') {
      const playlist = getPlaylist(ui.view.id);
      if (playlist) openDeletePlaylist(playlist);
    }
  }

  function onViewChange(event) {
    if (event.target.id === 'sortSelect') {
      state.settings.sort = event.target.value;
      scheduleSave();
      render();
    }
  }

  function clearSearch() {
    ui.query = '';
    if (searchInput) searchInput.value = '';
    searchWrap?.classList.remove('has-value');
    render();
  }

  function bindNavigation() {
    $$('.nav-item').forEach((item) => {
      item.addEventListener('click', () => switchView(item.dataset.nav));
    });
    $('#playlistList').addEventListener('click', (event) => {
      const item = event.target.closest('.playlist-item');
      if (item) switchView('playlist', item.dataset.playlist);
    });
    viewRoot.addEventListener('click', onViewClick);
    viewRoot.addEventListener('contextmenu', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-track-id]') : null;
      if (!target) return;
      const track = getTrack(target.dataset.trackId);
      if (!track) return;
      event.preventDefault();
      const playlistId = ui.view.name === 'playlist' ? ui.view.id : null;
      showTrackMenu(track, event.clientX, event.clientY, playlistId);
    });
    viewRoot.addEventListener('change', onViewChange);
    viewRoot.addEventListener('input', (event) => {
      if (event.target.id === 'netQuery') {
        if (ui.network.source === 'bilibili') ui.bili.query = event.target.value;
        else if (ONLINE_PROVIDERS[ui.network.source]) ui.online.query = event.target.value;
      }
    });
    viewRoot.addEventListener('keydown', (event) => {
      if (event.target.id === 'netQuery' && event.key === 'Enter') {
        event.preventDefault();
        searchActiveNetwork(event.target.value);
        return;
      }
      if (event.target.closest?.('.network-row') && (event.key === 'Enter' || event.key === ' ')) {
        const row = event.target.closest('.network-row');
        event.preventDefault();
        event.stopPropagation();
        playNetworkTrack(row.dataset.netId);
      }
    });
    viewRoot.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (chip) {
        state.settings.filter = chip.dataset.filter;
        scheduleSave();
        render();
        return;
      }
      const layout = event.target.closest('[data-layout]');
      if (layout) {
        state.settings.layout = layout.dataset.layout;
        scheduleSave();
        render();
      }
    });
    $('#btnNewPlaylist').addEventListener('click', () => openCreatePlaylist());
    $('#btnTipFolder').addEventListener('click', addFolder);
  }

  function bindChrome() {
    $('#winMin').addEventListener('click', () => bridge.minimize());
    $('#winMax').addEventListener('click', () => bridge.toggleMaximize());
    $('#winClose').addEventListener('click', () => bridge.close());
    const winControls = document.querySelector('.win-controls');
    if (winControls) {
      const winButtons = [...winControls.querySelectorAll('.win-btn')];
      const clearWinHover = () => {
        winButtons.forEach((button) => button.classList.remove('is-pointer-hover'));
      };
      const updateWinHover = (event) => {
        let hit = null;
        for (const button of winButtons) {
          const rect = button.getBoundingClientRect();
          if (
            event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom
          ) {
            hit = button;
            break;
          }
        }
        winButtons.forEach((button) => button.classList.toggle('is-pointer-hover', button === hit));
      };
      document.addEventListener('pointermove', updateWinHover, { passive: true });
      document.addEventListener('mouseleave', clearWinHover);
      window.addEventListener('blur', clearWinHover);
      winControls.addEventListener('click', (event) => {
        if (event.target.closest('.win-btn')) return;
        const buttons = [...winControls.querySelectorAll('.win-btn')];
        let picked = buttons[0];
        for (const button of buttons) {
          if (event.clientX >= button.getBoundingClientRect().left) picked = button;
        }
        if (picked) picked.click();
      });
    }
    $('.topbar').addEventListener('dblclick', (event) => {
      if (event.target.closest('button, input')) return;
      bridge.toggleMaximize();
    });
    bridge.onWindowState((windowState) => {
      ui.windowFullscreen = Boolean(windowState.fullscreen);
      const maxUse = $('#winMax use');
      maxUse.setAttribute('href', windowState.maximized ? '#i-restore' : '#i-max');
      $('#winMax').setAttribute('aria-label', windowState.maximized ? '还原' : '最大化');
      $('#winMax').setAttribute('title', windowState.maximized ? '还原 (双击标题栏)' : '最大化 (双击标题栏)');
      document.body.classList.toggle('is-fullscreen', Boolean(windowState.fullscreen));
      if (ui.videoCinema && !windowState.fullscreen) {
        exitVideoCinema({ keepWindow: true });
      }
      $('#stageFull use').setAttribute('href', windowState.fullscreen ? '#i-exit-fullscreen' : '#i-fullscreen');
    });
    document.addEventListener('pointerdown', (event) => {
      if (Date.now() - ui.menuOpenAt < 80) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !contextMenu.contains(target)) {
        contextMenu.classList.remove('open');
        contextMenu.setAttribute('aria-hidden', 'true');
      }
      if (!target || (!queuePanel.contains(target) && !target.closest('#btnQueue'))) {
        closeQueue();
      }
    });
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (ui.videoCinema) {
          event.preventDefault();
          event.stopImmediatePropagation();
          exitVideoCinema();
          return;
        }
        if (modalRoot.classList.contains('open')) {
          closeModal();
          return;
        }
        if (contextMenu.classList.contains('open')) {
          hideMenus();
          return;
        }
        if (queuePanel.classList.contains('open')) {
          closeQueue();
          return;
        }
        if (ui.immerseOpen) {
          closeLyricStage();
          return;
        }
        if (stage.classList.contains('open')) {
          closeStage();
        }
      }
    });
  }

  function bindSearch() {
    if (!searchInput || !searchWrap) return;
    let timer = null;
    const applySearch = () => {
      clearTimeout(timer);
      ui.query = searchInput.value.trim();
      viewScroll.scrollTop = 0;
      render();
    };
    searchInput.addEventListener('input', () => {
      const value = searchInput.value;
      searchWrap.classList.toggle('has-value', Boolean(value));
      clearTimeout(timer);
      timer = setTimeout(applySearch, 120);
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applySearch();
        return;
      }
      if (event.key === 'Escape') {
        clearSearch();
        searchInput.blur();
      }
    });
    const searchIcon = $('.search > .icon');
    if (searchIcon) {
      searchIcon.addEventListener('click', (event) => {
        event.preventDefault();
        searchInput.focus();
        if (searchInput.value.trim()) applySearch();
      });
    }
    searchWrap.addEventListener('click', (event) => {
      if (event.target.closest('#searchClear')) return;
      searchInput.focus();
    });
    $('#searchClear').addEventListener('click', clearSearch);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const netInput = ui.view.name === 'network' && !ui.query ? $('#netQuery') : null;
        if (netInput) {
          netInput.focus();
          netInput.select();
          return;
        }
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  function bindShortcuts() {
    document.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape' && ui.videoCinema) {
        event.preventDefault();
        exitVideoCinema();
        return;
      }
      if (event.key === 'F11') {
        event.preventDefault();
        bridge.toggleFullscreen().catch(() => {});
        return;
      }
      if (mod && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        bridge.minimize();
        return;
      }
      const tag = event.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable;
      if (typing) return;
      if (ui.immerseOpen) pokeImmersive();
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        if (event.shiftKey) addFolder();
        else addFiles();
        return;
      }
      if (mod && event.key.toLowerCase() === 'k') return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowRight') {
        if (!ui.current) return;
        const media = currentMedia();
        media.currentTime = Math.min(media.duration || media.currentTime + 5, media.currentTime + 5);
        updateProgress();
        event.preventDefault();
      } else if (event.key === 'ArrowLeft') {
        if (!ui.current) return;
        const media = currentMedia();
        media.currentTime = Math.max(0, media.currentTime - 5);
        updateProgress();
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        state.settings.volume = Math.min(1, state.settings.volume + 0.05);
        state.settings.muted = false;
        applyVolume();
        scheduleSave();
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        state.settings.volume = Math.max(0, state.settings.volume - 0.05);
        applyVolume();
        scheduleSave();
        event.preventDefault();
      } else if (['[', ']', '{', '}'].includes(event.key)) {
        event.preventDefault();
        const small = event.key === '{' || event.key === '}';
        const direction = event.key === '[' || event.key === '{' ? -1 : 1;
        shiftLyricOffset(direction * (small ? 0.1 : 0.5));
      } else if (event.key === '\\') {
        event.preventDefault();
        shiftLyricOffset(0, { reset: true });
      } else if (event.key.toLowerCase() === 'm') {
        state.settings.muted = !state.settings.muted;
        applyVolume();
        scheduleSave();
      } else if (event.key.toLowerCase() === 'l') {
        if (ui.immerseOpen) closeLyricStage();
        else openLyricStage();
      } else if (event.key.toLowerCase() === 't' && ui.immerseOpen) {
        cycleLyricTheme(1);
      } else if (event.key.toLowerCase() === 'f') {
        if (ui.current) toggleFavorite(ui.current.id);
      } else if (event.key.toLowerCase() === 'q') {
        if (queuePanel.classList.contains('open')) closeQueue();
        else openQueue();
      } else if (event.key.toLowerCase() === 'n') {
        nextTrack(false);
      } else if (event.key.toLowerCase() === 'p') {
        prevTrack();
      }
    });
  }

  function bindDrag() {
    let depth = 0;
    window.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      depth += 1;
      dropOverlay.classList.add('show');
      dropOverlay.setAttribute('aria-hidden', 'false');
    });
    window.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    });
    window.addEventListener('dragleave', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        dropOverlay.classList.remove('show');
        dropOverlay.setAttribute('aria-hidden', 'true');
      }
    });
    window.addEventListener('drop', async (event) => {
      event.preventDefault();
      depth = 0;
      dropOverlay.classList.remove('show');
      dropOverlay.setAttribute('aria-hidden', 'true');
      const files = Array.from(event.dataTransfer?.files || []);
      const paths = files.map((file) => bridge.getPathForFile(file)).filter(Boolean);
      if (paths.length) await importDroppedPaths(paths);
      else toast('没有读取到文件路径', 'warn');
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const actions = {
      play: () => togglePlay(),
      pause: () => { if (ui.playing) currentMedia().pause(); },
      previoustrack: () => prevTrack(),
      nexttrack: () => nextTrack(false),
      seekbackward: (details) => { currentMedia().currentTime = Math.max(0, currentMedia().currentTime - (details.seekOffset || 10)); },
      seekforward: (details) => { currentMedia().currentTime = Math.min(currentMedia().duration || 0, currentMedia().currentTime + (details.seekOffset || 10)); },
      seekto: (details) => { if (Number.isFinite(details.seekTime)) currentMedia().currentTime = details.seekTime; },
    };
    for (const [name, handler] of Object.entries(actions)) {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        /* unsupported action */
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  async function validateLibrary() {
    if (!state.tracks.length) return;
    try {
      const missing = await bridge.validatePaths(state.tracks.map((track) => track.path));
      if (!missing.length) return;
      const set = new Set(missing);
      state.tracks.forEach((track) => {
        if (set.has(track.path)) track.missing = true;
      });
      render();
      toast(`有 ${missing.length} 个文件找不到了，已标记出来`, 'warn', 4200);
    } catch {
      /* validation is best-effort */
    }
  }

  async function init() {
    paintStaticFallbacks();
    applyVolume();
    applyRate();
    applyRepeat();
    applyShuffle();
    bindChrome();
    bindNavigation();
    bindPlayer();
    bindSearch();
    bindShortcuts();
    bindDrag();
    bindImmersive();
    bindMediaSession();

    bridge.onScanProgress(updateScan);
    let loaded = null;
    try {
      loaded = await bridge.loadState();
    } catch {
      loaded = null;
    }
    normalizeLoadedState(loaded);
    applyVolume();
    applyRate();
    applyRepeat();
    applyShuffle();
    setLyricTheme(state.settings.lyricTheme, { save: false });
    renderSidebarPlaylists();
    render();
    refreshBiliAuth();

    if (state.lastPlayedId) {
      const track = getTrack(state.lastPlayedId);
      if (track) {
        ui.current = track;
        if (track.isRemote && track.source === 'bilibili' && !track.url) {
          updatePlayerBar();
          updatePlayIcon();
          updateProgress();
        } else {
          const media = track.isVideo ? video : audio;
          setMediaUrl(media, track.url);
          media.dataset.trackId = track.id;
          media.dataset.streamUrl = String(track.url || '');
          media.load();
          updatePlayerBar();
          updatePlayIcon();
          updateProgress();
        }
      }
    }

    if (bridge.debug) {
      window.__whale = {
        state,
        ui,
        render,
        playTrack,
        playFromList,
        mergeTracks,
        importDroppedPaths,
        switchView,
        openStage,
        openLyricStage,
        closeLyricStage,
        setLyricTheme,
        cycleLyricTheme,
        updateImmersiveContent,
        updateImmersiveProgress,
        loadLyrics,
        shiftLyricOffset,
        alignLyricLineToNow,
        openLyricPicker,
        playRandom,
        togglePlay,
        addFiles,
        addFolder,
        saveNow,
        renderSidebarPlaylists,
        updatePlayerBar,
        playNetworkTrack,
        searchOnlineProvider,
        playOnlineItem,
        toggleOnlineFavorite,
        refreshOnlineAuth,
        loginOnlineProvider,
        logoutOnlineProvider,
        openOnlineImportModal,
        importOnlinePlaylist,
        searchBilibili,
        setBiliMode,
        loadBiliMode,
        playBiliItem,
        refreshBiliAuth,
        loginBili,
        logoutBili,
        openBiliImportModal,
        openBiliFolderPicker,
        importBiliFolders,
        upsertBiliPlaylist,
        syncBiliPlaylist,
        setNetworkSource,
        toggleBiliFavorite,
        addToPlaylist,
        removeFromPlaylist,
      };
    }

    document.addEventListener('error', (event) => {
      if (event.target?.tagName === 'IMG') {
        event.target.hidden = true;
        const fallback = event.target.parentElement?.querySelector('.cover-fallback');
        if (fallback) fallback.style.display = '';
      }
    }, true);

    requestAnimationFrame(() => {
      setTimeout(() => $('#boot').classList.add('done'), 260);
    });

    setTimeout(validateLibrary, 1200);
  }

  init().catch((error) => {
    $('#boot').classList.add('done');
    toast(`qianqu启动时遇到了一点问题${error?.message ? `：${error.message}` : ''}`, 'error', 5000);
  });
})();


