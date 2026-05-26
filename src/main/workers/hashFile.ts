import { workerData, parentPort } from 'worker_threads';
import crypto from 'node:crypto';
import fs from 'fs-extra';

const port = parentPort;
if (!port) throw new Error('IllegalState');

interface WorkerData {
	fullPath: string;
}

const hashFile = (fullPath: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha1');
		const stream = fs.createReadStream(fullPath);
		stream.on('data', (chunk: Buffer) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex').toLocaleUpperCase()));
		stream.on('error', reject);
	});

const data = workerData as WorkerData;
hashFile(data.fullPath)
	.then(hash => port.postMessage(hash))
	.catch(err => {
		throw err;
	});
