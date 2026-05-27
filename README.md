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

WoW 1.12.1 supports two rendering paths on Linux:

| Option | Requires | Performance |
|---|---|---|
| **DXVK** (recommended) | Vulkan 1.2+ | Best |
| **OpenGL** | Any GPU with OpenGL | Good enough for a 2004 game |

### Option A — OpenGL (no extra files needed)

Add this line to `WTF/Config.wtf`:

```
SET gxApi "OpenGL"
```

WoW uses its built-in OpenGL renderer directly — no DLL translation, no Vulkan required. Works on any GPU.

### Option B — DXVK + Vulkan (recommended)

Best performance. Translation chain:

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

## Changes from the original Windows launcher

This fork adds full Linux support. Below is a complete list of every change made to the upstream codebase.

### Build system

**`electron-builder.yml`** — Added Linux targets:
- AppImage (portable, all distros)
- `.deb` (Debian/Ubuntu)

**`package.json`**:
- `dll-inject` changed to an optional dependency — it requires a Windows toolchain and cannot compile on Linux
- Removed missing `scrub-native-paths.cjs` from the `postinstall` script (caused install failures on Linux)

### Game launch (`src/main/api/routers/launcher.ts`)

- **Wine launch:** on Linux the game is started with `wine explorer /desktop=wow-N,WxH WoW.exe` instead of running `WoW.exe` directly
- **DLL injection skipped:** `dll-inject` / VanillaFixes chainloader is Windows-only; the step is skipped entirely on Linux with a log message
- **`cleanWdb` path fix:** the original code deleted the wrong directory on non-Windows paths
- **Multi-instance support:** clicking Play while the game is already running launches a second instance. Each instance gets its own Wine prefix (`~/.wine-wow-1`, `~/.wine-wow-2`, …) so WoW's single-instance mutex does not block the second launch. `cleanWdb` is skipped while any instance is running to avoid deleting files mid-session
- **Wine virtual desktop:** each instance runs inside `wine explorer /desktop=wow-N` which isolates mouse capture — without this, clicking in one game window steals focus from the other
- **Launcher stays open:** the launcher window no longer closes or minimizes to tray when Play is clicked

### Downloader performance (`src/main/modules/updater.ts`, `src/main/workers/`)

The original downloader ran entirely on the Electron main-process event loop, which caused severe throughput degradation on Linux (measured: ~70 KB/s).

- **Download worker thread** (`src/main/workers/downloadFile.ts`): file downloads moved off the main process. Throughput after fix: ~29 MB/s
- **Streaming SHA1** (`#getHash`): replaced `fs.readFile` (loads entire file into memory) with `fs.createReadStream` — the original hung indefinitely on large `.mpq` files
- **Hash worker thread** (`src/main/workers/hashFile.ts`): SHA1 of files >1 MB is offloaded to a worker thread so verification no longer blocks the event loop
- **Parallel verification:** `buildTree` uses `Promise.all` with a semaphore (`MAX_CONCURRENT_HASHES = os.cpus().length`). Verifying 8.18 GB takes ~10 seconds
- **Download concurrency limiter:** semaphore `MAX_CONCURRENT_DOWNLOADS = 3` prevents connection saturation
- **`buildClientUrl` fix:** `fetchFile` called `buildClientUrl` which was not defined in `updater.ts`; added `toUrlPath` and `buildClientUrl` helpers

### Config patching (`src/main/modules/patcher.ts`)

- **`gxMultisample` fix:** removed `gxMultisample: 8` from the `patchConfig` defaults and added an explicit `gxMultisample: undefined` after the `...configWtf` spread. The value `8` written to `Config.wtf` caused severe frame stuttering under Wine/DXVK

### Launcher process (`src/main/index.ts`)

- **Hardware acceleration re-enabled:** removed `app.disableHardwareAcceleration()` — it caused the Electron UI to render via software rasterisation, burning CPU
- **Reduced Electron RAM footprint:** added Chromium flags: `--js-flags="--max-old-space-size=128"`, `--disable-http-cache`, `--disable-background-networking`, `--disable-extensions`, `--disable-sync`, `--disable-translate`, `--disable-spell-checking`
- **DevTools gated to dev mode:** DevTools are no longer opened in production builds

### Self-updater (`src/main/modules/selfUpdater.ts`)

- **Auto-update check skipped on Linux:** the server has no `latest-linux.yml` release channel, so the updater always produced an error notification on startup. A `process.platform === 'linux'` early return suppresses the check entirely

### Renderer (`src/renderer/components/LaunchPanel.tsx`)

- **Debug log removed:** `console.log({ data })` was firing on every state update, flooding the DevTools console

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
