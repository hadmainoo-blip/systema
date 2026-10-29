# No Coin Pilot 0.4

A local visual-learning prototype for **https://ashuni.lol/legacy/sanfrancisco/**.

This update replaces the between-lane default with ordinary lane changes, jumping and rolling. It adds a pretrained MobileNet vision encoder and a small control head that you train from your own keyboard play. It does not ship a trained game policy.

1. Install/reload 0.4.0 from the repository ZIP.
2. Close the popup and press **Alt+Shift+R** to record yourself playing. Record several separate varied runs.
3. Stop recording, open the popup, and **TRAIN CONTROL MODEL**.
4. Select **Learned from my play** and test with **Observe only** before enabling control.
5. **Esc / Alt+Shift+X** stops. **Alt+Shift+P** toggles play; **Alt+Shift+O** previews learned predictions.

[Full recording/training instructions and limits](LEARNING.md) · [Pretrained model and license](extension/models/README.md) · [Earlier native controller validation](VALIDATION.md).

The encoder runs locally on CPU. The model sees captured game frames and a compact native-state summary. Its learned mapping responds to the current scene; it does not replay a recorded route. Training quality and gameplay performance still need evaluation on your demonstrations. Recording is passive, and captured features stay local.

Developers: Node 22+, `npm ci --ignore-scripts`, `npm run build`, `npm test`. Browser checks require Playwright and Chromium: `tests/vision_browser_check.py`, `tests/learning_browser_check.py`, and `tests/browser_check.py`. The cloud browser blocks installed-extension loading; these checks do not establish end-to-end capture or shortcut readiness.
