import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import os from 'node:os';
import https from 'node:https';

import { app } from 'electron';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import mpqVerifyWorker from '~main/workers/mpqVerify?nodeWorker';
import mpqPatchWorker from '~main/workers/mpqPatch?nodeWorker';
import Logger from 'electron-log/main';

import {
	asyncMap,
	formatFileSize,
	isNotUndef,
	nestedGet,
	nestedSet
} from '~common/utils';
import { mainWindow } from '~main/index';
import { patchExecutable } from '~main/modules/patcher';
import { getClientVersion, runWorker } from '~main/utils';
import downloadFileWorker from '~main/workers/downloadFile?nodeWorker';
import hashFileWorker from '~main/workers/hashFile?nodeWorker';

import Preferences from './preferences';
import Observable from './observable';

const getAvailableDiskSpace = async (probePath?: string): Promise<number> => {
	const target =
		probePath ||
		Preferences.data?.clientDir ||
		os.homedir() ||
		(os.platform() === 'win32' ? 'C:\\' : '/');
	try {
		const s = await fs.promises.statfs(target);
		return Number(s.bsize) * Number(s.bavail);
	} catch (e) {
		Logger.warn(
			`fs.statfs("${target}") failed; treating disk-space check as ` +
				`unavailable. Error: ${e instanceof Error ? e.message : String(e)}`
		);
		return Number.POSITIVE_INFINITY;
	}
};

const isReadOnly = async (filePath: string) => {
	try {
		const { mode } = await fs.stat(filePath);
		return !(mode & fs.constants.S_IWUSR);
	} catch (e) {
		return false;
	}
};

type FolderTags = 'allowExtra';
type FileTags = 'vanillaFixes';
type FileManifest = { name: string } & (
	| { type: 'del' }
	| { type: 'dir'; files: FileManifest[]; tags?: FolderTags[] }
	| { type: 'mpq'; files: FileManifest[]; hash: string; size: number }
	| {
			type: 'file';
			hash: string;
			version?: number;
			size: number;
			tags?: FileTags[];
	  }
);

type CacheEntry = [hash: string, mtime: number];
type CacheTree = { [key: string]: CacheTree & CacheEntry };

const getManifestSize = (m?: FileManifest): number =>
	(m?.type === 'del'
		? 0
		: m?.type === 'file'
		? m?.size
		: m?.files?.reduce((acc, v) => acc + getManifestSize(v), 0)) ?? 0;

const getManifestFiles = (m?: FileManifest, p = ''): string[] =>
	(m?.type === 'del'
		? [`-- ${path.join(p, m?.name)}`]
		: m?.type === 'file'
		? [`++ ${path.join(p, m?.name)}`]
		: m?.files?.flatMap(v => getManifestFiles(v, path.join(p, m?.name)))) ?? [];

const getManifestItem = (
	m?: FileManifest,
	p?: string[]
): FileManifest | undefined => {
	if (!p?.length) return m;

	if (m?.type === 'file' || m?.type === 'del')
		throw Error(`Can't access ${p.join('.')} from file ${m.name}`);

	const [next, ...rest] = p;
	return getManifestItem(
		m?.files.find(f => f.name === next),
		rest
	);
};

export const isGameRunning = (executablePath: string): Promise<boolean> => {
	const exeName = path.basename(executablePath);

	if (os.platform() === 'win32') {
		return new Promise<boolean>(resolve => {
			exec(
				`tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`,
				(error, stdout) => {
					if (error) {
						Logger.warn(
							`tasklist probe for "${exeName}" failed; assuming game ` +
								`is not running. Error: ${error.message}`
						);
						resolve(false);
						return;
					}
					resolve(stdout.toLowerCase().includes(`"${exeName.toLowerCase()}"`));
				}
			);
		});
	}

	if (os.platform() === 'linux') {
		return new Promise<boolean>(resolve => {
			// Wine processes appear under the exe name in /proc or via pgrep
			exec(`pgrep -f "${exeName}"`, (error, stdout) => {
				resolve(!error && stdout.trim().length > 0);
			});
		});
	}

	return Promise.resolve(false);
};

