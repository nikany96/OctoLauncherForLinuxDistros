import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import {
	FilePen,
	FolderOpen,
	RefreshCw,
	ScrollText,
	ShieldCheck
} from 'lucide-react';

import { PreferencesSchema } from '~common/schemas';
import { api } from '~renderer/utils/api';
import zodResolver from '~renderer/utils/zodResolver';

import TextButton from './styled/TextButton';
import CheckboxInput from './form/CheckboxInput';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';
import CloseButton from './styled/CloseButton';

const MirrorStatus = () => {
	const [state, setState] = useState<string>('verifying');
	api.updater.observe.useSubscription(undefined, {
		onData: ({ state }) => setState(state)
	});

	if (state === 'serverUnreachable')
		return <span className="s1 text-red">offline</span>;
	if (state === 'verifying' || state === 'updating')
		return <span className="s1 text-blueGray">checking…</span>;
	return <span className="s1 text-warmGreen">online</span>;
};

type Props = { close: () => void };

const PreferencesDialog = ({ close }: Props) => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const verify = api.updater.verify.useMutation();
	const openInstallFolder = api.general.openInstallFolder.useMutation();
	const openLogFile = api.general.openLogFile.useMutation();

	const { handleSubmit, watch, setValue, reset } = useForm({
		defaultValues: pref ?? {},
		resolver: zodResolver(PreferencesSchema)
	});

	useEffect(() => {
		pref && reset(pref);
	}, [reset, pref]);

	const setBool = (key: keyof PreferencesSchema) => (v: boolean) =>
		setValue(key, v, {
			shouldTouch: true,
			shouldDirty: true,
			shouldValidate: true
		});

	return (
		<form
			className="tw-dialog !w-fit min-w-[480px] max-w-[640px] !gap-1 whitespace-nowrap"
			onSubmit={handleSubmit(async v => {
				await setPref.mutateAsync(v);
				close();
			})}
		>
			<CloseButton
				close={() => {
					reset();
					close();
				}}
			/>
			<h3 className="tw-color">SETTINGS</h3>
			<hr className="mb-1" />

			<div className="flex items-center gap-3">
				<h4 className="tw-color">INSTALL LOCATION:</h4>
				<TextButton
					icon={FolderOpen}
					size={14}
					onClick={() => openInstallFolder.mutateAsync()}
					className="!p-1 text-blueGray"
				>
					Open folder
				</TextButton>
			</div>
			<div className="flex items-center gap-2 border border-blueGray/20 bg-darkGray/40 px-3 py-1">
				<span
					title={pref?.clientDir}
					className="min-w-0 shrink grow overflow-hidden text-ellipsis"
				>
					{pref?.clientDir ?? 'Not selected'}
				</span>
				<DialogButton
					dialog={closeInner => (
						<ClientDirDialog
							close={() => {
								closeInner();
								close();
							}}
						/>
					)}
					clickAway={pref?.isPortable}
				>
					{open => (
						<TextButton icon={FilePen} size={14} onClick={open} className="!p-1">
							Change
						</TextButton>
					)}
				</DialogButton>
			</div>

			<div className="mt-1 flex items-center gap-3">
				<h4 className="tw-color">DOWNLOAD MIRROR:</h4>
			</div>
			<div className="flex items-center gap-2 pl-2">
				<input type="radio" checked readOnly className="accent-warmGreen" />
				<span>Iceland</span>
				<MirrorStatus />
				<TextButton
					icon={RefreshCw}
					size={12}
					onClick={() => verify.mutateAsync()}
					title="Re-check"
					className="!p-0 text-blueGray"
				/>
			</div>

			<div className="flex items-start gap-3">
				<div className="flex flex-col">
					<h4 className="tw-color">TROUBLESHOOTING:</h4>
					<TextButton
						icon={ShieldCheck}
						onClick={() => verify.mutateAsync().then(close)}
						className="text-warmGreen"
					>
						Verify game files
					</TextButton>
					<TextButton
						icon={ScrollText}
						onClick={() => openLogFile.mutateAsync()}
						className="text-pink"
					>
						Open log file
					</TextButton>
				</div>

				<div className="flex flex-col">
					<h4 className="tw-color">GENERAL SETTINGS:</h4>
					<CheckboxInput
						value={!!watch('cleanWdb')}
						setValue={setBool('cleanWdb')}
						label="Clean WDB on each launch"
					/>
					<CheckboxInput
						value={!!watch('minimizeToTrayOnPlay')}
						setValue={setBool('minimizeToTrayOnPlay')}
						label="Minimize to tray while playing"
					/>
				</div>
			</div>

			<TextButton type="submit" className="mt-1 self-end text-green">
				Save
			</TextButton>
		</form>
	);
};

export default PreferencesDialog;
