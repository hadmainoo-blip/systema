# No Coin Pilot

An experimental Chrome/Edge desktop extension that captures the current tab locally, scores three road lanes for gold coin and colored obstacle evidence, and sends left/right arrow inputs through Chrome's debugger API. It does not modify currency, saves, game files, or leaderboards. No dependencies or build step.

## Install and use

1. Open `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode, choose **Load unpacked**, and select the `extension` folder.
2. Open the game, start a practice run, and click inside it so keyboard controls have focus. Pin the extension and open its popup.
3. Start in **Observe only** mode. Set the starting lane to match the player. Under Road calibration, crop out the page margins using left/top/right/bottom fractions of the whole tab. Align horizon, feet, center, and spread until the preview's three colored lines follow the three road lanes. Popup previews show this captured crop and lane guides.
4. Stop, restart the game, select the actual starting lane, disable Observe only, and press Start. Keep the game tab visible. Reopen the popup to stop, or click **Cancel debugging** in Chrome's debugging banner immediately.
5. Manual movement, resurrection, auto lane changes, resize, or camera changes require stopping and setting the lane/calibration again. Recalibrate after resizing. DevTools conflicts with the debugger attachment.

## Controls

- `coinWeight`: cost for visible gold pixels. Higher values prioritize avoiding coins.
- `obstacleWeight`: cost for red/blue train and barrier pixels.
- `lookahead`: minimum depth to score; lower sees farther but includes more distant scenery.
- `cooldown`: minimum milliseconds between lane inputs (120–1500).
- Crop and perspective parameters persist locally between sessions.

## Limits and validation

This is a color-heuristic prototype, not a verified ashuni.lol bot. It cannot guarantee zero coins or survival. Golden scenery may look like coins; shadows, skins, magnets, occlusion, gray trains, menus, and scenery can fool it. It does not understand jumps, rolls, power-ups, game-over screens, or score counters; it will not automatically restart. The lane estimate assumes each input succeeds. Use practice runs, start in observation mode, and stop on menus. The capture is local, with no uploads or analytics. Debugger permission allows trusted keyboard input into the selected tab; it is detached on stop/navigation/tab closure.

The target website was blocked by the cloud environment's network policy, so no live-site results are claimed. The automated tests exercise synthetic video perception, lane selection, crossing restrictions, darkness handling, and configuration bounds. All 10 passed. A headless Chromium integration check could not load the extension's service worker; actual extension capture and input remain unverified. Run `npm test` from this directory (Node 20+).
