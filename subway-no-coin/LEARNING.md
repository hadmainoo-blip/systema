# Local visual learning, version 0.4

This prototype uses a small existing open-source vision backbone and learns a new control policy from your own manual runs. It chooses an action for the current scene; it does not replay your keys on a timer or memorize a route as a macro.

It uses **supervised demonstration learning**, with clean-run filtering. It does not implement autonomous reinforcement learning or promise to exceed your skill. Demonstrations teach an initial policy; improvement must be measured on new runs.

## Laptop fit

The user's laptop has an i5-8265U, Intel UHD 620 and 16 GB RAM. A 5–6B vision-language model might fit in quantized form but would compete with the game for memory and CPU time and is unsuitable as the intended fast control loop. Version 0.4 instead packages the Apache-2.0 MobileNetV3-Small pretrained backbone, derived from a 2.5M-parameter model, and a tiny 24-hidden-unit control head. It runs with single-thread CPU WebAssembly and requires no CUDA, separate Python server, GPU model setup, or API key.

The original quantized model is ~2.7 MB; the pruned feature backbone is ~1.1 MB. The generic ONNX runtime contributes ~11 MB. These are download sizes, not total process RAM requirements. A warm cloud-Chromium inference was ~32 ms; the user's laptop has not been benchmarked. The UI reports actual inference time. The game can slow down if the CPU is saturated.

## Teach it

1. Install/reload extension **0.4.0**, then open `https://ashuni.lol/legacy/sanfrancisco/` in original mode. Old precision steering is disabled.
2. Wait for the game to finish loading. Close the extension popup and press **Alt+Shift+R** to arm recording. Start a run and play with your keyboard as usual. The extension badge says **REC**. Recording does not steer, jump, roll or pause for you.
3. Play several separate runs. Include left/right changes, jumps and rolls—not only straight travel. Two distinct runs are the minimum; 3–5 varied clean runs are a better first dataset. Stop/save with **Alt+Shift+R** or the Stop button. Shortcuts can be assigned at `chrome://extensions/shortcuts`.
4. Open the popup and check recorded frame/action counts. Select **TRAIN CONTROL MODEL**. Training stops capture and runs locally. It requires examples of all five classes in training and validation, and can be stopped with Stop.
5. Check the held-out-run results. Macro F1 measures agreement with held-out demonstrated actions, **not** no-coin survival or gameplay success. Low scores mean more varied demonstrations are needed.
6. Select **Learned from my play**, enable **Observe only**, and start. Predictions are shown without movement. Then stop, disable Observe only, and try a short learned run. **Alt+Shift+P** toggles learned play; **Alt+Shift+O** previews predictions. **Esc / Alt+Shift+X** stops.
7. The learned controller uses ordinary native lane changes, jumps and rolls. It pauses on an observed coin collection or a low-confidence prediction, rather than silently falling back to the old planner. Those pauses are expected during early experiments.

## What is recorded and learned

The extension captures only the selected game tab, crops to the game canvas, and runs the pretrained encoder on those frames. A short-lived frame buffer pairs actual trusted game-control key presses with the preceding visual observation. Text fields and unrelated keys are excluded. Touch/mouse gestures are not labelled; keyboard play is required in this version.

Each saved example contains spatial visual features, the previous-frame visual change, and a compact grid of native coin/obstacle state plus player movement state. This is a **hybrid visual-and-state policy**, not pure image-only reasoning. Native state comes from the previously verified legacy build; other game versions are rejected. A frame/action example does not contain a full video or screenshot.

The last ~900 ms of an episode that ends in coin collection or death are trimmed to reduce learning from terminal mistakes. Recording waits for a clean next run after coin collection. It does not alter the run's counter or remove the collected coin. Pausing and resuming continues the same episode. Complete episodes, rather than neighbouring frames, are separated for validation.

Only the control head is trained. Inputs are normalized using training frames only, actions are balanced during optimization, and the best validation checkpoint is retained. The encoder stays frozen. This allows useful small-dataset experiments without fine-tuning a large vision-language model on a laptop.

## Storage and privacy

Features, action labels, episode IDs/timestamps and trained head weights live in this extension's local IndexedDB. There is no upload, analytics or hosted inference. The limit is 6,000 saved examples; neutral frames are subsampled. **EXPORT TRAINING DATA** saves a local JSON containing feature vectors, labels and the learned head. **CLEAR SAVED RUNS + MODEL** deletes them after confirmation. Export is a backup; import and existing-video conversion are not implemented in this release.

## Evidence and current limits

Automated checks exercise actual packaged model inference in Chromium, spatial feature response, trusted-key capture excluding text inputs, local dataset persistence/tail trimming, training, and model reload. A synthetic image classification check passed after a feature-normalization correction. These are pipeline checks, not human-gameplay results.

**No user demonstrations have been supplied or recorded here, and no trained Subway Surfers policy is shipped.** The installed-extension capture/shortcut path is not end-to-end verified in this cloud browser because its administrator policy blocks unpacked extensions. The existing vision runtime and learning pipeline were tested through local Chromium pages. Real game performance and laptop speed remain to be evaluated on the user's recordings and browser.
