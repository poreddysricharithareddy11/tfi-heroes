const { contextBridge, ipcRenderer } = require('electron');
const SEND = new Set(['status', 'shape', 'keyboard', 'drag-start', 'drag-move', 'drag-end', 'menu', 'stage-shown', 'notify', 'log', 'ready', 'cmd-overlay', 'quit']);
const INVOKE = new Set(['stage-open', 'stage-close', 'prefs-get', 'prefs-set']);
contextBridge.exposeInMainWorld('tfiDesktop', {
  role: process.argv.find((a) => a.startsWith('--role='))?.slice(7) || 'dashboard',
  send: (ch, p) => { if (SEND.has(ch)) ipcRenderer.send(ch, p); },
  invoke: (ch, p) => (INVOKE.has(ch) ? ipcRenderer.invoke(ch, p) : Promise.reject(new Error('blocked channel'))),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
});
