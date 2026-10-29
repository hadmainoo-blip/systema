# No Coin Pilot 0.3

Desktop Chrome/Edge assistant for **https://ashuni.lol/legacy/sanfrancisco/**, original mode. This version reads live game state from the matching Unity 1.94.0 build: coin collider positions, player position and lane, movement speed, the run's coin counter, and obstacle bounds from native physics queries. It searches future motion and steers, jumps, or rolls automatically.

Precision mode writes the player's lateral movement target consumed by the game's movement routine. It permits positions between the standard lane centers, which can leave safe clearance between coins and trains. This is more than simulated arrow keys. Collisions, coin collection, saves, currency, speed and forward motion stay under the game's existing logic; the extension does not grant invincibility or remove coins.

## Install or update

1. Download the latest `no-coin-pilot.zip` from this repository and extract it.
2. Open `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode, then **Load unpacked** → select the extracted `extension` directory. For an existing installation, replace the files and press **Reload** on its card. Verify version **0.3.0**.
3. Open **https://ashuni.lol/legacy/sanfrancisco/** and wait until the game loads. The modern `/sanfrancisco/` and `/journey-to-the-east/` builds use different layouts and are not supported by this native adapter.
4. In the extension settings, leave **Native game state**, **Precision steering**, **Pause if a coin is collected**, and **Auto-brake** enabled. Save, close the popup, and return focus to the game.
5. Press **Alt+Shift+P**, then start/resume the run in the game. The bot can be armed on the menu. It waits for actual gameplay and focus.

Opening the popup can pause Unity. Keep it closed during play; the in-game HUD shows status without taking focus. Native mode requires no screen sharing, road calibration, starting-lane estimate or tab-capture permission prompt. The extension still declares capture permissions for its optional visual fallback.

## Controls and settings

- **Alt+Shift+P**: start/stop autopilot.
- **Alt+Shift+O**: observe actual state without steering or pausing the game.
- **Alt+Shift+X** or **Esc**: stop. Esc also reaches the game's own pause handler.
- Configure shortcut conflicts at `chrome://extensions/shortcuts`.
- **Auto-brake**: pause and stop the assistant when unresolved predicted risk becomes imminent. Take over manually, then re-arm it. Disabling this makes the bot attempt the remaining route and can result in death or coin collection.
- **Pause if a coin is collected**: use the actual run counter to pause a failed challenge. A collected coin remains collected; nothing is refunded or hidden.
- **Precision steering**: use continuous lateral targets between lane centers. Disable to use ordinary native lane-change commands.
- **In-game status overlay**: shows the actual run coin counter, number of observed coins and obstacles, and status. The popup also displays a top-down map: yellow coins, red collider bounds, green player.
- **Visual fallback**: retains the earlier color-based prototype for comparison. Its limitations remain; native mode is recommended for this specific target.

The assistant stops on navigation, tab switch, extension Stop, or errors. If its debugger connection disappears, a page-side watchdog stops movement within 3.5 seconds. Esc stops immediately. Stop restores the original coin-update wrapper. Avoid manual movement while autopilot is active.

## Validation and limits

See `VALIDATION.md` for the recorded live tests and `SOURCE-ANALYSIS.md` for build analysis. Live gameplay confirmed native positions, movement, jump/roll calls, zero-coin segments, and automatic pause. A no-brake test ended in death after reaching world Z 2,100 with zero coins. The default production configuration paused earlier when no safe path was predicted. There is no guaranteed perfect or indefinite run.

The planner uses bounded look-ahead and axis-aligned collider bounds. Moving objects, ramps, rapid frame changes, irregular geometry, pickups, and narrow clearances can still defeat its predictions. Its nine forward-looking ray probes do not enumerate every collider in the entire scene. It does not automatically restart, revive, spend keys, or submit scores. A changed player binary is rejected until its layout is verified.

Captured game state stays in this tab/browser. There are no uploads or analytics. The supplied third-party game binaries and reconstructed game source are not redistributed with this extension.

## Development checks

Run `npm test` with Node 20+ (31 tests). `python3 tests/browser_check.py` checks DOM/keyboard behavior against a local fixture with Playwright and Chromium. `tests/live_native_check.py` optionally loads the real selected game and tests the same packaged native startup code; it needs Playwright, Chromium and network access, and starts a local test run. It does not install the browser extension.

This cloud Chromium's administrator policy blocks unpacked extensions. Native startup was tested by executing the packaged functions through the browser automation connection. Full installed-extension shortcut/permission behavior remains a user-browser check.
