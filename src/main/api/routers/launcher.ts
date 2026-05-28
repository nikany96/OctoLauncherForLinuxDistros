import path from 'path';
import { spawn, exec, ChildProcess } from 'child_process';
import os from 'os';

import fs from 'fs-extra';
import Logger from 'electron-log/main';

import Preferences from '~main/modules/preferences';
import Mods from '~main/modules/mods';
import { patchConfig } from '~main/modules/patcher';
import { getMod } from '~common/mods';

import { createTRPCRouter, publicProcedure } from '../trpc';

const runningInstances = new Map<number, ChildProcess>();

function getNextSlot(): number {
	let slot = 1;
	while (runningInstances.has(slot)) slot++;
	return slot;
}

const getScreenResolution = (): Promise<string> =>
	new Promise(resolve => {
		exec("xrandr | awk '/\\*/ {print $1; exit}'", (err, stdout) => {
			resolve(stdout.trim() || '1920x1080');
		});
	});

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

		if (cleanWdb && runningInstances.size === 0) {
			Logger.log('Cleaning up WDB...');
			await fs.remove(path.join(clientDir, 'WDB'));
		}

		Logger.log('Checking Config.wtf...');
		await patchConfig();

		Logger.log('Launching WoW...');
		const isLinux = os.platform() === 'linux';
		const slot = getNextSlot();
		const winePrefix = isLinux
			? path.join(os.homedir(), `.wine-wow-${slot}`)
			: undefined;
		const spawnCmd = isLinux ? 'wine' : clientPath;
		const resolution = isLinux ? await getScreenResolution() : '';
		const spawnArgs = isLinux
			? ['explorer', `/desktop=wow-${slot},${resolution}`, clientPath]
			: [];
		const spawnEnv = winePrefix ? { ...process.env, WINEPREFIX: winePrefix } : undefined;
		const gameProcess = spawn(spawnCmd, spawnArgs, {
			detached: !minimizeToTrayOnPlay,
			stdio: 'ignore',
			env: spawnEnv,
		});
		if (!minimizeToTrayOnPlay) gameProcess.unref();
		runningInstances.set(slot, gameProcess);

		const wantChainloader = await ensureChainloaderTweak(clientDir);
		if (wantChainloader) {
			if (isLinux) {
				Logger.info('DLL injection skipped on Linux — VanillaFixes chainloader is Windows-only');
			} else {
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
					// dll-inject is Windows-only; require at runtime so Linux builds succeed
					// eslint-disable-next-line @typescript-eslint/no-var-requires
					const { inject } = require('dll-inject') as { inject: (proc: string, dll: string) => number };
					const status = inject('WoW.exe', vfPath);
					if (status) {
						Logger.error(`Injecting failed with error code ${status}...`);
						return true;
					}
				}
			}
		}

		gameProcess.on('exit', () => {
			Logger.log(`WoW instance ${slot} stopped`);
			runningInstances.delete(slot);
		});
		return true;
	})
});
