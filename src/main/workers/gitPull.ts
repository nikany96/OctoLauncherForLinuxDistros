import { workerData, parentPort } from 'worker_threads';

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs-extra';

const port = parentPort;
if (!port) throw new Error('IllegalState');

const { dir, remote, branch, ref } = workerData as {
	dir: string;
	remote: string;
	branch: string;
	ref?: string;
};

const onProgress = (...args: unknown[]) =>
	port.postMessage({ cb: 'onProgress', args });

const removeUntrackedFiles = async () => {
	const status = await git.statusMatrix({ fs, dir });
	await Promise.all(
		status
			.filter(([, HEAD]) => HEAD === 0)
			.map(([filepath]) => fs.remove(`${dir}/${filepath}`))
	);
};

const run = async () => {
	if (ref) {
		await git.fetch({ fs, http, dir, tags: true, singleBranch: false, onProgress });
		await git.checkout({ fs, dir, force: true, ref, onProgress });
		await removeUntrackedFiles();
		return;
	}

	await git.checkout({
		fs,
		dir,
		force: true,
		ref: `${remote}/${branch}`,
		onProgress
	});
	await removeUntrackedFiles();
	await git.pull({
		fs,
		http,
		dir,
		ref: branch,
		singleBranch: true,
		author: { name: 'Octo Launcher' },
		onProgress
	});
};

run().then(() => port.postMessage(true));
