import path from 'path';
import os from 'os';

import fs from 'fs-extra';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import Logger from 'electron-log/main';

import { MODS, type ModEntry, type ModId, getMod } from '~common/mods';
import { type ModState } from '~common/schemas';

import Preferences from './preferences';
import Observable from './observable';
import { addDll, removeDll } from './dllsTxt';

export type ModRowStatus = {
	id: ModId;
	name: string;
	description: string;
	repoUrl: string;
	recommended: boolean;
	requires: ModId[];
	enabled: boolean;
	ignoreUpdates: boolean;
	installedVersion?: string;
	latestVersion: string;
	state: 'idle' | 'downloading' | 'installing' | 'uninstalling' | 'error';
	progress?: number;
	error?: string;
};

export type ModsStatus = {
	state: 'verifying' | 'idle' | 'busy';
	dirty: boolean;
	mods: ModRowStatus[];
};

const VERSION_CACHE_MS = 10 * 60 * 1000;

class ModsClass extends Observable<ModsStatus> {
	protected _value: ModsStatus = {
		state: 'verifying',
		dirty: false,
		mods: []
	};

	#latestCache = new Map<ModId, { v: string; ts: number }>();

	installedFilePaths(): Set<string> {
		const set = new Set<string>();
		const mods = Preferences.data?.mods ?? {};
		for (const id of Object.keys(mods) as ModId[]) {
			const state = mods[id];
			if (!state?.installedFiles?.length) continue;
			for (const rel of state.installedFiles) {
				set.add(rel.replace(/\\/g, '/').toLowerCase());
			}
		}
		return set;
	}

	get status(): ModsStatus {
		return this._value;
	}

