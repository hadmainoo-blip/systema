# No Coin Pilot — reliability work in progress

**The requested 30-minute, zero-coin target is not met.** The current source candidate passes 122 automated checks, but its latest real-game test collected a coin after 5.33 seconds. These changes remain unreleased; see [the evidence and reproduction commands](subway-no-coin/VALIDATION.md). The ZIP below remains the earlier experimental 0.6.2 build.

[Previous experimental 0.6.2 ZIP](https://raw.githubusercontent.com/hadmainoo-blip/systema/6e5a790745ff579de3a6615230dcee0d532d8620/no-coin-pilot.zip)

For **https://ashuni.lol/legacy/sanfrancisco/**, original mode, desktop Chrome/Edge.

1. Extract the ZIP, open `chrome://extensions`, enable Developer mode and **Load unpacked** → the extracted **extension** folder. Reload existing installations after replacing their files. Verify **0.6.2**.
2. Open the target game, wait for **Tap to Play**, start a run, then press **Alt+Shift+P**.
3. **Esc / Alt+Shift+X** stops and pauses. **Alt+Shift+O** observes without moving.

The default built-in controller uses the verified game state and normal lane changes, jumps and rolls. No video upload, account, training, or model download is required. Predictive pausing is off by default, including when upgrading older settings. The bot attempts normal moves and still stops on actual coin collection by default. It is an experimental autopilot, not an endless-survival guarantee.

This update fixes untrained-model startup defaults, initialization timing, impossible combined moves, recording labels, Stop/start races, and duplicate training jobs. Optional local learning and video annotation remain available.

[Installation and usage](subway-no-coin/README.md) · [Optional learning](subway-no-coin/LEARNING.md) · [Validation](subway-no-coin/VALIDATION.md)

**Upgrading from 0.6.0:** reload the extension and refresh the game tab before starting a new run. This removes the old in-page steering loop and resets any off-center position. The built-in controller ignores old precision-steering preferences.

Version 0.6.2 also tracks lane changes already in progress and adjusts jump clearance to observed engine frame timing. These fixes remove frequent forecast-based interruptions, but do not establish reliable long-run no-coin play.
