import { join } from 'path';
import { spawnSync } from 'child_process';

import { app, shell, BrowserWindow } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createIPCHandler } from 'electron-trpc/main';
import Logger from 'electron-log/main';

import icon from '~build/icon.png?asset';

import { appRouter } from './api/root';
import Preferences from './modules/preferences';
import Updater from './modules/updater';
import Addons from './modules/addons';
import Mods from './modules/mods';
import { initSelfUpdater } from './modules/selfUpdater';

Logger.initialize();
Logger.errorHandler.startCatching();
Logger.info('Launcher starting...');

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-translate');
app.commandLine.appendSwitch('disable-spell-checking');
// GTX 770 (nvidia-470xx) does not support Vulkan 1.3 required by Dawn/WebGPU
app.commandLine.appendSwitch('disable-features', 'Vulkan');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'gl');

export let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
	const position = Preferences.data.rememberPosition
		? Preferences.data.windowPosition
		: { width: 1000, height: 700 };

	mainWindow = new BrowserWindow({
		...position,
		minWidth: 1000,
		minHeight: 700,
		icon,
		frame: false,
		maximizable: false,
		fullscreenable: false,
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			sandbox: false,
			devTools: is.dev
		}
	});

	mainWindow.webContents.on('render-process-gone', (_e, details) => {
		Logger.error('Renderer process gone:', details);
	});
	mainWindow.webContents.on('unresponsive', () => {
		Logger.error('Renderer unresponsive');
	});

	mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
		const lvl = level === 3 ? 'error' : level === 2 ? 'warn' : 'info';
		Logger[lvl](`[renderer:${lvl}] ${message} (${sourceId}:${line})`);
	});

	mainWindow.webContents.on('before-input-event', (_e, input) => {
		if (input.type !== 'keyDown') return;
		if (input.key === 'F12') {
			mainWindow?.webContents.toggleDevTools();
		}
	});

	createIPCHandler({ router: appRouter, windows: [mainWindow] });

	mainWindow.on('ready-to-show', () => {
		mainWindow?.show();
		if (process.platform === 'linux') {
			setTimeout(() => {
				const { status } = spawnSync('pgrep', ['-x', 'i3'], { encoding: 'utf8' });
				if (status === 0) {
					spawnSync('i3-msg', [`[class="${app.getName()}"] floating disable`], { encoding: 'utf8' });
				}
			}, 300);
		}
	});
	mainWindow.webContents.setWindowOpenHandler(details => {
		shell.openExternal(details.url);
		return { action: 'deny' };
	});
	mainWindow.on('close', () => {
		if (!mainWindow) return;
		const [x = 0, y = 0] = mainWindow.getPosition();
		const [width = 0, height = 0] = mainWindow.getSize();
		Preferences.data = { windowPosition: { x, y, width, height } };
	});
	
	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
	}
};

app.whenReady().then(async () => {
	Preferences.data = await Preferences.load();

	Addons.verify();
	Updater.verify();
	Mods.verify();
	initSelfUpdater();

	electronApp.setAppUserModelId('com.electron');

	app.on('browser-window-created', (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	await createWindow();
});

app.on('window-all-closed', async () => {
	app.quit();
});
