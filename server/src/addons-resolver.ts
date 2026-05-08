import fs from 'fs-extra';
import path from 'path';

import { defaultSources, type AddonSource } from './addons-sources.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 10_000;
const SOURCES_OVERRIDE_PATH = process.env.ADDONS_SOURCES_PATH ?? '';

export type TocData = Record<string, string>;

export type ResolvedAddon = {
	name: string;
	owner: string;
	git: string;
	branch?: string;
	ref?: string;
	toc?: TocData;
	description?: string;
	lastUpdated?: string;
	stars?: number;
};

type CacheEntry = { at: number; data: ResolvedAddon[] };
let cache: CacheEntry | undefined;
let inFlight: Promise<ResolvedAddon[]> | undefined;

const parseToc = (content: string): TocData =>
	content
		.split('\n')
		.filter(l => l.startsWith('## '))
		.map(l => l.slice(3))
		.map(l => {
			const idx = l.indexOf(':');
			if (idx === -1) return null;
			return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as const;
		})
		.filter((e): e is readonly [string, string] => !!e)
		.reduce<TocData>((acc, [k, v]) => {
			acc[k] = v;
			return acc;
		}, {});

const fetchWithTimeout = async (url: string, init?: RequestInit) => {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(t);
	}
};

const parseGitUrl = (git: string) => {
	// https://github.com/{owner}/{repo}.git
	const m = git.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (!m || !m[1] || !m[2]) throw Error(`Unsupported git URL: ${git}`);
	return { owner: m[1], repo: m[2] };
};

const resolveOne = async (src: AddonSource): Promise<ResolvedAddon | null> => {
	try {
		const { owner, repo } = parseGitUrl(src.git);
		const name = src.name ?? repo;
		const branch = src.branch ?? 'master';
		const tocRef = src.ref ?? branch;

		const tocUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${tocRef}/${name}.toc`;
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

		const [tocRes, apiRes] = await Promise.all([
			fetchWithTimeout(tocUrl).catch(() => null),
			fetchWithTimeout(apiUrl, {
				headers: {
					Accept: 'application/vnd.github+json',
					...(process.env.GITHUB_TOKEN && {
						Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
					})
				}
			}).catch(() => null)
		]);

		let toc: TocData | undefined;
		if (tocRes?.ok) {
			const parsed = parseToc(await tocRes.text());
			const required = ['Interface', 'Title', 'Author', 'Notes', 'Version'];
			if (required.every(k => typeof parsed[k] === 'string')) {
				toc = parsed;
			}
		}

		let description: string | undefined;
		let lastUpdated: string | undefined;
		let stars: number | undefined;
		if (apiRes?.ok) {
			const meta = (await apiRes.json()) as {
				description?: string;
				pushed_at?: string;
				stargazers_count?: number;
			};
			description = meta.description ?? undefined;
			lastUpdated = meta.pushed_at;
			stars = meta.stargazers_count;
		}

		if (src.description) {
			description = src.description;
			if (toc) toc = { ...toc, Notes: src.description };
		}

		const result: ResolvedAddon = { name, owner, git: src.git };
		if (src.branch !== undefined) result.branch = src.branch;
		if (src.ref !== undefined) result.ref = src.ref;
		if (toc !== undefined) result.toc = toc;
		if (description !== undefined) result.description = description;
		if (lastUpdated !== undefined) result.lastUpdated = lastUpdated;
		if (stars !== undefined) result.stars = stars;
		return result;
	} catch (e) {
		console.error(`Failed to resolve ${src.git}:`, e);
		return null;
	}
};

const poolMap = async <T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> => {
	const results: R[] = new Array(items.length);
	let idx = 0;
	const worker = async () => {
		while (true) {
			const i = idx++;
			if (i >= items.length) return;
			const item = items[i];
			if (item === undefined) return;
			results[i] = await fn(item);
		}
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
	return results;
};

const loadSources = async (): Promise<AddonSource[]> => {
	if (!SOURCES_OVERRIDE_PATH) return defaultSources;
	try {
		if (await fs.pathExists(SOURCES_OVERRIDE_PATH)) {
			const override = (await fs.readJSON(SOURCES_OVERRIDE_PATH)) as AddonSource[];
			if (Array.isArray(override) && override.length > 0) {
				console.log(`Using addon sources override from ${SOURCES_OVERRIDE_PATH}`);
				return override;
			}
		}
	} catch (e) {
		console.error(`Failed to read override at ${SOURCES_OVERRIDE_PATH}, using defaults:`, e);
	}
	return defaultSources;
};

const buildList = async (): Promise<ResolvedAddon[]> => {
	const sources = await loadSources();
	console.log(`Resolving metadata for ${sources.length} addons (concurrency=${FETCH_CONCURRENCY})...`);
	const t0 = Date.now();
	const results = await poolMap(sources, FETCH_CONCURRENCY, resolveOne);
	const ok = results.filter((r): r is ResolvedAddon => r !== null);
	ok.sort((a, b) => a.name.localeCompare(b.name));
	console.log(`Resolved ${ok.length}/${sources.length} addons in ${Date.now() - t0}ms`);
	return ok;
};

export const getAddons = async (force = false): Promise<ResolvedAddon[]> => {
	if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return cache.data;
	}
	// Deduplicate concurrent callers — only one scrape in flight at a time.
	if (inFlight) return inFlight;
	inFlight = buildList()
		.then(data => {
			cache = { at: Date.now(), data };
			return data;
		})
		.finally(() => {
			inFlight = undefined;
		});
	return inFlight;
};

export const warmUp = () => {
	getAddons().catch(e => console.error('Addon resolver warm-up failed:', e));
};
