import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, Sparkles } from 'lucide-react';
import cls from 'classnames';

import { api } from '~renderer/utils/api';
import useScrollHint from '~renderer/utils/useScrollHint';
import { type ModRowStatus, type ModsStatus } from '~main/types';

import TextButton from '../styled/TextButton';
import CheckboxInput from '../form/CheckboxInput';
import IconSpinner from '../styled/IconSpinner';

const RowState = ({ row }: { row: ModRowStatus }) => {
	if (row.state === 'downloading' || row.state === 'installing')
		return <IconSpinner className="text-blueGray" />;
	if (row.state === 'uninstalling')
		return <IconSpinner className="text-blueGray" />;
	if (row.state === 'error')
		return (
			<span title={row.error}>
				<AlertTriangle size={14} className="text-red" />
			</span>
		);
	if (row.installedVersion && row.installedVersion !== row.latestVersion && !row.ignoreUpdates)
		return <span className="s1 text-pink">update</span>;
	return null;
};

const ModRow = ({ row }: { row: ModRowStatus }) => {
	const toggle = api.mods.toggle.useMutation();
	const setIgnore = api.mods.setIgnoreUpdates.useMutation();
	const openLink = api.general.openLink.useMutation();

	return (
		<>
			<div className="flex items-baseline gap-2">
				{row.recommended && (
					<Sparkles size={12} className="shrink-0 text-warmGreen" />
				)}
				<span className={cls(row.recommended && 'text-warmGreen')}>{row.name}</span>
				<span className="s1 text-warmGreen">{row.latestVersion}</span>
			</div>
			<CheckboxInput
				value={row.enabled}
				setValue={v => toggle.mutate({ id: row.id, enabled: v })}
				className="justify-self-center"
			/>
			<div className="flex items-center gap-2">
				<p className="s1 text-blueGray">{row.description}</p>
				<TextButton
					icon={ExternalLink}
					size={14}
					title={row.repoUrl}
					onClick={() => openLink.mutateAsync(row.repoUrl)}
					className="!p-0 text-blueGray"
				/>
				<RowState row={row} />
			</div>
			<CheckboxInput
				value={row.ignoreUpdates}
				setValue={v => setIgnore.mutate({ id: row.id, ignore: v })}
				label={<span className="s1">Ignore updates</span>}
			/>
		</>
	);
};

const ModsTab = () => {
	const [status, setStatus] = useState<ModsStatus>();
	api.mods.observe.useSubscription(undefined, {
		onData: setStatus
	});

	const list = api.mods.list.useQuery(undefined, {
		refetchOnMount: true
	});
	useEffect(() => {
		if (!status && list.data) setStatus(list.data);
	}, [list.data, status]);

	const apply = api.mods.applyAll.useMutation();

	const scrollRef = useScrollHint<HTMLDivElement>();

	return (
		<div className="tw-surface flex min-h-0 flex-grow flex-col gap-3">
			<div className="flex items-baseline justify-between">
				<h4 className="tw-color">CUSTOM MODS</h4>
				{status?.dirty && (
					<span className="s1 text-pink">unsaved changes</span>
				)}
			</div>
			<p className="s1 text-blueGray">
				<span className="text-orange">⚠</span> Enabling custom mods may not provide
				any performance benefits or may even cause game crashes depending on your
				system. Please try disabling them if you experience any issues.
			</p>
			<hr />
			<div
				ref={scrollRef}
				className="relative -m-4 -mt-0 grid flex-grow grid-cols-[auto_auto_1fr_auto] content-start items-center gap-x-4 gap-y-2 overflow-y-auto p-4 pt-0"
			>
				{status?.mods.map(row => <ModRow key={row.id} row={row} />)}
			</div>
			<hr />
			<div className="-mb-4 -mt-3 flex items-center gap-2 py-2">
				<p className="s1 flex-grow text-blueGray">
					<span className="text-warmGreen">Highlighted</span> mods are recommended.
				</p>
				<TextButton
					type="button"
					loading={apply.isLoading || status?.state === 'busy'}
					onClick={() => apply.mutateAsync()}
					className={cls(status?.dirty && 'text-green')}
				>
					Apply
				</TextButton>
			</div>
		</div>
	);
};

export default ModsTab;
