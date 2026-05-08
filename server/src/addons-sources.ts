export type AddonSource = {
	git: string;
	branch?: string;
	name?: string;
	description?: string;
	ref?: string;
};

export const defaultSources: AddonSource[] = [
	{ git: 'https://github.com/CosminPOP/AtlasLoot.git', name: 'AtlasLoot' },
	{
		git: 'https://github.com/byCFM2/Atlas-TW.git',
		branch: 'main',
		ref: 'pre-rewrite-backup'
	},
	{
		git: 'https://github.com/shirsig/aux-addon-vanilla.git',
		name: 'aux-addon',
		description: 'Auction House replacement with advanced filtering and search'
	},
	{ git: 'https://github.com/absir/Bagshui.git', branch: 'main' },
	{ git: 'https://github.com/pepopo978/BetterCharacterStats.git', branch: 'main' },
	{ git: 'https://github.com/pepopo978/BigWigs.git' },
	{
		git: 'https://github.com/DBFBlackbull/BitesCookBook.git',
		description: 'Tracks which items are used in cooking and what they create'
	},
	{ git: 'https://github.com/bhhandley/CleveRoidMacros.git', branch: 'main' },
	{
		git: 'https://github.com/Cinecom/ConsumesManager.git',
		branch: 'main',
		description: 'Tracks consumables and food buffs across alts, bank, and mail'
	},
	{
		git: 'https://github.com/Kirchlive/cursive-raid.git',
		name: 'Cursive-Raid',
		description: 'Raid debuff tracker with profiles and multi-curse assist (SuperWoW)'
	},
	{ git: 'https://github.com/Player-Doite/DoiteAuras.git', branch: 'main' },
	{ git: 'https://github.com/Stormhand-dev/DragonflightUI-Reforged.git', branch: 'main' },
	{
		git: 'https://github.com/Fiurs-Hearth/ExtraResourceBars.git',
		description: 'Adds extra resource bars (mana, energy, rage) to the UI'
	},
	{ git: 'https://github.com/tilare/FlightTracker.git', branch: 'main' },
	{ git: 'https://github.com/lookino/Flyout.git', branch: 'main' },
	{
		git: 'https://github.com/trumpetx/GetHead.git',
		description: 'Recovers Onyxia and Nefarian heads from disenchant grief'
	},
	{
		git: 'https://github.com/zanthor/GNS.git',
		branch: 'main',
		description: 'Custom naming for Goblin Brainwashing Device specializations'
	},
	{ git: 'https://github.com/vatichild/guda.git', name: 'Guda', branch: 'main' },
	{ git: 'https://github.com/vatichild/GudaPlates.git', branch: 'main' },
	{ git: 'https://github.com/andresuarezschou/HCDeaths.git', branch: 'main' },
	{
		git: 'https://github.com/Arthur-Helias/InstanceJournal.git',
		description: "Encounter Journal reimagined for Turtle WoW"
	},
	{
		git: 'https://github.com/Einherjarn/ItemRack.git',
		description: 'Item set manager with quick-swap menus for inventory'
	},
	{
		git: 'https://github.com/CosminPOP/_LazyPig.git',
		name: '_LazyPig',
		description: 'Auto-dismount, auto-accept, auto-roll, and chat spam filter. /lp to configure'
	},
	{ git: 'https://github.com/Spartelfant/LevelRange-Turtle.git', branch: 'main' },
	{ git: 'https://github.com/tilare/MessageBox.git', branch: 'main' },
	{
		git: 'https://github.com/tdymel/ModifiedPowerAuras.git',
		description: "Advanced version of Sinesther's Power Auras"
	},
	{
		git: 'https://github.com/tilare/ModernMapMarkers.git',
		branch: 'main',
		description: 'Shows dungeons, raids, world bosses, and travel routes on the world map'
	},
	{
		git: 'https://github.com/vegeta1k95/ModernSpellBook.git',
		description: 'Retail-style spellbook UI for vanilla'
	},
	{ git: 'https://github.com/tilare/MovementTracker.git', branch: 'main' },
	{
		git: 'https://github.com/pepopo978/NampowerSettings.git',
		description: 'Settings panel for the Nampower spellqueue addon'
	},
	{
		git: 'https://github.com/BlackHobbiT/necrosis-twow.git',
		branch: 'main',
		description: 'Warlock helper: pets, soul shards, summoning, demon timers'
	},
	{
		git: 'https://github.com/zanthor/OG-RaidHelper.git',
		branch: 'main',
		description: 'Raid management: roles, trade distribution, soft-reserve validation'
	},
	{
		git: 'https://github.com/CosminPOP/PallyPower.git',
		description: 'Paladin buff and assignment manager for raids and parties'
	},
	{
		git: 'https://github.com/Cliencer/pfExtend.git',
		branch: 'main',
		description: 'pfQuest extension showing all monster drops and quest chains. /pfex'
	},
	{ git: 'https://github.com/shagu/pfQuest.git' },
	{ git: 'https://github.com/shagu/pfQuest-turtle.git' },
	{ git: 'https://github.com/shagu/pfUI.git' },
	{
		git: 'https://github.com/jrc13245/pfUI-addonskinner.git',
		branch: 'main',
		description: 'pfUI module that re-skins other addons to match the pfUI theme'
	},
	{
		git: 'https://github.com/Bombg/pfUI-bettertotems.git',
		branch: 'main',
		description: 'pfUI module with improved Shaman totem timers'
	},
	{
		git: 'https://github.com/Arthur-Helias/pfUI-LocationPlus.git',
		name: 'pfUI-locplus',
		description: 'Adds a location panel and zone info to pfUI'
	},
	{ git: 'https://github.com/acid9000/PizzaWorldBuffs.git', branch: 'main' },
	{
		git: 'https://github.com/npfs666/ProcDoc.git',
		branch: 'main',
		description: 'Visual proc alerts with pulsing images so you never miss them'
	},
	{ git: 'https://github.com/SabineWren/Quiver.git', branch: 'main' },
	{
		git: 'https://github.com/hazlema/Rested.git',
		description: 'Progress bar showing your rested XP while resting'
	},
	{ git: 'https://github.com/Otari98/Rinse.git' },
	{
		git: 'https://github.com/anzz1/SellValue.git',
		description: 'Shows item vendor sell value in tooltips when not at a vendor'
	},
	{ git: 'https://github.com/shagu/ShaguDPS.git' },
	{
		git: 'https://github.com/shagu/ShaguPlates.git',
		description: 'Nameplates with castbars and class colors. /splates'
	},
	{ git: 'https://github.com/shagu/ShaguTweaks.git' },
	{
		git: 'https://github.com/shagu/ShaguTweaks-extras.git',
		description: 'Extras module for ShaguTweaks (additional UI tweaks)'
	},
	{ git: 'https://github.com/pepopo978/SimpleActionSets.git' },
	{ git: 'https://github.com/Siventt/AttackBar.git' },
	{
		git: 'https://github.com/Player-Doite/Tactica.git',
		branch: 'main',
		description: 'Auto-build raids: invite/gearcheck, tactics, masterloot, role sync'
	},
	{
		git: 'https://github.com/Otari98/Tmog.git',
		description: 'Transmog item browser with collection info in tooltips'
	},
	{
		git: 'https://github.com/whtmst/T-RestedXP.git',
		branch: 'main',
		description: 'Tracks 0% and 100% rested XP thresholds'
	},
	{ git: 'https://github.com/sica42/TurtleCalendar.git', branch: 'main' },
	{
		git: 'https://github.com/sica42/TurtleMail.git',
		description: 'Mailbox UI enhancement: bulk send, search, multi-mail'
	},
	{ git: 'https://github.com/tempranova/turtlerp.git', name: 'TurtleRP', branch: 'main' },
	{ git: 'https://github.com/CosminPOP/TWThreat.git' },
	{
		git: 'https://github.com/whtmst/UnitXP_SP3_Addon.git',
		branch: 'main',
		description: 'Settings UI for the UnitXP SuperWoW client patch'
	},
	{
		git: 'https://github.com/tdymel/VCB.git',
		description: 'Smart consolidated buff frames with extensive customization'
	},
	{
		git: 'https://github.com/Fiurs-Hearth/WIIIUI.git',
		description: 'Compact custom UI replacement for Turtle WoW'
	},
	{ git: 'https://github.com/refaim/WIM.git' },
	{
		git: 'https://github.com/Arthur-Helias/ZonesLevel.git',
		description: "Shows zone level range under the title on the world map"
	}
];
