# No Coin Pilot 0.6.1 — ready without training

[Download the extension ZIP](https://github.com/hadmainoo-blip/systema/raw/refs/heads/codex/no-coin-pilot-0.6/no-coin-pilot.zip)

For **https://ashuni.lol/legacy/sanfrancisco/**, original mode, desktop Chrome/Edge.

1. Extract the ZIP, open `chrome://extensions`, enable Developer mode and **Load unpacked** → the extracted **extension** folder. Reload existing installations after replacing their files. Verify **0.6.1**.
2. Open the target game, wait for **Tap to Play**, start a run, then press **Alt+Shift+P**.
3. **Esc / Alt+Shift+X** stops and pauses. **Alt+Shift+O** observes without moving.

The default built-in controller uses the verified game state and normal lane changes, jumps and rolls. No video upload, account, training, or model download is required. It pauses on coin collection or unresolved immediate danger and reports the reason. It is an experimental autopilot, not an endless-survival guarantee.

This update fixes untrained-model startup defaults, initialization timing, impossible combined moves, recording labels, Stop/start races, and duplicate training jobs. Optional local learning and video annotation remain available.

[Installation and usage](subway-no-coin/README.md) · [Optional learning](subway-no-coin/LEARNING.md) · [Validation](subway-no-coin/VALIDATION.md)

**Upgrading from 0.6.0:** reload the extension and refresh the game tab before starting a new run. This removes the old in-page steering loop and resets any off-center position. The built-in controller ignores old precision-steering preferences.
