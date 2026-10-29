# No Coin Pilot 0.4 — learn from your own play

[Download the extension ZIP](https://github.com/hadmainoo-blip/systema/raw/refs/heads/main/no-coin-pilot.zip)

Target: **https://ashuni.lol/legacy/sanfrancisco/** on desktop Chrome/Edge.

This version uses an existing Apache-2.0 MobileNetV3-Small vision backbone and a small local trainable control head. It sees captured game frames plus native game-state features. It learns a scene-to-action mapping; it does not replay a timed route. No trained Subway Surfers policy is included yet.

1. Extract the ZIP, then **Load unpacked** → `extension` at `chrome://extensions`, or reload your existing extension after replacing its files. Verify **0.4.0**.
2. Close the popup, press **Alt+Shift+R**, and play manually. Record several separate varied runs, then stop/save with the same shortcut.
3. Open the popup and choose **TRAIN CONTROL MODEL**.
4. Select **Learned from my play**. Test with **Observe only** first, then enable control.
5. **Alt+Shift+P** starts/stops play; **Alt+Shift+O** previews predictions; **Esc / Alt+Shift+X** stops.

The new learned controller uses normal lane changes, jumps and rolls. Precision steering between lanes is disabled. Data and training stay local; the bundled encoder needs no model download or API key. Performance and game success still need testing on your laptop and demonstrations.

[Recording/training guide](subway-no-coin/LEARNING.md) · [Pretrained model and license](subway-no-coin/extension/models/README.md) · [Validation history](subway-no-coin/VALIDATION.md)
