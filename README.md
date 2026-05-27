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

> **Ubuntu 22.04+ / newer Debian:** AppImage requires `libfuse2` which is not installed by default:
> ```bash
> sudo apt install libfuse2
> ```

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

WoW 1.12.1 uses Direct3D 8. On Linux, the recommended translation chain is:

```
WoW (D3D8) → d3d8to9.dll → DXVK d3d9.dll → Vulkan
```

| File | Version | Purpose |
|---|---|---|
| `d3d8.dll` | d3d8to9 v1.12.0 | Translates D3D8 → D3D9 |
| `d3d9.dll` | DXVK 1.10.3 x32 | Translates D3D9 → Vulkan |

Place both DLLs in your WoW client directory (same folder as `WoW.exe`).

> **DXVK version matters:** DXVK 2.x requires Vulkan 1.3. Cards like the GTX 770 (Kepler) only support Vulkan 1.2 — use DXVK 1.10.3 x32 instead.

Also make sure `WTF/Config.wtf` does **not** contain `SET gxMultisample "8"` — this causes stuttering on Wine.

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
