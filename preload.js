const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('whale', {
  openFiles: () => ipcRenderer.invoke('library:open-files'),
  openFolder: () => ipcRenderer.invoke('library:open-folder'),
  importPaths: (paths) => ipcRenderer.invoke('library:import', paths),
  validatePaths: (paths) => ipcRenderer.invoke('library:validate', paths),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  readLyrics: (filePath) => ipcRenderer.invoke('lyrics:read', filePath),
  searchLyrics: (payload) => ipcRenderer.invoke('lyrics:search-catalog', payload || {}),
  getLyricCandidate: (payload) => ipcRenderer.invoke('lyrics:candidate', payload || {}),
  coverThumb: (coverUrl) => ipcRenderer.invoke('cover:thumbnail', coverUrl),
  reveal: (target) => ipcRenderer.invoke('shell:reveal', target),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
  biliSearch: (query) => ipcRenderer.invoke('bili:search', { query }),
  biliRank: () => ipcRenderer.invoke('bili:rank'),
  biliNew: () => ipcRenderer.invoke('bili:new'),
  biliAuthStatus: () => ipcRenderer.invoke('bili:auth-status'),
  biliLogin: () => ipcRenderer.invoke('bili:login'),
  biliLogout: () => ipcRenderer.invoke('bili:logout'),
  biliFavFolders: () => ipcRenderer.invoke('bili:fav-folders'),
  biliImportFolder: (payload) => ipcRenderer.invoke('bili:import-folder', payload),
  biliResolve: (bvid, cid, force) => ipcRenderer.invoke('bili:resolve', { bvid, cid, force: Boolean(force) }),
  biliLyrics: (payload) => ipcRenderer.invoke('bili:lyrics', payload || {}),
  musicAuthStatus: (provider) => ipcRenderer.invoke('music:auth-status', { provider }),
  musicLogin: (provider) => ipcRenderer.invoke('music:login', { provider }),
  musicLogout: (provider) => ipcRenderer.invoke('music:logout', { provider }),
  musicSearch: (provider, query) => ipcRenderer.invoke('music:search', { provider, query }),
  musicResolve: (provider, urlId) => ipcRenderer.invoke('music:resolve', { provider, urlId }),
  musicPlaylists: (provider) => ipcRenderer.invoke('music:playlists', { provider }),
  musicPlaylist: (payload) => ipcRenderer.invoke('music:playlist', payload || {}),
  musicLyric: (provider, lyricId) => ipcRenderer.invoke('music:lyric', { provider, lyricId }),
  appInfo: () => ipcRenderer.invoke('app:info'),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  zoom: (action, value) => ipcRenderer.invoke('window:zoom', action, value),
  onWindowState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  onScanProgress: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('library:scan-progress', handler);
    return () => ipcRenderer.removeListener('library:scan-progress', handler);
  },
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  debug: process.env.WHALE_DEBUG === '1',
});
