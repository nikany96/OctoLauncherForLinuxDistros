import { Settings, Minus, X } from 'lucide-react';
import { useState } from 'react';

import { api } from '~renderer/utils/api';

import DialogButton from './styled/DialogButton';
import PreferencesDialog from './PreferencesDialog';
import TextButton from './styled/TextButton';

const TopBar = () => {
	const [safeToQuit, setSafeToQuit] = useState(true);
	api.updater.observe.useSubscription(undefined, {
		onData: ({ state }) =>
			setSafeToQuit(state !== 'verifying' && state !== 'updating')
	});

	const minimize = api.general.minimize.useMutation();
	const quit = api.general.quit.useMutation();
	return (
		<div
			style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
			className="absolute left-0 right-0 top-0 flex justify-end pr-2 pt-2 opacity-50"
		>
			<div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex">
				<DialogButton dialog={close => <PreferencesDialog close={close} />}>
					{open => (
						<TextButton
							icon={Settings}
							title="Settings"
							onClick={open}
							size={16}
							className="!p-1"
						/>
					)}
				</DialogButton>
				<TextButton
					icon={Minus}
					title="Minimize"
					onClick={() => minimize.mutateAsync()}
					size={16}
					className="!p-1"
				/>
				<DialogButton
					dialog={close => (
						<div className="tw-dialog">
							<h3 className="tw-color">Quit?</h3>
							<hr />
							<p className="text-blueGray">
								Your game is currently being updated. Quitting now may cause
								problems.
							</p>
							<div className="flex gap-2 self-end">
								<TextButton onClick={close}>Return</TextButton>
								<TextButton
									onClick={() => quit.mutateAsync()}
									className="text-red"
								>
									Quit
								</TextButton>
							</div>
						</div>
					)}
				>
					{open => (
						<TextButton
							icon={X}
							title="Quit"
							onClick={() => (!safeToQuit ? open() : quit.mutateAsync())}
							size={16}
							className="!p-1 hocus:text-red"
						/>
					)}
				</DialogButton>
			</div>
		</div>
	);
};

export default TopBar;
