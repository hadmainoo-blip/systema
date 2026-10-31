# No Coin Pilot 0.6.1

A built-in no-coin autopilot for **https://ashuni.lol/legacy/sanfrancisco/** in desktop Chrome/Edge, original mode.

The default controller reads the verified game's live state and plans normal lane changes, jumps and rolls. **No video, external account, model training, or Python server is required to use it.** It pauses when it cannot resolve immediate danger; it does not guarantee an endless run.

## Install and play

1. Extract `no-coin-pilot.zip` to a permanent folder.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**, and select the extracted **extension** folder containing `manifest.json`. If replacing an older copy, replace its files and click **Reload**. Verify **0.6.1**.
3. Open **https://ashuni.lol/legacy/sanfrancisco/** and wait for **Tap to Play**. Use original mode.
4. Start a run, then press **Alt+Shift+P**. The built-in autopilot is the default. The on-screen panel reports movement, run coins and stop reasons.
5. **Esc / Alt+Shift+X** stops and pauses control. **Alt+Shift+O** observes without moving or pausing for you. Assign shortcuts at `chrome://extensions/shortcuts` if the browser/OS has reserved them.

The controller pauses on coin collection, unresolved immediate danger, loss of focus, or disconnection. Resume/take over manually after a safety pause, then press **Alt+Shift+P** to rearm. Opening the extension popup can remove game focus and pause controlled play.

Only the exact supported legacy build is accepted by the native reader. Unsupported maps/builds produce an error; the extension will not silently apply offsets to a different game.

## Optional learning

Recording, video annotation, local MobileNet feature extraction and control-head training remain available under **Optional: learn from demonstrations**. They are not required for the built-in autopilot. Untrained saved settings now fall back to the built-in controller. Recording labels use both trusted game keys and observed native movement; Stop/start/training races have been fixed.

[Optional recording and video guide](LEARNING.md) · [Model and licenses](extension/models/README.md) · [Validation and limitations](VALIDATION.md).

## Development

Node 22+: `npm test`. The packaged runtime/model assets are checked in. To rebuild runtime assets: `npm ci --ignore-scripts && npm run build`. `python scripts/package.py` rebuilds the repository ZIP, excluding dependencies and scratch data.

Playwright + Chromium checks: `tests/browser_check.py`, `tests/popup_browser_check.py`, `tests/worker_browser_check.py`, `tests/recorder_browser_check.py`, `tests/learning_browser_check.py`, and `tests/video_browser_check.py` (also needs ffmpeg). These exercise real browser components; see validation for installed-extension and gameplay evidence.

**Upgrading from 0.6.0:** reload the extension and refresh the game tab before starting a new run. This removes the old in-page steering loop and resets any off-center position. The built-in controller ignores old precision-steering preferences.