const CDN_VERSION = import.meta.env.MAIN_VITE_CLIENT_VERSION || 'latest';
const SERVER_URL = import.meta.env.MAIN_VITE_SERVER_URL || 'https://octowow.st';

const toUrlPath = (p: string) => p.split(path.sep).map(encodeURIComponent).join('/');
const buildClientUrl = (filePath: string) =>
	`${SERVER_URL}/client/${CDN_VERSION}/${toUrlPath(path.normalize(filePath))}`;

const fetchManifest = async () => {
	try {
		const r = await fetch(
			`${SERVER_URL}/api/file/${CDN_VERSION}/manifest.json`
		);
		const j = await r.json();
		await fs.writeJSON(path.join(Preferences.userDataDir, 'manifest.json'), j);
		return j.root as FileManifest;
	} catch (e) {
		Logger.error('Failed to reach update server', e);
		return null;
	}
};

export const fetchFile = async (
	filePath: string,
	onChunk?: (deltaBytes: number) => void
) => {
	try {
		const response = await fetch(buildClientUrl(filePath), { agent: httpsAgent });
		if (!response.ok) throw Error(`HTTP ${response.status}`);
		if (!onChunk || !response.body) return await response.arrayBuffer();

		const chunks: Buffer[] = [];
		for await (const chunk of response.body as NodeJS.ReadableStream) {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
			chunks.push(buf);
			onChunk(buf.byteLength);
		}
		const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
		const out = Buffer.concat(chunks, total);
		return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
	} catch (e) {
		Logger.error(`Failed to download ${path.normalize(filePath)}`, e);
		throw Error(`Failed to download ${path.normalize(filePath)}`);
	}
};

const MAX_CONCURRENT_HASHES = os.cpus().length || 4;
let activeHashes = 0;
const hashQueue: (() => void)[] = [];

const acquireHashSlot = () =>
	new Promise<void>(resolve => {
		if (activeHashes < MAX_CONCURRENT_HASHES) {
			activeHashes++;
			resolve();
		} else {
			hashQueue.push(() => {
				activeHashes++;
				resolve();
			});
		}
	});

const releaseHashSlot = () => {
	activeHashes--;
	hashQueue.shift()?.();
};

const HASH_WORKER_THRESHOLD = 1024 * 1024; // 1 MB

const MAX_CONCURRENT_DOWNLOADS = 3;
let activeDownloads = 0;
const downloadQueue: (() => void)[] = [];

const acquireDownloadSlot = () =>
	new Promise<void>(resolve => {
		if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
			activeDownloads++;
			resolve();
		} else {
			downloadQueue.push(() => {
				activeDownloads++;
				resolve();
			});
		}
	});

const releaseDownloadSlot = () => {
	activeDownloads--;
	downloadQueue.shift()?.();
};

export const downloadFileToDisk = async (
	filePath: string,
	fullPath: string,
	expectedSize: number,
	onChunk: (deltaBytes: number) => void
) => {
	await acquireDownloadSlot();
	try {
		await runWorker<void>(
			downloadFileWorker,
			{
				filePath,
				fullPath,
				expectedSize,
				serverUrl: SERVER_URL,
				cdnVersion: CDN_VERSION
			},
			{
				onChunk: (delta: number) => onChunk(delta)
			}
		);
	} finally {
		releaseDownloadSlot();
	}
};

type UpdaterState =
	| 'verifying'
	| 'serverUnreachable'
	| 'noClient'
	| 'updateAvailable'
	| 'updating'
	| 'upToDate'
	| 'failed';

export type UpdaterStatus = {
	state: UpdaterState;
	progress?: number;
	message?: string;
	bytesDone?: number;
	bytesTotal?: number;
	bytesPerSecond?: number;
	etaSeconds?: number;
};

