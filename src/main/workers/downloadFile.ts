import { workerData, parentPort } from 'worker_threads';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import https from 'node:https';
import path from 'node:path';

const port = parentPort;
if (!port) throw new Error('IllegalState');

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256 });

interface WorkerData {
	filePath: string;
	fullPath: string;
	expectedSize: number;
	serverUrl: string;
	cdnVersion: string;
}

const toUrlPath = (p: string) => p.split(path.sep).map(encodeURIComponent).join('/');

const buildClientUrl = (filePath: string, serverUrl: string, cdnVersion: string) =>
	`${serverUrl}/client/${cdnVersion}/${toUrlPath(path.normalize(filePath))}`;

const downloadFileToDisk = async (
	filePath: string,
	fullPath: string,
	expectedSize: number,
	serverUrl: string,
	cdnVersion: string
): Promise<void> => {
	const partPath = `${fullPath}.part`;
	await fs.ensureFile(partPath);
	let resumeFrom = 0;
	try {
		const stats = await fs.stat(partPath);
		if (stats.size > 0 && stats.size < expectedSize) resumeFrom = stats.size;
		else if (stats.size >= expectedSize) {
			await fs.truncate(partPath, 0);
		}
	} catch {
		// File doesn't exist yet
	}

	if (resumeFrom > 0) port.postMessage({ cb: 'onChunk', args: [resumeFrom] });

	const url = buildClientUrl(filePath, serverUrl, cdnVersion);
	const headers: Record<string, string> = {};
	if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`;

	let response;
	try {
		response = await fetch(url, { headers, agent: httpsAgent });
	} catch (e) {
		throw Error(`Network error downloading ${filePath}`);
	}

	if (!response.ok && response.status !== 206) {
		throw Error(`Failed to download ${filePath}: HTTP ${response.status}`);
	}

	// If we got 200, the server gave us the whole file — roll back
	if (resumeFrom > 0 && response.status === 200) {
		port.postMessage({ cb: 'onChunk', args: [-resumeFrom] });
		await fs.truncate(partPath, 0);
		resumeFrom = 0;
	}

	const writeStream = fs.createWriteStream(partPath, {
		flags: resumeFrom > 0 ? 'a' : 'w'
	});

	await new Promise<void>((resolve, reject) => {
		if (!response.body) {
			reject(Error('No response body'));
			return;
		}
		const body = response.body as NodeJS.ReadableStream;
		body.on('data', (chunk: Buffer | Uint8Array) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			if (!writeStream.write(buf)) body.pause();
			port.postMessage({ cb: 'onChunk', args: [buf.byteLength] });
		});
		writeStream.on('drain', () => body.resume());
		body.on('end', () => writeStream.end(resolve));
		body.on('error', reject);
		writeStream.on('error', reject);
	});

	const finalStats = await fs.stat(partPath);
	if (finalStats.size !== expectedSize) {
		throw Error(
			`Size mismatch for ${path.normalize(filePath)}: got ${finalStats.size}, expected ${expectedSize}.`
		);
	}

	await fs.move(partPath, fullPath, { overwrite: true });
};

const data = workerData as WorkerData;

downloadFileToDisk(data.filePath, data.fullPath, data.expectedSize, data.serverUrl, data.cdnVersion)
	.then(() => port.postMessage(true))
	.catch(err => {
		throw err;
	});
