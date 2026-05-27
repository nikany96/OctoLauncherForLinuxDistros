# OctoLauncher (Linux)

Linux port of the desktop launcher for the OctoWoW (World of Warcraft 1.12.1 private server) client. Built with Electron, React, and tRPC.

**What it does:**
- Downloads and verifies the OctoWoW game client via a manifest-based CDN updater
- Rewrites `Config.wtf` with the correct realm/patch-list on every launch
- Optionally applies binary tweaks to `WoW.exe` (FOV, far-clip, large-address flag, etc.)
- Manages git-based addon installations
- Launches the game via `wine WoW.exe`

> **Note:** DLL injection (`dll-inject`, VanillaFixes chainloader) is Windows-only and is skipped on Linux. Self-update via NSIS is also Windows-only.

---

## Requirements

- [Wine](https://www.winehq.org/) — tested with `wine-11.9`
- A GPU with Vulkan support (see [graphics setup](#graphics-setup) below)

---

## How to download

Go to the [Releases](../../releases) page and choose the package for your distro.

### AppImage (all distros)

1. Download `OctoLauncher.AppImage`.
2. Make it executable:
   ```bash
   chmod +x OctoLauncher.AppImage
   ```
3. Run it and set your WoW client directory when prompted.
4. Click **Verify** to download any missing game files, then **Play**.

> **Ubuntu 22.04+ / newer Debian:** Use the `.deb` package below instead — it does not require FUSE.

### .deb (Debian / Ubuntu)

1. Download `OctoLauncher.deb`.
2. Install it:
   ```bash
   sudo dpkg -i OctoLauncher.deb
   ```
3. Launch **OctoLauncher** from your application menu or run `octo-launcher`.
4. Set your WoW client directory when prompted, then click **Verify** and **Play**.

No server configuration needed — the launcher connects to `octowow.st` by default.

---

## Graphics setup

WoW 1.12.1 uses Direct3D 8. On Linux the recommended translation chain is:

```
WoW (D3D8) → d3d8to9.dll → DXVK d3d9.dll → Vulkan
```

### Step 1 — Check your Vulkan version

```bash
vulkaninfo --summary 2>/dev/null | grep apiVersion
```

If `vulkaninfo` is not installed:
```bash
# Arch
sudo pacman -S vulkan-tools
# Debian/Ubuntu
sudo apt install vulkan-tools
```

### Step 2 — Download the correct DXVK version

| Your GPU | Vulkan support | DXVK version to use |
|---|---|---|
| GTX 900+ / RX 400+ and newer | Vulkan 1.3 | [DXVK latest (2.x)](https://github.com/doitsujin/dxvk/releases) — download `dxvk-x.x.tar.gz` |
| GTX 600–700 (Kepler), GTX 750 | Vulkan 1.2 only | [DXVK 1.10.3](https://github.com/doitsujin/dxvk/releases/tag/v1.10.3) — download `dxvk-1.10.3.tar.gz` |

> DXVK 2.x requires Vulkan 1.3. Using it on a Vulkan 1.2 card will crash.

Also download **d3d8to9**: [latest release](https://github.com/crosire/d3d8to9/releases) — download `d3d8.dll`.

### Step 3 — Install the DLLs

1. Extract `d3d8.dll` from d3d8to9 and copy it to your WoW client directory (same folder as `WoW.exe`).
2. Extract the DXVK archive and copy `x32/d3d9.dll` to the same WoW client directory.

```
WoW client directory/
├── WoW.exe
├── d3d8.dll   ← d3d8to9
└── d3d9.dll   ← DXVK x32
```

### Step 4 — Config.wtf

Make sure `WTF/Config.wtf` does **not** contain `SET gxMultisample "8"` — this causes stuttering on Wine. Remove the line if present.

---

## Running multiple instances

The launcher supports running two WoW clients simultaneously — useful for dual-boxing. Click **Play** a second time while the first game is already running and a second instance starts automatically.

Each instance gets its own Wine prefix (`~/.wine-wow-1`, `~/.wine-wow-2`) so WoW's single-instance mutex does not block the second launch. Both instances share the same game directory.

> **First launch of a new prefix:** Wine may show a "Wine Mono Installer" dialog. Click **Annuller / Cancel** — WoW does not need Mono.

---

## i3 / tiling window managers

The launcher runs each WoW instance inside a Wine virtual desktop (`wine explorer /desktop=wow-N`). This isolates mouse capture between instances so clicking in one game does not steal focus from the other.

The virtual desktop creates an `explorer.exe` X window. Without configuration, i3 will tile this window against whatever else is on screen, pushing the existing game out of fullscreen and revealing the i3 bar.

### Fix — add floating rules to `~/.config/i3/config`

```
for_window [class="explorer.exe" title="wow-1"] floating enable, move position 0 0
for_window [class="explorer.exe" title="wow-2"] floating enable, move position 1920 0
```

Adjust the `move position` coordinates to match your monitor layout (`xrandr` shows offsets). With a single monitor both lines can use `move position 0 0`.

Reload i3 after editing:

```bash
i3-msg reload
```

---

## Building from source

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 25.x | Tested on 25.7.0 — `dll-inject` is skipped on Linux so Node version restrictions don't apply |
| npm | 11.x | |
| Wine | 11.9+ | For launching WoW |
| gcc/g++ | System | Required by `node-gyp` for `stormlib-node` |
| Python | 3.x | Required by `node-gyp` |

On Arch Linux:
```bash
sudo pacman -S nodejs npm wine base-devel python
```

On Debian/Ubuntu:
```bash
sudo apt install nodejs npm wine build-essential python3
```

### Install dependencies

```bash
npm install
```

`postinstall` rebuilds the native module `stormlib-node` against the Electron ABI — expect C++ compiler output. `dll-inject` is listed as an optional dependency and is safely skipped on Linux.

### Run in development

> **Note:** If your terminal sets `ELECTRON_RUN_AS_NODE=1` (e.g. VS Code integrated terminal), unset it first — it crashes Electron:
> ```bash
> unset ELECTRON_RUN_AS_NODE
> ```

```bash
npm run dev
```

Opens the app in a hot-reloading Electron window. The dev build points to `https://octowow.st` by default — create a `.env` file from `.env.example` to run against a local server instead.

### Build for distribution

```bash
unset ELECTRON_RUN_AS_NODE
npm run dist
```

Outputs to `dist/`:
- `OctoLauncher.AppImage` — portable, runs on any distro
- `OctoLauncher.deb` — for Debian/Ubuntu-based distributions

> **Note (Arch Linux):** Building the `.deb` requires `libxcrypt-compat`:
> ```bash
> sudo pacman -S libxcrypt-compat
> ```

---

## Running the dev backend

The `server/` subdirectory is a standalone Express server that simulates the production CDN for local development. It is **not** bundled into the Electron app.

```bash
cd server
npm install
```

Create `server/.env` from `server/.env.example` and set `SOURCE_DIR` to your local WoW client directory, then:

```bash
npm run dev
```

The server listens on `http://localhost:5000` and serves:
- `GET /api/file/:version/manifest.json`
- `GET /client/:version/*` — per-file downloads
- `GET /api/addons.json`

---

## Architecture overview

Three Vite bundles tied together by tRPC over Electron IPC:

- **Main** ([src/main/](src/main/)) — Electron main process; owns all filesystem/native work and the tRPC router
- **Preload** ([src/preload/](src/preload/)) — secure IPC bridge via `exposeElectronTRPC()`
- **Renderer** ([src/renderer/](src/renderer/)) — React 18 + Tailwind UI; no direct Node access

All cross-process data shapes are Zod schemas in [src/common/schemas.ts](src/common/schemas.ts). All renderer→main calls go through tRPC procedures in [src/main/api/routers/](src/main/api/routers/) — never raw `ipcMain.handle`.

Large operations (file downloads, SHA1 verification) run in Node.js worker threads ([src/main/workers/](src/main/workers/)) to keep the Electron event loop free.

---

## License

MIT