const RATE_WINDOW_MS = 5_000;
const ETA_WARMUP_MS = 10_000;
const ETA_PADDING = 1.15;

class ProgressTracker {
	#startedAt = Date.now();
	#samples: { t: number; bytesDone: number }[] = [];
	bytesDone: number;
	#baseline: number;
	#lastSample = 0;

	constructor(baseline = 0) {
		this.bytesDone = baseline;
		this.#baseline = baseline;
	}

	add(delta: number) {
		this.bytesDone = Math.max(this.#baseline, this.bytesDone + delta);
		const now = Date.now();
		if (now - this.#lastSample >= 100) {
			this.#samples.push({ t: now, bytesDone: this.bytesDone });
			this.#lastSample = now;
			const cutoff = now - RATE_WINDOW_MS;
			while (this.#samples.length > 2 && this.#samples[0].t < cutoff)
				this.#samples.shift();
		}
	}

	bytesPerSecond() {
		if (this.#samples.length < 2) return 0;
		const first = this.#samples[0];
		const last = this.#samples[this.#samples.length - 1];
		const dt = (last.t - first.t) / 1000;
		if (dt <= 0) return 0;
		return Math.max(0, (last.bytesDone - first.bytesDone) / dt);
	}

	etaSeconds(bytesTotal: number) {
		if (Date.now() - this.#startedAt < ETA_WARMUP_MS) return undefined;
		const rate = this.bytesPerSecond();
		if (rate <= 0) return undefined;
		const remaining = bytesTotal - this.bytesDone;
		if (remaining <= 0) return 0;
		return (remaining / rate) * ETA_PADDING;
	}
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256 });


class UpdaterClass extends Observable<UpdaterStatus> {
	#manifest?: FileManifest;
	#clientTotalBytes = 0;
	#bytesAlreadyOnDisk = 0;
	#cachePath = path.join(Preferences.userDataDir, 'cache.json');
	#cache: CacheTree = fs.existsSync(this.#cachePath)
		? fs.readJSONSync(this.#cachePath)
		: {};

	async #saveCache() {
		await fs.writeJSON(this.#cachePath, this.#cache);
	}

	async #getHash(clientPath: string, ...filePath: string[]) {
		if (!(await fs.exists(path.join(clientPath, ...filePath)))) {
			nestedSet(this.#cache, filePath, undefined);
			return undefined;
		}

		const stats = await fs.stat(path.join(clientPath, ...filePath));
		if (stats.isDirectory())
			throw Error(`Tried to get hash of directory ${path.join(...filePath)}`);

		const c = nestedGet<CacheEntry>(this.#cache, filePath);

		if (c?.[0] && c[1] === stats.mtimeMs) return c[0];

		const fullPath = path.join(clientPath, ...filePath);
		let newHash: string;
		if (stats.size >= HASH_WORKER_THRESHOLD) {
			await acquireHashSlot();
			try {
				newHash = await runWorker<string>(hashFileWorker, { fullPath });
			} finally {
				releaseHashSlot();
			}
		} else {
			newHash = await new Promise<string>((resolve, reject) => {
				const hash = crypto.createHash('sha1');
				const stream = fs.createReadStream(fullPath);
				stream.on('data', (chunk: Buffer) => hash.update(chunk));
				stream.on('end', () => resolve(hash.digest('hex').toLocaleUpperCase()));
				stream.on('error', reject);
			});
		}
		nestedSet(this.#cache, filePath, {
			...c,
			[0]: newHash,
			[1]: stats.mtimeMs
		});
		return newHash;
	}

	protected _value: UpdaterStatus = { state: 'failed' };

	get status() {
		return this._value;
	}
	private set status(v: UpdaterStatus) {
		this._value = v;
		this._notifyObservers(v);
		if (this.status.state === 'failed') {
			mainWindow?.setProgressBar(1, { mode: 'error' });
		} else if (this.status.progress === 1) {
			mainWindow?.setProgressBar(0);
		} else {
			mainWindow?.setProgressBar(this.status.progress ?? 0, {
				mode: this.status.progress === -1 ? 'indeterminate' : 'normal'
			});
		}
	}

	async verify() {
		if (this.status?.state === 'verifying' || this.status?.state === 'updating')
			return;

		const clientPath = Preferences.data.clientDir;
		if (!clientPath) {
			this.status = { state: 'noClient' };
			return;
		}

		if (os.platform() === 'win32' && clientPath.length > 220) {
			this.status = {
				state: 'failed',
				message:
					'Path to current install location is too long and may cause issues.'
			};
			return;
		}

		if (await isGameRunning(path.join(clientPath, 'WoW.exe'))) {
			this.status = {
				state: 'failed',
				message: 'Please close WoW first, before updating.'
			};
			return;
		}

		Logger.log(`Verifying client files at ${path.join(clientPath)}...`);
		this.status = {
			state: 'verifying',
			progress: -1,
			message: 'Looking for updates...'
		};

		try {
			const vanillaFixes = Preferences.data.config.vanillaFixes;

			const hashTree = await fetchManifest();
			if (!hashTree) {
				this.status = { state: 'serverUnreachable' };
				return;
			}
			this.#manifest = { type: 'dir', name: 'root', files: [] };

			const totalSize = getManifestSize(hashTree);
			let i = 0;

			let lastVerifyEmit = 0;
			const emitVerifyStatus = (message: string) => {
				const now = Date.now();
				if (now - lastVerifyEmit < 150) return;
				lastVerifyEmit = now;
				this.status = { state: 'verifying', progress: i / totalSize, message };
			};

			const buildMpqTree = async (
				mpqPath: string[],
				...filePath: string[]
			): Promise<FileManifest | undefined> => {
				const item = getManifestItem(hashTree, [...mpqPath, ...filePath]);
				if (!item) return undefined;

				if (item.type === 'del') return item;

				if (item.type === 'dir') {
					const files = (
						await asyncMap(item.files, f =>
							buildMpqTree(mpqPath, ...filePath, f.name)
						)
					).filter(isNotUndef);
					return !files.length ? undefined : { ...item, files };
				}

				if (item.type === 'mpq')
					throw Error(
						`There can't be an mpq archive inside mpq at path ${path.join(
							...mpqPath,
							...filePath
						)}`
					);

				emitVerifyStatus(`Verifying: [${mpqPath.at(-1)}] "${path.join(...filePath)}"...`);
				i += item.size;

				const c = nestedGet<CacheEntry>(this.#cache, [...mpqPath, ...filePath]);
				if (c?.[0]) return c[0] === item.hash ? undefined : item;
				return item;
			};

			const buildTree = async (
				...filePath: string[]
			): Promise<FileManifest | undefined> => {
				const item = getManifestItem(hashTree, filePath);
				if (!item) return undefined;

				if (item.type === 'del') return item;

				if (item.type === 'dir') {
					const files = (
						await Promise.all(item.files.map(f => buildTree(...filePath, f.name)))
					).filter(isNotUndef);

					return !files.length ? undefined : { ...item, files };
				}

				if (item.type === 'mpq') {
					const patchPath = [
						...filePath.slice(0, -1),
						`${filePath.at(-1)}.mpq`
					];
					emitVerifyStatus(`Verifying: "${path.join(...patchPath)}"...`);

					if (!(await fs.exists(path.join(clientPath, ...patchPath)))) {
						i += item.size;
						return {
							type: 'file',
							name: `${item.name}.mpq`,
							hash: item.hash,
							size: item.size
						};
					}

					if (
						(await this.#getHash(clientPath, ...patchPath)) === item.hash
					) {
						i += item.size;
						return undefined;
					}

					// Hash alle ukachedede filer i arkivet via worker (ikke-blokerende)
					const collectLeaves = (m: FileManifest, prefix: string[] = []): string[][] => {
						if (m.type === 'file') return [[...prefix, m.name]];
						if (m.type === 'dir') return m.files.flatMap(f => collectLeaves(f, [...prefix, m.name]));
						return [];
					};
					const uncached = collectLeaves(item).filter(leafPath => {
						const c = nestedGet<CacheEntry>(this.#cache, [...filePath, ...leafPath]);
						return !c?.[0];
					});

					if (uncached.length > 0) {
						try {
							await runWorker<void>(
								mpqVerifyWorker,
								{
									archivePath: path.join(clientPath, ...patchPath),
									fileList: uncached.map(p => path.join(...p))
								},
								{
									onHash: (inMpqPath: string, hash: string | null) => {
										const parts = inMpqPath.split(path.sep);
										if (hash !== null) {
											nestedSet(this.#cache, [...filePath, ...parts], { [0]: hash });
										} else {
											nestedSet(this.#cache, [...filePath, ...parts], undefined);
										}
									}
								}
							);
						} catch (e) {
							Logger.log(
								`Failed to verify ${path.join(...patchPath)}, will be downloaded fresh`,
								'warning',
								e
							);
							return {
								type: 'file',
								name: `${item.name}.mpq`,
								hash: item.hash,
								size: item.size
							};
						}
					}

					const files = (
						await asyncMap(item.files, f => buildMpqTree(filePath, f.name))
					).filter(isNotUndef);
					return !files.length ? undefined : { ...item, files };
				}

				if (item.tags?.includes('vanillaFixes') && !vanillaFixes) {
					if (await fs.exists(path.join(clientPath, ...filePath))) {
						return {
							type: 'del',
							name: item.name
						};
					} else {
						return undefined;
					}
				}

				emitVerifyStatus(`Verifying: "${path.join(...filePath)}"...`);

				i += item.size;

				const hash = await this.#getHash(clientPath, ...filePath);

				if (hash === item.hash) return undefined;

				if (
					filePath.length === 1 &&
					filePath[0] === 'WoW.exe' &&
					hash &&
					hash === Preferences.data.expectedPatchedWowHash
				)
					return undefined;

				if (hash && item.version) {
					const stats = await fs.stat(path.join(clientPath, ...filePath));
					if (item.version <= stats.mtimeMs) return undefined;
				}

				return item;
			};

			this.#manifest = await buildTree();

			await this.#saveCache();

			const toDownload = getManifestSize(this.#manifest);
			this.#clientTotalBytes = getManifestSize(hashTree);
			this.#bytesAlreadyOnDisk = Math.max(
				0,
				this.#clientTotalBytes - toDownload
			);
			const availableSpace = await getAvailableDiskSpace();

			if (toDownload > availableSpace) {
				this.status = {
					state: 'failed',
					message: `Not enough disk space. Required: ${formatFileSize(
						toDownload
					)}, Available: ${formatFileSize(availableSpace)}`
				};
				return;
			}

			this.status = this.#manifest
				? {
						state: 'updateAvailable',
						message: formatFileSize(toDownload),
						progress: this.#bytesAlreadyOnDisk / this.#clientTotalBytes,
						bytesDone: this.#bytesAlreadyOnDisk,
						bytesTotal: this.#clientTotalBytes
				  }
				: { state: 'upToDate', progress: 1 };
			this.#manifest &&
				Logger.log(
					`Detected changes:\n\t${getManifestFiles(this.#manifest).join(
						',\n\t'
					)}`
				);

			const currentLauncherVersion = app.getVersion();
			if (
				this.status.state === 'upToDate' &&
				Preferences.data.lastPatchedLauncherVersion !==
					currentLauncherVersion
			) {
				Logger.log(
					`Launcher version changed (${
						Preferences.data.lastPatchedLauncherVersion ?? 'unset'
					} -> ${currentLauncherVersion}); silently re-applying tweaks via patchExecutable`
				);
				void (async () => {
					try {
						await patchExecutable();
						const cd = Preferences.data.clientDir;
						if (cd) {
							const patchedHash = await this.#getHash(cd, 'WoW.exe');
							await this.#saveCache();
							Preferences.data = {
								lastPatchedLauncherVersion: currentLauncherVersion,
								expectedPatchedWowHash: patchedHash
							};
						}
					} catch (e) {
						Logger.error(
							'Auto-rerun patchExecutable after launcher version bump failed',
							e
						);
					}
				})();
			}
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.error(`Verification failed: ${message}`, e);
			this.status = { state: 'failed', message };
		}
	}

	async update(clean?: boolean) {
		if (this.status?.state === 'verifying' || this.status?.state === 'updating')
			return;

		const clientPath = Preferences.data.clientDir;
		if (!clientPath) {
			this.status = { state: 'noClient' };
			return;
		}

		if (await isGameRunning(path.join(clientPath, 'WoW.exe'))) {
			this.status = {
				state: 'failed',
				message: 'Please close WoW first, before updating.'
			};
			return;
		}

		Logger.log(`Updating client files at ${path.join(clientPath)}...`);
		this.status = {
			state: 'updating',
			progress: -1,
			message: 'Preparing files...'
		};

		try {
			if (clean) {
				this.status = {
					state: 'updating',
					progress: -1,
					message: 'Cleaning up old files...'
				};

				const files = await fs.readdir(clientPath);
				const launcherBinaries = ['OctoLauncher.exe', 'OctoLauncher', 'OctoLauncher.AppImage', 'OctoLauncher.deb'];
				for (const file of files) {
					if (launcherBinaries.includes(file)) continue;
					await fs.rm(path.join(clientPath, file), {
						recursive: true,
						force: true
					});
				}

				this.#bytesAlreadyOnDisk = 0;
			}
			const hashTree =
				(clean ? undefined : this.#manifest) ?? (await fetchManifest());

			if (!hashTree) {
				this.status = { state: 'serverUnreachable' };
				return;
			}

			const fullClientTotal =
				this.#clientTotalBytes > 0
					? this.#clientTotalBytes
					: getManifestSize(hashTree);
			this.#clientTotalBytes = fullClientTotal;
			const baseline = this.#bytesAlreadyOnDisk;
			const tracker = new ProgressTracker(baseline);
			let executableUpdate = false;
			let lastEmit = 0;
			const STATUS_EMIT_INTERVAL_MS = 2000;

			const emitProgress = (message: string, force = false) => {
				const now = Date.now();
				if (!force && now - lastEmit < STATUS_EMIT_INTERVAL_MS) return;
				lastEmit = now;
				const bps = tracker.bytesPerSecond();
				this.status = {
					state: 'updating',
					progress: tracker.bytesDone / fullClientTotal,
					message,
					bytesDone: tracker.bytesDone,
					bytesTotal: fullClientTotal,
					bytesPerSecond: bps,
					etaSeconds: tracker.etaSeconds(fullClientTotal)
				};
			};


			const iterateTree = async (...filePath: string[]) => {
				const item = getManifestItem(hashTree, filePath);
				if (!item) return undefined;

				if (item.type === 'del') {
					const fullPath = path.join(clientPath, ...filePath);
					if (await isReadOnly(fullPath))
						throw Error(
							`Failed to delete "${fullPath}" because it's read-only.`
						);

					await fs.remove(fullPath);

					await this.#getHash(clientPath, ...filePath);
					return;
				}

				if (item.type === 'dir') {
					await Promise.all(item.files.map(i => iterateTree(...filePath, i.name)));
					return;
				}

				if (item.type === 'mpq') {
					const patchPath = [
						...filePath.slice(0, -1),
						`${filePath.at(-1)}.mpq`
					];
					const patchFile = path.join(clientPath, ...patchPath);
					const label = `Downloading: "${path.join(...patchPath)}"`;
					emitProgress(label, true);

					if (!(await fs.exists(patchFile))) {
						await downloadFileToDisk(
							path.join(...patchPath),
							patchFile,
							item.size,
							delta => {
								tracker.add(delta);
								emitProgress(label);
							}
						);
						return;
					}

					if (await isReadOnly(patchFile))
						throw Error(
							`Failed to update "${patchFile}" because it's read-only.`
						);

					// Download alle filer der skal patches, send derefter til worker
					const mpqFileUpdates: Array<{ inMpqPath: string; data: ArrayBuffer }> = [];

					const collectMpqUpdate = async (mpqPath: string[], ...fileP: string[]): Promise<void> => {
						const innerItem = getManifestItem(hashTree, [...mpqPath, ...fileP]);
						if (!innerItem) return;
						if (innerItem.type === 'del')
							throw Error(`TODO: Deleting of files from MPQ not implemented at path ${path.join(...mpqPath, ...fileP)}`);
						if (innerItem.type === 'dir') {
							for (const f of innerItem.files) await collectMpqUpdate(mpqPath, ...fileP, f.name);
							return;
						}
						if (innerItem.type === 'mpq')
							throw Error(`Nested MPQ at ${path.join(...mpqPath, ...fileP)}`);
						const label = `Patching: [${mpqPath.at(-1)}] "${path.join(...fileP)}"`;
						emitProgress(label, true);
						const data = await fetchFile(
							path.join(...mpqPath, ...fileP),
							delta => { tracker.add(delta); emitProgress(label); }
						);
						mpqFileUpdates.push({ inMpqPath: path.join(...fileP), data });
					};

					for (const f of item.files)
						await collectMpqUpdate(filePath, f.name);

					await runWorker<void>(
						mpqPatchWorker,
						{ archivePath: path.join(clientPath, ...patchPath), files: mpqFileUpdates },
						{},
						mpqFileUpdates.map(f => f.data)
					);
					return;
				}

				const label = `Downloading: "${path.join(...filePath)}"`;
				emitProgress(label, true);

				if (item.name === 'WoW.exe') executableUpdate = true;

				const fullPath = path.join(clientPath, ...filePath);
				if (await fs.exists(fullPath) && (await isReadOnly(fullPath)))
					throw Error(`Failed to update "${fullPath}" because it's read-only.`);

				await downloadFileToDisk(
					path.join(...filePath),
					fullPath,
					item.size,
					delta => {
						tracker.add(delta);
						emitProgress(label);
					}
				);
			};

			await iterateTree();
			await this.#saveCache();

			const currentLauncherVersion = app.getVersion();
			const launcherVersionChanged =
				Preferences.data.lastPatchedLauncherVersion !== currentLauncherVersion;

			if (executableUpdate || launcherVersionChanged) {
				this.status = {
					state: 'updating',
					progress: 1,
					message: 'Patching WoW.exe... please wait, might take some time'
				};
				await patchExecutable();
				await this.#getHash(clientPath, 'WoW.exe');
				const patchedWowHash = await this.#getHash(clientPath, 'WoW.exe');
				await this.#saveCache();
				Preferences.data = {
					version: await getClientVersion(),
					lastPatchedLauncherVersion: currentLauncherVersion,
					expectedPatchedWowHash: patchedWowHash
				};
			}

			this.#bytesAlreadyOnDisk = fullClientTotal;
			this.status = { state: 'upToDate', progress: 1 };
		} catch (e) {
			console.error(e);
			this.status = {
				state: 'failed',
				message: e instanceof Error ? e.message : 'Unexpected error occurred'
			};
		}
	}
}

const Updater = new UpdaterClass();
export default Updater;
