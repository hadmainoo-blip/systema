# Optional local visual learning, version 0.6

The built-in autopilot works without this learning workflow. Choose it in the popup for immediate source-based control with continuous steering. Learned-mode control uses ordinary lane changes, jumps and rolls. The workflow below is optional.

This prototype uses a small existing open-source vision backbone and learns a new control policy from your own manual runs. It chooses an action for the current scene; it does not replay your keys on a timer or memorize a route as a macro.

It uses **supervised demonstration learning**, with clean-run filtering. It does not implement autonomous reinforcement learning or promise to exceed your skill. Demonstrations teach an initial policy; improvement must be measured on new runs.

## Laptop fit

The user's laptop has an i5-8265U, Intel UHD 620 and 16 GB RAM. A 5–6B vision-language model might fit in quantized form but would compete with the game for memory and CPU time and is unsuitable as the intended fast control loop. Version 0.4 instead packages the Apache-2.0 MobileNetV3-Small pretrained backbone, derived from a 2.5M-parameter model, and a tiny 24-hidden-unit control head. It runs with single-thread CPU WebAssembly and requires no CUDA, separate Python server, GPU model setup, or API key.

The original quantized model is ~2.7 MB; the pruned feature backbone is ~1.1 MB. The generic ONNX runtime contributes ~11 MB. These are download sizes, not total process RAM requirements. A warm cloud-Chromium inference was ~32 ms; the user's laptop has not been benchmarked. The UI reports actual inference time. The game can slow down if the CPU is saturated.

## Teach it

1. Install/reload extension **0.6.0**, then open `https://ashuni.lol/legacy/sanfrancisco/` in original mode. Old precision steering is disabled.
2. Wait for the game to finish loading. Close the extension popup and press **Alt+Shift+R** to arm recording. Start a run and play with your keyboard as usual. The extension badge says **REC**. Recording does not steer, jump, roll or pause for you.
3. Play several separate runs. Include left/right changes, jumps and rolls—not only straight travel. Two distinct runs are the minimum; 3–5 varied clean runs are a better first dataset. Stop/save with **Alt+Shift+R** or the Stop button. Shortcuts can be assigned at `chrome://extensions/shortcuts`.
4. Open the popup and check recorded frame/action counts. Select **TRAIN CONTROL MODEL**. Training stops capture and runs locally. It requires examples of all five classes in training and validation, and can be stopped with Stop.
5. Check the held-out-run results. Macro F1 measures agreement with held-out demonstrated actions, **not** no-coin survival or gameplay success. Low scores mean more varied demonstrations are needed.
6. Select **Learned from my play**, enable **Observe only**, and start. Predictions are shown without movement. Then stop, disable Observe only, and try a short learned run. **Alt+Shift+P** toggles learned play; **Alt+Shift+O** previews predictions. **Esc / Alt+Shift+X** stops.
7. The learned controller uses ordinary native lane changes, jumps and rolls. It pauses on an observed coin collection or a low-confidence prediction, rather than silently falling back to the old planner. Those pauses are expected during early experiments.

## What is recorded and learned

The extension captures only the selected game tab, crops to the game canvas, and runs the pretrained encoder on those frames. A short-lived frame buffer pairs trusted game-control key presses with the preceding visual observation. Window-level capture runs before document/canvas input handlers. Native lane/jump/roll transitions provide a second label source when keys are consumed, remapped, or movement comes from gestures. Matching keyboard/state actions are deduplicated. Text fields and unrelated keys are excluded. Simultaneous incompatible actions are skipped.

The frame-matching buffer allows up to one second for slower inference and flushes against the observer timestamp, rather than the later end of encoding. Stopping also drains the final input events. Action counts stay visible during recording. This fixes the missed-action path that could leave only default “hold” labels. Existing broken labels contain no recoverable key history: export them if needed, clear them, and record fresh runs.

Each live example contains spatial visual features, the previous-frame visual change, and a compact grid of native coin/obstacle state plus player movement state. Live-only datasets train a **hybrid visual-and-state policy**. When video examples are present, all training examples have their native features masked and the saved policy uses the same visual-only inputs during live play. Native observation still supplies the live stop/focus/coin safety checks. Other game builds remain rejected. A frame/action example does not contain a full video or screenshot.

## Train from the linked video, starting at 00:23

