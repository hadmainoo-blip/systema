# No Coin Pilot 0.2

Experimental Chrome/Edge desktop assistant for Subway Surfers on Ashuni. Captures the game locally and chooses left/right movement from color evidence. No currency, saves, game files, or leaderboard modifications. No dependencies or build step.

## Update / install

1. Download and extract `no-coin-pilot.zip` from this repository. On `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode and **Load unpacked** → select the extracted `extension` folder.
2. If already installed, replace the extracted files and click **Reload** on the extension card. Reloading is necessary to activate the new worker and shortcuts. Check that the extension version is **0.2.0**.
3. Check `chrome://extensions/shortcuts` to ensure the shortcuts are assigned and have no conflicts. Mac users may need to assign their preferred combinations here.

## Start without pausing the game

Opening a browser extension popup takes focus away from Unity and may pause the game. Use the popup for settings, then close it, return to the game, resume your run, and use the shortcuts:

- **Alt+Shift+P**: start autopilot; press again to stop. Uses saved settings; assumes the selected starting lane (middle by default).
- **Alt+Shift+O**: start observation mode, with no movement.
- **Alt+Shift+X**: emergency stop.

The icon badge shows **ON** for autopilot or **OBS** for observation. The popup's Start button also closes the popup after capture starts; if the game has paused, resume it yourself. The bot waits when the site's public Unity status reports a pause, menu, death, loading, or lost focus. It does not dismiss game menus automatically.

## Settings

Open the popup, select your actual starting lane, and click **SAVE SETTINGS**. Close the popup before playing. Do not change lanes manually while autopilot is running: its lane estimate assumes each dispatched input succeeds. After restarting, resurrecting, resizing, or automatic lane changes, stop and synchronize the starting lane again.

- **Auto-detect game canvas**: crops capture to `#unity-canvas` automatically. Turn off to supply a manual crop.
- **Keys**: Ashuni mode reads the site's `keyLeft` / `keyRight` local settings, defaulting to A/D, matching its published mobile D-pad. Arrow-key mode is available for comparison.
- **Observe only**: applies to the popup Start button. The observation shortcut always observes; the autopilot shortcut always enables movement.
- **Road calibration**: align horizon, feet, center and spread with the actual road. Auto-cropping does not calibrate road perspective. The preview shows lane guides on the crop.
- `coinWeight`, `obstacleWeight`, `lookahead`: tune color evidence scoring. `cooldown` sets the minimum interval between movements.

Inputs are held for 80 ms so Unity can sample them over animation frames. Switching tabs, navigating, closing the game, or canceling Chrome's debugging banner stops the assistant. Opening DevTools may detach its debugger.

## What has and has not been verified

- 20 Node tests cover synthetic perception and mocked controller integration, including shortcuts, observation mode, pause/resume, key press duration, canvas cropping, capture failure diagnostics, and cooldown.
- A Chromium fixture test checks the real DOM focus/crop/key-setting probe and CDP input recognition across animation frames. Run `python3 tests/browser_check.py` with Playwright and Chromium installed.
- The target page and its public scripts were retrieved and inspected. See `SOURCE-ANALYSIS.md`.
- The cloud browser's administrator policy blocks loading unpacked extensions. Full extension capture, shortcut delivery, and successful gameplay on Ashuni are **not verified**.

This remains a color-heuristic prototype, not a reliable zero-coin solver. Golden scenery can look like coins; shadows, skins, magnets, gray trains, occlusion, and scenery can fool it. It does not implement jumping, rolling, or game-over recovery. Never treat a successful test fixture as proof of a successful live run. Captured frames remain local; there are no uploads or analytics.

Run `npm test` with Node 20+ for the logic/controller suite.
