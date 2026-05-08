import { useState } from 'react';

import { api } from '~renderer/utils/api';

import Button from './styled/Button';

type Status =
	| { state: 'idle'; currentVersion: string }
	| { state: 'checking'; currentVersion: string }
	| { state: 'unavailable'; currentVersion: string }
	| { state: 'available'; currentVersion: string; nextVersion: string }
	| {
			state: 'downloading';
			currentVersion: string;
			nextVersion: string;
			progress: number;
	  }
	| { state: 'ready'; currentVersion: string; nextVersion: string }
	| { state: 'error'; currentVersion: string; message: string };

const SelfUpdateBanner = () => {
	const [status, setStatus] = useState<Status>({
		state: 'idle',
		currentVersion: ''
	});
	api.selfUpdater.observe.useSubscription(undefined, {
		onData: setStatus
	});
	const install = api.selfUpdater.install.useMutation();

	if (
		status.state === 'idle' ||
		status.state === 'checking' ||
		status.state === 'unavailable'
	) {
		return null;
	}

	const tone = status.state === 'error' ? 'border-red/40' : 'border-tw/40';
	const label =
		status.state === 'error'
			? `Update check failed: ${status.message}`
			: status.state === 'available'
				? `Launcher update ${'nextVersion' in status ? status.nextVersion : ''} available — preparing download…`
				: status.state === 'downloading'
					? `Downloading update ${status.nextVersion} · ${Math.round(
							status.progress * 100
						)}%`
					: status.state === 'ready'
						? `Launcher update ${status.nextVersion} ready to install`
						: '';

	return (
		<div
			className={`relative z-10 flex items-center gap-3 rounded-md border ${tone} bg-black/60 px-4 py-2 text-sm`}
		>
			<span className="flex-grow break-all">{label}</span>
			{status.state === 'ready' && (
				<Button
					primary
					onClick={() => install.mutateAsync()}
					disabled={install.isLoading}
				>
					Install now
				</Button>
			)}
		</div>
	);
};

export default SelfUpdateBanner;