The supplied [speedrun](https://www.speedrun.com/subsurf/runs/ywoxj7nm) is FR_bilel’s verified no-coin run. The speedrun API links to [YouTube video dkfO-fIHAuE](https://www.youtube.com/watch?v=dkfO-fIHAuE&t=23s). Its reported run end is 11,525.9 seconds. The trainer preselects **23 seconds** as requested, and excludes later footage after that run end by default.

1. Open the popup and **TRAIN FROM VIDEO**. Select a local copy of that video. The linked YouTube page is a reference, not a directly decodable video file; the extension does not download YouTube media.
2. The full original video seeks to **00:23**. Keep the default run ID `ywoxj7nm` for every clip from this run, so they cannot appear as independent validation runs. If using an already-trimmed copy, account for the changed timestamps and preserve the run ID.
3. Set the crop edges to the actual game canvas. Check the preview; browser borders and letterboxing should be outside it. The same top 12% HUD crop is used for live frames and video frames.
4. Pause at the beginning of an observed lane change/jump/roll and mark its action. Mark **hold** explicitly at deliberate straight-travel moments. Seek and 0.1-second steps help with timing. Gather varied examples of all five actions. Unlabelled footage is never inferred to be hold. Labels are manual annotations, not claimed ground-truth key telemetry.
5. **SAVE LABELLED FRAMES** extracts pretrained features from the frame 125 ms before each annotation and a previous visual frame. Import is cancellable and commits only a complete batch. Re-importing the same source/timestamps replaces samples instead of duplicating them. Labels remain as a draft between visits; reselect the local file after reopening.
6. Combine with at least one independent recorded/video run, then **TRAIN CONTROL MODEL**. The original whole-run validation requirements still apply. A single three-hour video is still only one independent run; clips from it do not establish held-out-run performance.

This environment could read the speedrun metadata, but its proxy refused YouTube access (HTTP 403). **The actual reference video has not been downloaded, annotated, or trained here, and no trained game policy is bundled.** The real video import pipeline was checked with generated test footage, including seeking to 00:23, actual ONNX feature extraction, all five explicit labels, deduplication and replacement.

### Small frame export when a video upload is impractical

`scripts/sample-youtube-frames.js` can be copied into the browser's developer console on the reference video's YouTube page. Wait for the video to load and any ad to finish first. It pauses playback, seeks through **00:23–02:23** at eight frames per second, and saves `no-coin-frames.json`. It keeps the original aspect ratio, limits width to 640 pixels and caps the export at roughly 24 MB. A Stop button saves the frames collected so far. The original playback position is restored when finished.

This needs no third-party account or remote scripts and makes no automatic uploads. Only the sampled frames and their timestamps are saved. The JSON is a transport file for analysis and labelling, not an already-labelled training dataset; unlabelled images must not be treated as hold examples. Attach the export in the chat so the assistant can inspect and label it. This prepares an initial sample, not the entire three-hour training dataset.

The helper was tested with actual browser MediaSource/blob video, including seeks, changing JPEG frames, downloads, size limits and cleanup. It has not been verified on the actual YouTube video; browser/player restrictions may reject frame access with an explicit error.

The last ~900 ms of an episode that ends in coin collection or death are trimmed to reduce learning from terminal mistakes. Recording waits for a clean next run after coin collection. It does not alter the run's counter or remove the collected coin. Pausing and resuming continues the same episode. Complete episodes, rather than neighbouring frames, are separated for validation.

Only the control head is trained. Inputs are normalized using training frames only, actions are balanced during optimization, and the best validation checkpoint is retained. The encoder stays frozen. This allows useful small-dataset experiments without fine-tuning a large vision-language model on a laptop.

## Storage and privacy

Features, action labels, episode IDs/timestamps, video annotation provenance and trained head weights live in this extension's local IndexedDB. There is no upload, analytics or hosted inference. Video files stay on your device; only labelled features and metadata are saved. The limit is 6,000 saved examples; live neutral frames are subsampled. **EXPORT TRAINING DATA** saves a local JSON containing feature vectors, labels and the learned head. **CLEAR SAVED RUNS + MODEL** deletes them after confirmation. Training-data JSON import is not implemented; local-video conversion is available in the video trainer.

## Evidence and current limits

Automated checks exercise actual packaged model inference in Chromium, spatial feature response, trusted-key capture excluding text inputs, local dataset persistence/tail trimming, training, and model reload. A synthetic image classification check passed after a feature-normalization correction. These are pipeline checks, not human-gameplay results.

**No real gameplay demonstrations have been processed here, and no trained Subway Surfers policy is shipped.** The installed-extension capture/shortcut path is not end-to-end verified in this cloud browser because its administrator policy blocks unpacked extensions. The vision, recorder, video-import and learning pipelines were tested through local Chromium pages. Real game performance and laptop speed remain to be evaluated on the user's recordings and browser.
