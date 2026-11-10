// Starts the desktop app. Clears ELECTRON_RUN_AS_NODE (set by VS Code terminals) which would make Electron behave as plain Node.
const { spawn } = require('child_process');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const exe = require('electron');
const child = spawn(exe, [require('path').join(__dirname, '..'), ...process.argv.slice(2)], { env, stdio: 'inherit', detached: process.argv.includes('--detach') });
if (process.argv.includes('--detach')) child.unref(); else child.on('exit', (c) => process.exit(c ?? 0));
