import { join } from 'path';

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

app.disableHardwareAcceleration();

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
			devTools: true
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
