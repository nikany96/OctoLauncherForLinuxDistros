import { workerData, parentPort } from 'worker_threads';
import {
	SFileOpenArchive,
	SFileCloseArchive,
	SFileHasFile,
	SFileRemoveFile,
	SFileCreateFile,
	SFileWriteFile,
	SFileFinishFile,
	SFileFlushArchive,
	SFileCompactArchive
} from 'stormlib-node';
import { MPQ_COMPRESSION, MPQ_FILE } from 'stormlib-node/dist/enums';

const port = parentPort;
if (!port) throw new Error('IllegalState');

interface FileUpdate {
	inMpqPath: string;
	data: ArrayBuffer;
}

interface WorkerData {
	archivePath: string;
	files: FileUpdate[];
}

const { archivePath, files } = workerData as WorkerData;

const hMpq = SFileOpenArchive(archivePath, 0);
try {
	for (const { inMpqPath, data } of files) {
		if (SFileHasFile(hMpq, inMpqPath)) SFileRemoveFile(hMpq, inMpqPath);
		const hFile = SFileCreateFile(hMpq, inMpqPath, 0, data.byteLength, 0, MPQ_FILE.COMPRESS);
		try {
			SFileWriteFile(hFile, data, MPQ_COMPRESSION.ZLIB);
		} finally {
			SFileFinishFile(hFile);
		}
	}
	SFileFlushArchive(hMpq);
	SFileCompactArchive(hMpq);
} finally {
	SFileCloseArchive(hMpq);
}

port.postMessage(null);
