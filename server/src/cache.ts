import crypto from 'crypto';
import path from 'path';

import fs from 'fs-extra';

const allowedExtra = [
	'.launcher',
	'Data',
	'Errors',
	'Interface\\AddOns',
	'Logs',
	'Screenshots',
	'WDB',
	'WTF\\Account'
];

const vanillaFixes = ['VfPatcher.dll', 'd3d9.dll', 'dxvk.conf'];

const skipFiles = new Set(['manifest.json', 'wow-client.zip', '.gitkeep']);

type FolderTags = 'allowExtra';
type FileTags = 'vanillaFixes';

type FileManifest = { name: string } & (
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

const getHash = (...filePath: string[]): Promise<string> =>
	new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha1');
		const stream = fs.createReadStream(path.join(...filePath));
		stream.on('error', reject);
		stream.on('data', (chunk: Buffer) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex').toLocaleUpperCase()));
	});

export const buildCache = async (clientPath: string) => {
	console.log('Building cache...');

	const buildTree = async (...filePath: string[]): Promise<FileManifest[]> => {
		const files = await fs.readdir(path.join(clientPath, ...filePath));

		const patches: string[] = [];
		const tree: FileManifest[] = [];
		for (const file of files.sort()) {
			if (skipFiles.has(file)) continue;

			const stats = await fs.stat(path.join(clientPath, ...filePath, file));

			if (stats.isDirectory()) {
				if (file.match(/patch-./)) {
					patches.push(file);
					tree.push({
						type: 'mpq',
						name: file,
						files: await buildTree(...filePath, file),
						size: (
							await fs.stat(path.join(clientPath, ...filePath, `${file}.mpq`))
						).size,
						hash: await getHash(clientPath, ...filePath, `${file}.mpq`)
					});
				} else {
					const tags: FolderTags[] = [];
					allowedExtra.includes(path.join(...filePath, file)) &&
						tags.push('allowExtra');
					tree.push({
						type: 'dir',
						name: file,
						files: await buildTree(...filePath, file),
						tags: tags.length ? tags : undefined
					});
				}
				continue;
			}

			// Skip if extracted mpq patch
			if (patches.find(v => file.match(v))) continue;
			const allowModifiedPaths = new Set([
				'WTF/Config.wtf',
				'Data/fonts.MPQ',
				'Data/sound.MPQ',
				'Data/speech.MPQ'
			]);
			const fullPath = path
				.join(...filePath, file)
				.split(path.sep)
				.join('/');
			const allowModified =
				file === 'WoW.exe' || allowModifiedPaths.has(fullPath);

			const tags: FileTags[] = [];
			vanillaFixes.includes(file) && tags.push('vanillaFixes');

			tree.push({
				type: 'file',
				name: file,
				hash: await getHash(clientPath, ...filePath, file),
				version: allowModified ? stats.mtimeMs : undefined,
				size: stats.size,
				tags: tags.length ? tags : undefined
			});
		}
		return tree;
	};

	await fs.writeJSON(path.join(clientPath, 'manifest.json'), {
		build: 3,
		buildName: '3',
		root: {
			type: 'dir',
			name: '',
			files: await buildTree()
		}
	});
};
