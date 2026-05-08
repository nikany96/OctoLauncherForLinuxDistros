import { useState, type ReactElement } from 'react';
import cls from 'classnames';

import { type UpdaterStatus, type ModsStatus } from '~main/types';
import { formatFileSize } from '~common/utils';
import { api } from '~renderer/utils/api';

import Button from './styled/Button';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';

const formatDuration = (seconds: number) => {
	const s = Math.max(0, Math.round(seconds));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rem = s % 60;
	if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
	const h = Math.floor(m / 60);
	const minRem = m % 60;
	return minRem ? `${h}h ${minRem}m` : `${h}h`;
};

const ProgressDetails = ({ status }: { status: UpdaterStatus }) => {
	const { bytesDone, bytesTotal, bytesPerSecond, etaSeconds, progress } = status;
	if (bytesTotal === undefined || bytesDone === undefined) return null;

	const pct = progress !== undefined && progress >= 0
		? `${(progress * 100).toFixed(1)}%`
		: '—';

	return (
		<p className="s1 text-blueGray">
			<span className="tw-color">{pct}</span>
			<span> · {formatFileSize(bytesDone)} / {formatFileSize(bytesTotal)}</span>
			{bytesPerSecond !== undefined && bytesPerSecond > 0 && (
				<span> · {formatFileSize(bytesPerSecond)}/s</span>
			)}
			<span>
				{' · '}
				{etaSeconds !== undefined
					? `~${formatDuration(etaSeconds)} remaining`
					: 'calculating…'}
			</span>
		</p>
	);
};

const LaunchPanel = () => {
	const [status, setStatus] = useState<UpdaterStatus>({ state: 'verifying' });
	api.updater.observe.useSubscription(undefined, {
		onData: data => {
			console.log({ data });
			setStatus(data);
		},
		onError: err => console.log({ err }),
		onStarted: () => console.log('Started')
	});

	const { data: pref } = api.preferences.get.useQuery();

	const [modsStatus, setModsStatus] = useState<ModsStatus>();
	api.mods.observe.useSubscription(undefined, {
		onData: setModsStatus
	});

	const verify = api.updater.verify.useMutation();
	const update = api.updater.update.useMutation();
	const start = api.launcher.start.useMutation();
	const applyMods = api.mods.applyAll.useMutation();

	const props: Record<
		UpdaterStatus['state'],
		{ button: ReactElement; helperText?: ReactElement }
	> = {
		verifying: { button: <Button disabled>Verifying</Button> },
		serverUnreachable: {
			button: pref?.version ? (
				<Button onClick={() => start.mutateAsync()}>Play</Button>
			) : (
				<Button onClick={() => verify.mutateAsync()}>Retry</Button>
			),
			helperText: (
				<div className="-mb-2">
					<p>
						<span className="text-orange">Error: </span> Failed to reach update
						server
					</p>
					<p className="s1 text-blueGray">
						{pref?.version
							? `You can launch local version ${pref?.version}`
							: 'Please try again later'}
					</p>
				</div>
			)
		},
		noClient: {
			button: (
				<DialogButton
					clickAway
					dialog={close => <ClientDirDialog close={close} />}
				>
					{open => (
						<Button primary onClick={open}>
							Install
						</Button>
					)}
				</DialogButton>
			)
		},
		updateAvailable: {
			button: <Button onClick={() => update.mutateAsync()}>Update</Button>,
			helperText: (
				<div className="-mb-2 flex flex-col gap-1">
					<p>Update available!</p>
					<p className="s1 text-blueGray">
						{status.progress !== undefined &&
							status.bytesDone !== undefined &&
							status.bytesTotal !== undefined && (
								<>
									<span className="tw-color">
										{(status.progress * 100).toFixed(1)}%
									</span>
									<span>
										{' '}
										· {formatFileSize(status.bytesDone)} /{' '}
										{formatFileSize(status.bytesTotal)} on disk ·{' '}
									</span>
								</>
							)}
						<span className="break-all">{status.message}</span> remaining
					</p>
				</div>
			)
		},
		updating: {
			button: <Button disabled>Updating</Button>,
			helperText: (
				<div className="-mb-2 flex flex-col gap-1">
					{status.message && (
						<p className="s1 truncate text-blueGray">{status.message}</p>
					)}
					<ProgressDetails status={status} />
				</div>
			)
		},
		upToDate: {
			button: modsStatus?.dirty ? (
				<Button
					primary
					onClick={() => applyMods.mutateAsync()}
					disabled={applyMods.isLoading || modsStatus?.state === 'busy'}
				>
					{modsStatus?.state === 'busy' ? 'Applying' : 'Update'}
				</Button>
			) : (
				<Button primary onClick={() => start.mutateAsync()}>
					Play
				</Button>
			),
			helperText: (
				<div className="-mb-2">
					{modsStatus?.dirty ? (
						<p>Mods changed — apply before playing</p>
					) : (
						<p>Everything up to date!</p>
					)}
					<p className="s1 text-blueGray">Version: {pref?.version}</p>
				</div>
			)
		},
		failed: {
			button: <Button onClick={() => verify.mutateAsync()}>Retry</Button>,
			helperText: (
				<div className="-mb-2">
					<p>
						<span className="text-orange">Error: </span>
						{status.message}
					</p>
					<p className="s1 text-blueGray">
						Verify your game data by clicking Retry.
					</p>
				</div>
			)
		}
	};

	return (
		<div className="flex gap-3">
			<div className="flex flex-grow flex-col justify-end gap-3">
				{props[status.state].helperText ??
					(status.message && (
						<p className="s1 -mb-2 text-blueGray">{status.message}</p>
					))}
				<div className="tw-loading-wrapper">
					{status.progress !== undefined && (
						<div
							className={cls('tw-loading', {
								'tw-loading-unknown': status.progress === -1
							})}
							style={
								status.progress !== -1
									? {
											clipPath: `inset(0 ${
												100 - Math.ceil(Math.abs(status.progress) * 100)
											}% 0 0)`
									  }
									: undefined
							}
						/>
					)}
				</div>
			</div>
			{props[status.state].button}
		</div>
	);
};

export default LaunchPanel;