	#initialRow(m: ModEntry): ModRowStatus {
		const state = Preferences.data?.mods?.[m.id];
		return {
			id: m.id,
			name: m.name,
			description: m.description,
			repoUrl: m.repoUrl,
			recommended: !!m.recommended,
			requires: m.requires ?? [],
			enabled: !!state?.enabled,
			ignoreUpdates: !!state?.ignoreUpdates,
			installedVersion: state?.installedVersion,
			latestVersion: m.version,
			state: 'idle'
		};
	}

	#patchRow(id: ModId, patch: Partial<ModRowStatus>) {
		this._value = {
			...this._value,
			mods: this._value.mods.map(r => (r.id === id ? { ...r, ...patch } : r))
		};
		this._value = { ...this._value, dirty: this.#computeDirty() };
		this._notifyObservers();
	}

	#computeDirty(): boolean {
		return this._value.mods.some(r => {
			const wantInstalled = r.enabled;
			const isInstalled = !!r.installedVersion;
			if (wantInstalled !== isInstalled) return true;
			if (
				r.installedVersion &&
				r.installedVersion !== r.latestVersion &&
				!r.ignoreUpdates
			)
				return true;
			return false;
		});
	}

	load() {
		this._value = {
			state: 'verifying',
			dirty: false,
			mods: MODS.map(m => this.#initialRow(m))
		};
	}

	async verify() {
		this.load();
		this._notifyObservers();

		const clientDir = Preferences.data?.clientDir;

		for (const m of MODS) {
			const state = Preferences.data?.mods?.[m.id];
			let installedVersion = state?.installedVersion;

			if (clientDir && installedVersion) {
				const filesPresent = await Promise.all(
					(state?.installedFiles ?? []).map(rel =>
						fs.pathExists(path.join(clientDir, rel))
					)
				);
				if (state?.installedFiles?.length && !filesPresent.every(Boolean)) {
					installedVersion = undefined;
					await this.#savePref(m.id, {
						enabled: state?.enabled ?? false,
						installedVersion: undefined,
						installedFiles: [],
						ignoreUpdates: state?.ignoreUpdates ?? false
					});
				}
			}

			const latest = await this.#fetchLatestVersion(m).catch(() => m.version);

			this.#patchRow(m.id, {
				installedVersion,
				latestVersion: latest,
				enabled: !!state?.enabled,
				ignoreUpdates: !!state?.ignoreUpdates
			});
		}

		this._value = { ...this._value, state: 'idle', dirty: this.#computeDirty() };
		this._notifyObservers();
	}

	async #fetchLatestVersion(m: ModEntry): Promise<string> {
		if (m.source.kind === 'managed') return m.version;
		const cached = this.#latestCache.get(m.id);
		if (cached && Date.now() - cached.ts < VERSION_CACHE_MS) return cached.v;

		const apiUrl =
			'apiUrl' in m.source && m.source.apiUrl ? m.source.apiUrl : undefined;
		const parser =
			'parseLatest' in m.source && m.source.parseLatest
				? m.source.parseLatest
				: undefined;

		if (!apiUrl || !parser) {
			const v = ('pinnedTag' in m.source && m.source.pinnedTag) || m.version;
			this.#latestCache.set(m.id, { v, ts: Date.now() });
			return v;
		}

		try {
			const res = await fetch(apiUrl, {
				headers: { 'User-Agent': 'OctoLauncher' }
			});
			if (!res.ok) throw new Error(`${apiUrl} → ${res.status}`);
			const json = (await res.json()) as { tag_name?: string };
			const tag = json.tag_name ?? m.version;
			this.#latestCache.set(m.id, { v: tag, ts: Date.now() });
			return tag;
		} catch (e) {
			Logger.warn(`Could not check latest version for ${m.id}:`, e);
			const v = ('pinnedTag' in m.source && m.source.pinnedTag) || m.version;
			return v;
		}
	}

	async toggle(id: ModId, enabled: boolean) {
		const cur = Preferences.data?.mods?.[id];
		await this.#savePref(id, {
			enabled,
			installedVersion: cur?.installedVersion,
			installedFiles: cur?.installedFiles ?? [],
			ignoreUpdates: cur?.ignoreUpdates ?? false
		});
		this.#patchRow(id, { enabled });
	}

	async setIgnoreUpdates(id: ModId, ignore: boolean) {
		const cur = Preferences.data?.mods?.[id];
		await this.#savePref(id, {
			enabled: cur?.enabled ?? false,
			installedVersion: cur?.installedVersion,
			installedFiles: cur?.installedFiles ?? [],
			ignoreUpdates: ignore
		});
		this.#patchRow(id, { ignoreUpdates: ignore });
	}

	async applyAll() {
		const clientDir = Preferences.data?.clientDir;
		if (!clientDir) {
			Logger.warn('No clientDir set; cannot apply mods.');
			return;
		}
		this._value = { ...this._value, state: 'busy' };
		this._notifyObservers();

		const queue = [...this._value.mods];
		queue.sort((a, b) => {
			if (a.id === 'vanillaFixes') return -1;
			if (b.id === 'vanillaFixes') return 1;
			return 0;
		});

		for (const row of queue) {
			const m = getMod(row.id);
			if (!m) continue;

			const wantInstalled = row.enabled;
			const isInstalled = !!row.installedVersion;
			const updateAvailable =
				isInstalled &&
				row.installedVersion !== row.latestVersion &&
				!row.ignoreUpdates;

			try {
				if (wantInstalled && !isInstalled) {
					await this.#install(m);
				} else if (!wantInstalled && isInstalled) {
					await this.#uninstall(m);
				} else if (wantInstalled && updateAvailable) {
					await this.#uninstall(m);
					await this.#install(m);
				}
			} catch (e) {
				Logger.error(`Failed to apply ${m.id}:`, e);
				this.#patchRow(m.id, {
					state: 'error',
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}

		this._value = { ...this._value, state: 'idle' };
		await this.verify();
	}

	async #install(m: ModEntry) {
		const clientDir = Preferences.data?.clientDir;
		if (!clientDir) throw new Error('No client dir');
		if (m.source.kind === 'managed') return;

		Logger.info(`Installing mod ${m.id}...`);
		this.#patchRow(m.id, { state: 'downloading', progress: 0, error: undefined });

		const written: string[] = [];

		if (m.source.kind === 'directFile') {
			const dest = path.join(clientDir, m.source.assetName);
			await this.#downloadTo(m.source.url, dest);
			written.push(m.source.assetName);
		} else if (m.source.kind === 'archive') {
			const tmp = path.join(
				os.tmpdir(),
				`octolauncher-${m.id}-${Date.now()}.${m.source.format}`
			);
			await this.#downloadTo(m.source.url, tmp);
			this.#patchRow(m.id, { state: 'installing' });

			const map = m.source.extractMap;
			if (m.source.format === 'zip') {
				const zip = new AdmZip(tmp);
				const entries = zip.getEntries();
				for (const [src, dst] of Object.entries(map)) {
					const entry = entries.find(e => e.entryName === src);
					if (!entry) {
						Logger.warn(`Mod ${m.id}: zip entry ${src} not found.`);
						continue;
					}
					const target = path.join(clientDir, dst);
					await fs.ensureDir(path.dirname(target));
					await fs.writeFile(target, entry.getData());
					written.push(dst);
				}
			} else {
				const stagingDir = path.join(
					os.tmpdir(),
					`octolauncher-${m.id}-${Date.now()}-extract`
				);
				await fs.ensureDir(stagingDir);
				await tar.x({ file: tmp, cwd: stagingDir });
				for (const [src, dst] of Object.entries(map)) {
					const srcPath = path.join(stagingDir, src);
					if (!(await fs.pathExists(srcPath))) {
						Logger.warn(`Mod ${m.id}: tar entry ${src} not found.`);
						continue;
					}
					const target = path.join(clientDir, dst);
					await fs.ensureDir(path.dirname(target));
					await fs.copy(srcPath, target);
					written.push(dst);
				}
				await fs.remove(stagingDir).catch(() => {});
			}
			await fs.remove(tmp).catch(() => {});
		}

		if (m.registerInDllsTxt) {
			await addDll(clientDir, m.registerInDllsTxt);
		}

		await this.#savePref(m.id, {
			enabled: true,
			installedVersion: m.version,
			installedFiles: written,
			ignoreUpdates: Preferences.data?.mods?.[m.id]?.ignoreUpdates ?? false
		});

		this.#patchRow(m.id, {
			state: 'idle',
			installedVersion: m.version,
			progress: 1
		});
	}

	async #uninstall(m: ModEntry) {
		const clientDir = Preferences.data?.clientDir;
		if (!clientDir) throw new Error('No client dir');
		if (m.source.kind === 'managed') return;

		Logger.info(`Uninstalling mod ${m.id}...`);
		this.#patchRow(m.id, { state: 'uninstalling', error: undefined });

		const cur = Preferences.data?.mods?.[m.id];
		const files = cur?.installedFiles ?? [];

		for (const rel of files) {
			const fullPath = path.join(clientDir, rel);
			await fs
				.remove(fullPath)
				.catch(err => Logger.warn(`Couldn't remove ${fullPath}:`, err));
		}

		if (m.registerInDllsTxt) {
			await removeDll(clientDir, m.registerInDllsTxt);
		}

		await this.#savePref(m.id, {
			enabled: cur?.enabled ?? false,
			installedVersion: undefined,
			installedFiles: [],
			ignoreUpdates: cur?.ignoreUpdates ?? false
		});

		this.#patchRow(m.id, { state: 'idle', installedVersion: undefined });
	}

	async #downloadTo(url: string, dest: string) {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'OctoLauncher' }
		});
		if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
		await fs.ensureDir(path.dirname(dest));
		const buf = await res.arrayBuffer();
		await fs.writeFile(dest, Buffer.from(buf));
	}

	async #savePref(id: ModId, state: ModState) {
		const allMods = { ...(Preferences.data?.mods ?? {}), [id]: state };
		Preferences.data = { mods: allMods };
	}
}

const Mods = new ModsClass();
export default Mods;
