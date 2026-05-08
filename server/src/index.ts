import path from 'path';

import { config as loadEnv } from 'dotenv';
import express from 'express';

loadEnv();

import fs from 'fs-extra';
import { buildCache } from './cache.js';
import { getAddons, warmUp as warmUpAddons } from './addons-resolver.js';

// Set SOURCE_DIR to your local WoW client directory (see server/.env.example).
const SourceDir: string = (() => {
	const dir = process.env.SOURCE_DIR;
	if (!dir) {
		console.error(
			'ERROR: SOURCE_DIR is not set.\n' +
				'Set it to your local WoW client directory.\n' +
				'Example: SOURCE_DIR="C:\\\\WoW\\\\client" npm run dev\n' +
				'Or create server/.env — see server/.env.example.'
		);
		process.exit(1);
	}
	return dir;
})();

const app = express();
const port = 5000;

let buildInFlight: Promise<void> | null = null;
const ensureManifestBuilt = (): Promise<void> => {
	if (buildInFlight) return buildInFlight;
	buildInFlight = buildCache(SourceDir).catch(e => {
		buildInFlight = null;
		throw e;
	});
	return buildInFlight;
};

app.get('/api/file/:version/manifest.json', async (_req, res) => {
	console.log(`Fetching manifest`);
	const filePath = path.join(SourceDir, 'manifest.json');
	if (!fs.existsSync(filePath)) await ensureManifestBuilt();

	res.json(await fs.readJSON(filePath));
});

app.get(
	'/api/file/:version/*',
	async (req: express.Request<{ 0: string }>, res) => {
		const filePath = req.params[0];
		const resolved = path.resolve(SourceDir, filePath);
		if (!resolved.startsWith(path.resolve(SourceDir) + path.sep)) {
			res.status(403).send('Forbidden');
			return;
		}
		console.log(`Fetching file: ${filePath}`);
		res.sendFile(resolved);
	}
);

app.get('/api/addons.json', async (req, res) => {
	try {
		const force = req.query.refresh === '1';
		const addons = await getAddons(force);
		res.json(addons);
	} catch (e) {
		console.error('Failed to resolve addons:', e);
		res.status(500).json({ error: 'Failed to resolve addons' });
	}
});

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
	warmUpAddons();

	void (async () => {
		const manifestPath = path.join(SourceDir, 'manifest.json');
		if (fs.existsSync(manifestPath)) return;
		console.log(`Pre-warming manifest cache for ${SourceDir}...`);
		try {
			await ensureManifestBuilt();
			console.log(`Manifest cache pre-warm complete.`);
		} catch (e) {
			console.error('Manifest pre-warm failed:', e);
		}
	})();
});
