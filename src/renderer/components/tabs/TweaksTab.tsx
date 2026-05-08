import { useForm, type UseFormReturn } from 'react-hook-form';
import { useEffect } from 'react';
import cls from 'classnames';

import { api } from '~renderer/utils/api';
import { ConfigWtfSchema } from '~common/schemas';
import zodResolver from '~renderer/utils/zodResolver';
import useScrollHint from '~renderer/utils/useScrollHint';

import TextButton from '../styled/TextButton';
import CheckboxInput from '../form/CheckboxInput';
import NumberGrabInput from '../form/NumberGrabInput';

type ItemProps = {
	type?: 'checkbox' | 'number';
	id: keyof ConfigWtfSchema;
	label: string;
	recommended?: boolean;
	text: string;
	min?: number;
	max?: number;
	step?: number;
	sensitivity?: number;
	form: UseFormReturn<ConfigWtfSchema>;
};

const Item = ({
	type = 'checkbox',
	id,
	label,
	recommended,
	text,
	form,
	...props
}: ItemProps) => {
	const { watch, setValue, register } = form;
	const setOpts = {
		shouldTouch: true,
		shouldDirty: true,
		shouldValidate: true
	} as const;
	const watched = type === 'checkbox' ? watch(id) : undefined;
	const registered = type === 'number' ? register(id) : undefined;
	return (
		<>
			<p className={cls({ 'text-warmGreen': recommended })}>{label}</p>
			{type === 'checkbox' && (
				<CheckboxInput
					value={!!watched}
					setValue={v => setValue(id, v, setOpts)}
					className="justify-self-center"
				/>
			)}
			{type === 'number' && registered && (
				<NumberGrabInput
					{...registered}
					{...props}
					setValue={v => setValue(id, v, setOpts)}
				/>
			)}
			<p className="s1 text-blueGray">{text}</p>
		</>
	);
};

const TweaksTab = () => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const applyPatch = api.patcher.apply.useMutation();
	const verify = api.updater.verify.useMutation();

	const form = useForm<ConfigWtfSchema>({
		defaultValues: pref?.config ?? {},
		resolver: zodResolver(ConfigWtfSchema)
	});
	const { handleSubmit, reset } = form;

	useEffect(() => {
		pref && reset(pref.config);
	}, [reset, pref]);

	const scrollRef = useScrollHint<HTMLDivElement>();

	return (
		<form
			onSubmit={handleSubmit(async config => {
				await setPref.mutateAsync({ config });
				await applyPatch.mutateAsync();
				await verify.mutateAsync();

				reset(config);
			})}
			className="tw-surface flex min-h-0 flex-grow flex-col gap-3"
		>
			<div
				ref={scrollRef}
				className="relative -m-4 -mb-3 grid flex-grow grid-cols-[auto_auto_1fr] content-start items-center gap-x-3 gap-y-1 overflow-y-auto p-4 pb-3"
			>
				<Item
					form={form}
					id="alwaysAutoLoot"
					label="Always auto-loot"
					text="Reverses auto-loot behavior to always auto-loot and disable auto-with bound key."
				/>
				<Item
					form={form}
					id="largeAddress"
					label="Large Address Aware"
					text="Allows the game to use more than 2GB of memory."
					recommended
				/>
				<Item
					form={form}
					type="number"
					id="nameplateRange"
					label="Nameplate range"
					text="Increases distance at which nameplates are visible. [Vanilla: 20] [Classic: 41]"
					min={0}
					max={41}
				/>

				<h4 className="tw-color col-span-3 mt-3">Camera</h4>
				<Item
					form={form}
					id="fieldOfView"
					label="Field of View"
					type="number"
					text="Recommended for widescreen window resolutions. [Vanilla: 90] [Tweaks: 110]"
					min={90}
					max={180}
					step={5}
				/>
				<Item
					form={form}
					id="farClip"
					label="Render distance"
					type="number"
					text="Increases maximum render distance. [Vanilla: 777] [Tweaks: 10000]"
					min={100}
					max={10000}
					sensitivity={3}
				/>
				<Item
					form={form}
					id="frillDistance"
					label="Ground clutter distance"
					type="number"
					text="Changes ground clutter render distance. [Vanilla: 70] [Tweaks: 300]"
					min={0}
					max={300}
					sensitivity={0.3}
				/>
				<Item
					form={form}
					id="cameraDistance"
					label="Camera distance"
					type="number"
					text="Increases maximum camera (zoom out) distance. [Vanilla: 50] [Max:100]"
					min={50}
					max={100}
				/>

				<h4 className="tw-color col-span-3 mt-3">Sounds</h4>
				<Item
					form={form}
					id="soundInBackground"
					label="Background sounds"
					text="Allows game sounds to play while the game is minimized."
					recommended
				/>
			</div>
			<hr />
			<div className="-mb-4 -mt-3 flex items-center gap-2 py-2">
				<p className="s1 flex-grow text-blueGray">
					<span className="s1 text-warmGreen">Highlighted</span> options are
					recommended and enabled by default
				</p>
				<TextButton
					onClick={async () => {
						const config = ConfigWtfSchema.parse({});
						await setPref.mutateAsync({ config });
						reset(config);
					}}
				>
					Reset
				</TextButton>
				<TextButton type="submit" className="text-green">
					Apply
				</TextButton>
			</div>
		</form>
	);
};

export default TweaksTab;
