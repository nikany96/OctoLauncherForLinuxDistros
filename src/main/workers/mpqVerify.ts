import { workerData, parentPort } from 'worker_threads';
import path from 'node:path';
import crypto from 'node:crypto';
import {
	SFileOpenArchive,
	SFileCloseArchive,
	SFileHasFile,
	SFileOpenFileEx,
	SFileGetFileSize,
	SFileReadFile,
	SFileCloseFile
} from 'stormlib-node';
import { STREAM_FLAG } from 'stormlib-node/dist/enums';

const port = parentPort;
if (!port) throw new Error('IllegalState');

interface WorkerData {
	archivePath: string;
	fileList: string[];
}

const { archivePath, fileList } = workerData as WorkerData;

const hMpq = SFileOpenArchive(archivePath, STREAM_FLAG.READ_ONLY);
try {
	for (const inMpqPath of fileList) {
		if (!SFileHasFile(hMpq, inMpqPath)) {
			port.postMessage({ cb: 'onHash', args: [inMpqPath, null] });
			continue;
		}
		const hFile = SFileOpenFileEx(hMpq, inMpqPath, 0);
		try {
			const fileSize = Number(SFileGetFileSize(hFile).toString());
			const buffer = new ArrayBuffer(fileSize);
			if (fileSize > 0) SFileReadFile(hFile, buffer);
			const hash = crypto
				.createHash('sha1')
				.update(new Uint8Array(buffer))
				.digest('hex')
				.toLocaleUpperCase();
			port.postMessage({ cb: 'onHash', args: [inMpqPath, hash] });
		} finally {
			SFileCloseFile(hFile);
		}
	}
} finally {
	SFileCloseArchive(hMpq);
}

port.postMessage(null);
