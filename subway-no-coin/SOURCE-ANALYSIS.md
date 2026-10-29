# Ashuni client inspection — 2026-10-29

Inspected the publicly served client at https://ashuni.lol/journey-to-the-east/. This is a Unity WebGL build titled **Journey to the East 2.12.0 | Ashuni**.

## Retrieved and examined

- The game HTML and `journey-to-the-east/reborn.json` manifest.
- Public JavaScript for boot, runtime, canvas activation, D-pad, and health monitoring.
- `Build/space-station-reborn/Build/reborn-shared.loader.js`: 26,982 bytes.
- `Build/space-station-reborn/Build/reborn-shared.framework.js`: 520,501 bytes.
- `Build/space-station-reborn/Build/reborn-shared.local-v4.wasm`: 60,253,705 bytes. Valid Wasm binary; no custom/debug sections; 518 exports, none with readable coin/lane/player/obstacle/input names.

Neither loader nor framework advertises a source map. The framework is Unity/Emscripten glue, not the original C# game source. Downloading these artifacts does not recover the original project, source files, types, assets, or build tooling. We did not recover a complete source tree or decompile the whole binary. No authentication/session gate was bypassed. Third-party game code and binaries remain outside this repository.

## Findings used by the extension

- The main canvas is `#unity-canvas` with `tabindex="0"`. The extension can focus it and measure its viewport rectangle rather than assuming the whole tab is the game.
- Ashuni's published D-pad dispatches W/A/S/D. Its main site's default settings are `keyUp=W`, `keyDown=S`, `keyLeft=A`, `keyRight=D`. Version 0.1 sent arrow keys regardless of site settings.
- The JavaScript boot script publishes `window.ashuniRebornStatus`. Runtime events update `ready`, `phase`, and `paused`. `reborn:runStarted`, `reborn:runResumed`, and `reborn:resume` identify running state; pause/death/end events set the paused flag.
- Native touch activation explicitly checks `document.hasFocus()`, visibility, running state, and pause state. Opening an extension popup can legitimately take game focus away; an always-open popup is unsuitable for controlling this game.
- A same-tick key down/up can be missed by a frame-polled game engine. The extension now holds inputs for 80 ms; a local Chromium animation-frame test validates the mechanism, not the game's full response.

The inspected public JavaScript does **not** expose a documented nearby-coin/obstacle or current-lane interface. The extension still uses visual heuristics and an estimated lane; it does not claim an exact-state solver. An unrelated online Subway Surfers clone would not establish the behavior or layout of this compiled build.

## Legacy San Francisco adapter, version 0.3

The user changed the requested target to `/legacy/sanfrancisco/` and supplied an explicit proof bundle. Its public manifest and selected native player match the San Francisco 1.94.0 layout, with the deployed hash recorded in `legacy-profile.js`. Live class and position reads were verified on that page.

The extension observes per-coin updates via the original `Module.dynCall_vifffii` wrapper, preserving the game call and restoring the wrapper on Stop. Unity's own transform/collider getters supply positions and bounds; native physics raycasts sample the road. Signature regions and the boxed RaycastHit adjustor thunk are handled explicitly. Trigger zones for scoring missions are filtered out.

Precision steering sets the horizontal movement target consumed by `Character.MoveForward`; ordinary native Jump/Roll methods handle vertical maneuvers. Pickup and collision logic remains enabled. All profile-specific field offsets and function pointers are confined to `legacy-profile.js` where practical. See `VALIDATION.md` for successes, failed runs and the installed-extension test limitation.
