import path from 'path';
import { spawn } from 'child_process';

import fs from 'fs-extra';
import { inject } from 'dll-inject';
import Logger from 'electron-log/main';

import Preferences from '~main/modules/preferences';
import Mods from '~main/modules/mods';
import { mainWindow } from '~main/index';
import { isGameRunning } from '~main/modules/updater';
import { patchConfig } from '~main/modules/patcher';
import { minimizeToTray, restoreFromTray } from '~main/modules/tray';
import { getMod } from '~common/mods';

import { createTRPCRouter, publicProcedure } from '../trpc';

const ensureChainloaderTweak = async (clientDir: string): Promise<boolean> => {
	if (Preferences.data.config.vanillaFixes) return true;

	const installedMods = Mods.status.mods.filter(r => r.installedVersion);
	const anyDependsOnVf = installedMods.some(r =>
		getMod(r.id)?.requires?.includes('vanillaFixes')
	);

	let dllsTxtHasEntries = false;
	const dllsPath = path.join(clientDir, 'dlls.txt');
	if (await fs.pathExists(dllsPath)) {
		const raw = await fs.readFile(dllsPath, 'utf8');
		dllsTxtHasEntries = raw
			.split(/\r?\n/)
			.some(l => l.trim() && !l.trim().startsWith('#'));
	}

	if (!anyDependsOnVf && !dllsTxtHasEntries) return false;

	Logger.info(
		`Auto-enabling vanillaFixes Tweak (chainloader required): ${
			anyDependsOnVf ? 'a dependent mod is installed' : ''
		}${anyDependsOnVf && dllsTxtHasEntries ? ' + ' : ''}${
			dllsTxtHasEntries ? 'dlls.txt has user entries' : ''
		}.`
	);
	Preferences.data = {
		config: { ...Preferences.data.config, vanillaFixes: true }
	};
	return true;
};

export const launcherRouter = createTRPCRouter({
	start: publicProcedure.mutation(async () => {
		const { cleanWdb, minimizeToTrayOnPlay, config, clientDir } =
			Preferences.data;
		if (!clientDir) return false;

		const clientPath = path.join(clientDir, 'WoW.exe');
		Logger.log(`Launching ${clientPath}...`);
		if (await isGameRunning(clientPath)) return false;

		if (cleanWdb) {
			Logger.log('Cleaning up WDB...');
			await fs.remove(path.join(clientPath, 'WDB'));
		}

		Logger.log('Checking Config.wtf...');
		await patchConfig();

		Logger.log('Launching WoW...');
		const process = spawn(clientPath, { detached: !minimizeToTrayOnPlay });

		const wantChainloader = await ensureChainloaderTweak(clientDir);
		if (wantChainloader) {
			Logger.log('Injecting VanillaFixes...');
			const vfPath = path.join(clientDir, 'VfPatcher.dll');

			if (!(await fs.pathExists(vfPath))) {
				Logger.warn(
					`VfPatcher.dll missing at ${vfPath} — chainloader needed but ` +
						'the vanillaFixes mod is not installed. Skipping inject; ' +
						'dlls.txt entries and dependent mods will not load. Install ' +
						"vanillaFixes from the Mods tab to fix."
				);
			} else {
				const status = inject('WoW.exe', vfPath);
				if (status) {
					Logger.error(`Injecting failed with error code ${status}...`);
					return true;
				}
			}
		}

		if (!minimizeToTrayOnPlay) {
			mainWindow?.close();
			return true;
		}

		minimizeToTray();
		process.on('exit', () => {
			Logger.log('WoW stopped');
			restoreFromTray();
		});
		return true;
	})
});
