# Validation — unreleased reliability candidate (2026-11-01)

**The 30-minute zero-coin requirement is not met. No new release ZIP has been produced.** The retained ZIP is still experimental 0.6.2. The results below describe the current source, rather than that ZIP.

Changes:

- Query both ends of the obstacle interval so a long train containing one ray origin remains visible. Keep road-height probes during jumps and update obstacles within 60 ms.
- Carry the actual collider classes into planning and sweep the rounded capsule against spheres/boxes. Model the observed rolled sphere rather than a smaller fictional collider. Train collisions end a predicted trajectory; a limited fallback preserves physical survival when the search cannot find a zero-coin route.
- Preserve more distinct lane, airborne and cooldown states across a 3-second search. Track the verified native lane target. Normal lateral speed is approximated from observed movement as forward speed / 1.5; this remains an approximation, not an exact motor model.
- Read the current `JumpHeight` field (offset 72), rather than the normal-height configuration (108). Reject another ground jump when the character is airborne despite a stale flag. Remove the artificial global 180 ms delay between different command types; keep native movement guards and a 60 ms repeat bound for the same type.
- Replan near scheduled commands and throttle HUD writes. Record source hashes, actual forward-gameplay time and native coin counters. Save portable JSON for infinite collision deadlines. A separate verification gate rejects short, paused, dead, stale-source or coin-collecting trials.

**122 Node tests passed.** These include independent collision-clearance witnesses, executable switchbacks, unavoidable-coin survival fallback, current-height reads, sensor refresh and jump/lane timing. They verify components and constructed cases, not sustained gameplay. Worker, popup and recorder browser checks also passed. The real recorder retained all five labels (hold 9, left 2, right 1, jump 1, roll 1); pause/resume, native-only actions, key deduplication and cancellation/restart checks passed.

Current-source live results, with ordinary lane commands, predictive braking off and stop-on-coin enabled:

| Rendering | Wall time | Forward gameplay time | Final Z | Coins | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Normal software rendering | 5.33 s | 4.25 s | 475.72 | 1 | Failed: coin collected |
| Render submissions suppressed for diagnosis | 2.04 s | 0.80 s | 88.89 | 1 | Failed: coin collected |

Both runs kept the native game physics, counters and collision handlers active. Normal rendering observed roughly 12 engine FPS; the diagnostic run observed roughly 40 FPS. Layouts differed, so this is not a paired performance comparison. The normal run's planner averaged 38 ms and reached 147 ms, which is a remaining main-thread performance concern. Neither trial validates long-run control. Installed-extension end-to-end testing remains blocked by administrator policy; these tests execute the actual source functions in the real supported game through Playwright.

Machine-readable reports retain trace rows, source hashes, accepted actions, final native state and final prediction: [normal rendering](validation/2026-11-01-normal.json), [render-suppressed diagnosis](validation/2026-11-01-render-diagnostic.json). Older intermediate candidates are not counted as successful gameplay evidence. The linked YouTube run was not downloaded or used for training.

Reproduce from `subway-no-coin/`:

```sh
npm test
python tests/live_native_check.py --seconds 1800 --telemetry compact --width 240 --height 400 --output ../work/live-30min.json
node scripts/verify-gameplay.mjs ../work/live-30min.json
```

The live check exits early with failure on death/coin collection. The separate gate requires at least 1,800 seconds of both wall time and forward gameplay, matching source hashes, continuous active traces and zero native coins. Component tests of the gate use synthetic reports and cannot establish gameplay success.

---

# Validation — release 0.6.2 (2026-10-31)

Predictive pausing is now **opt-in and off by default**. Older default-on settings migrate off once; a deliberate new checkbox choice is preserved. The pilot attempts its chosen command before considering opt-in emergency braking, which is restricted to immediately approaching danger. Manual stop, death, collected-coin stop, focus-loss and sensor/disconnect handling remain active. Between-lane steering stays disabled.

Two planning defects were corrected: accepted lane-change targets are retained while the native lane/world cache is stale, and jump simulation accounts for semi-implicit engine gravity using a motion-derived frame-step estimate. The search preserves different initial actions, ranks collision-free time before aggregate collision weights, and looks farther ahead for ordinary commands. These are bounded model predictions, not guaranteed optimal routes.

- **94 Node tests passed**, including default-off/upgrade braking behavior, executable escape commands, pending lane targets, and low-frame-rate jump clearance. Worker and popup browser checks passed.
- A previous no-brake baseline collected a coin at Z161.64 after approximately two seconds. New ordinary-mode trials made multiple movement attempts: one reached Z611.33 before collecting a coin; another reached Z603.82 with zero coins but died; a further trial collected a coin at Z164.99. Different layouts were generated, so these are not paired performance comparisons. **All three new live trials failed a sustained no-coin objective.** They did not stop due to speculative path risk.
- These failures are retained as failures. Removing frequent forecast pauses does not demonstrate reliable dodging or long-duration survival. The cloud game rendered at about 9 engine FPS; actual user-machine performance remains unmeasured. Installed-extension end-to-end testing is still blocked by the cloud administrator policy.

Reproduce ordinary default behavior with `python tests/live_native_check.py --seconds 45 --width 240 --height 400 --output ../work/live-result.json`. Use `--auto-brake` only to exercise optional emergency braking. The test exits with failure for coin collection/death even though the controller now continues attempting moves through forecast uncertainty.

---

# Validation — current release 0.6.1 (2026-10-31)

Version 0.6.1 changes the built-in controller to ordinary left/right lane changes, jumping and rolling. It always injects `precision:false`, ignores old precision preferences, migrates saved settings to false, and never calls the direct steering motor. A settled off-lane position left over from version 0.6.0 causes an explicit fresh-run/reset pause; normal lane transitions have a settling grace period. Reload the extension and refresh the game tab when upgrading.

**88 Node tests passed**, including regressions for stale precision settings, adjacent/centered planner targets, no direct steering even with an off-center planner target, and the off-lane upgrade guard. Worker and popup browser checks passed. The earlier ordinary-mode live comparison using the same lane planner reached Z497.14, with zero coins/errors, then paused alive after roughly five seconds. This release has no new long-run survival evidence; difficult patterns can trigger early safety pauses.

The continuous-steering results below describe version 0.6.0 and are historical, not the default behavior of 0.6.1. Installed-extension end-to-end testing remains blocked by the cloud browser's administrator policy.

---

# Validation — current release 0.6.0 (2026-10-31)

## Version 0.6 — ready built-in control

The default is now the source-based continuous-steering controller, with native jumping and rolling. It does not require demonstrations, video access or a trained control head. Learned mode remains optional and uses ordinary commands. Untrained saved settings migrate to the built-in controller; a trained learned preference is preserved.

Fixes cover Unity initialization (exports appear before `Module.calledRun`), arming at the menu without keeping the popup open, exact target validation, cancellation during startup/cleanup, shortcut toggling, recording restart races, duplicated training requests, and one-use keyboard/native label matching. The planner models moving trains, observation age, continuous collision timing, the rolled collider, full search horizon, jump-path diversity and early steering commitment. All controlled stops pause; observation never moves or pauses.

### Current verification

- **84 Node tests passed** (`npm test`).
- Popup, service-worker routing, keyboard/crop, and recorder browser checks passed. The worker test uses real IndexedDB and mocked Chrome/CDP results; it is not installed-extension coverage. Recorder checks use real MediaStream/ONNX/IndexedDB, retained all five action labels, and verified cancellation/restart during outstanding capture/inference.
- The final source functions were tested on the real supported game in original mode, with `precision:true`, auto-brake and stop-on-coin enabled. At a 240×400 software-rendered viewport the run reached **Z 1,212.83**, accepted **three jumps and one roll** plus continuous steering, collected **zero coins**, reported **zero reader errors**, and then **paused alive after approximately 11 gameplay seconds** because no safe path was predicted. The test requested a 60-second window but ended early at that safety pause; this is **not** a 60-second survival result.
- An earlier 360×640 continuous-steering candidate reached Z 1,325.23 with zero coins before a safety pause. Ordinary lane-only trials paused earlier; continuous steering was selected for the default. A deliberate no-auto-brake stress trial collected a coin and stopped; that is a failed no-coin trial, not counted as success.
- Software WebGL in this environment ran at roughly 3–10 engine frames per second depending on viewport. Real laptop performance is unmeasured. The source is a functioning experimental controller with conservative pauses, not a verified long-duration/no-coin speedrun policy.
- Administrator policy blocks unpacked-extension installation and video capture in this cloud Chromium. Those policies were not changed or bypassed. Installed-extension permissions/shortcut/capture delivery cannot be claimed as end-to-end verified here; component tests exercise the real packaged modules through a browser bridge.

Reproduce a bounded live default-controller trial with `python tests/live_native_check.py --precision --seconds 60 --width 240 --height 400 --output ../work/live-result.json`. The harness reports safety pauses, death, coin collection, sensor failures and survival separately. Game-generated layouts vary. Game counters and collision handlers remain active.

The actual linked YouTube run has **not** been downloaded or used to train a policy. It is no longer required to use the default controller.

---

# Validation — 2026-10-29

## Version 0.5 — 2026-10-30

- All 53 Node checks passed, including delayed action matching, native-feature masking for mixed video/live training, video-plan validation, whole-source episode grouping, and final event draining on recording stop.
- `tests/recorder_browser_check.py` used the real encoder and a generated MediaStream: 14 saved samples, with hold 9, left 2, right 1, jump 1, roll 1. Recording remained passive and pause/resume preserved the same episode. Native lane/jump/roll transitions produced labels without keyboard events; document handlers consuming keys did not prevent capture.
- `tests/video_browser_check.py` generated a 26-second WebM with ffmpeg, loaded the actual trainer, sought to 00:23, and imported five manually marked examples through the real ONNX encoder into IndexedDB. Empty/unlabelled import was rejected; repeat imports did not duplicate frames, cancellation did not change saved labels, and an edited label replaced the original at the same source/time. Native features in video samples were zero.
- Popup smoke checks passed. The existing local learning browser check passed actual ONNX extraction, storage, training, reload, text-input exclusion, and synthetic held-out image classification (macro F1 ~0.818). That metric measures the synthetic fixture only.
- `tests/sampler_browser_check.py` verified the browser-console frame sampler on real blob-backed MediaSource video: 16 distinct-timed JPEG frames from 23 to 24.875 seconds, a valid JSON download, enforced file-size cap, and cleanup. This does not verify YouTube's player/security behaviour or establish access to the actual reference video.
- The speedrun API identified the supplied run's YouTube source as `dkfO-fIHAuE`, and its reported run end as 11,525.9 seconds. Requested video training start: 23 seconds. The environment proxy refused YouTube download with HTTP 403. No actual frames from the linked run were downloaded, annotated, used for training, or bundled.

These are component/browser-pipeline checks. Installed-extension capture permissions, shortcut delivery, actual-video action labels, and real gameplay performance remain unverified for this update.

## Selected target and compatibility

Target: `https://ashuni.lol/legacy/sanfrancisco/`, original mode.

The public legacy manifest identifies Unity 2019.4.18f1, Subway Surfers 1.94.0. Its native-options loader selects `player-7b4bf9ca5568e64f1790d6018cf02863220554988b2c0b9e1fbb98f7cbe63e8f.wasm`, based on the supplied source binary SHA256 `7acb0ed25fa83d2542d73535381a93f3328d61fab037d10567bcab129c385142`. The reader rejects a different deployed player URL and validates live class names and player values.

The modern Ashuni build was also inspected and parsed using current Cpp2IL: Unity 6000.4.2f1 / metadata 39, with substantially different field layouts. That work confirmed why this adapter must not apply its offsets to the modern pages.

## Proof inspection

The uploaded bundle's 13 SHA256-listed files matched their supplied digests. The recovered `CoinManager.Update` accesses the expected collection fields and invokes `Coin.UpdateCoin`. The module was converted to WAT independently. Signature-specific dispatch was respected.

The `RaycastHit.get_collider` table entry is an adjustor thunk that adds eight bytes before calling the unboxed implementation. The adapter accounts for that when decoding array elements; failing to do so initially returned null colliders. Native raycasts now return live train and barrier colliders with bounds, names and tags. Mission/scoring triggers are excluded from obstacle predictions.

`Route.GetPosition` subtracts 20 from the character's lateral `x` field. The motor uses this verified coordinate conversion. It does not disable collisions or coin pickup.

## Live Chromium observations

These were real runs on the selected public game, using the packaged reader/planner functions. They were not synthetic screenshots or test fixtures.

| Check | Observed result |
|---|---|
| Runtime availability | Actual legacy module and 369,098,752-byte heap available |
| Native state | Character class, position, speed, lane, coin collider centers/extents and run coin counter read successfully |
| Native physics | Train and barrier collider identities and bounds returned |
| Initial lane-only prototype | Failed: collected coins and died; not counted as success |
| Fixed precision corridor | Zero coins through world Z ~503; died at ~536 without adaptive obstacle handling |
| Adaptive native planner, braking disabled | Zero coins through world Z 2,100.82; subsequently died |
| Packaged production startup, auto-brake enabled | Paused the actual game at world Z 561.36 with zero collected coins and reported “No safe predicted path — game paused, take over” |

Game-generated layouts vary. These observations demonstrate actual movement and no-coin segments, not a guaranteed zero-coin run for every layout or an endless survival claim. A paused or dead run is reported as such.

## Automated checks

31 Node tests passed: existing visual/controller regressions plus native corridor planning, unsupported-build rejection, observation-mode passivity, actual-coin stop behavior, heartbeat timeout, and auto-braking.

The prior local Chromium fixture test passed for focus, crop, remapped keys, pause-state inspection and held key input. The real legacy page also loaded and ran in headless Chromium with software WebGL.

Installed-extension loading is blocked by the cloud browser's administrator policy. The production startup expression was executed directly through browser automation, including its page-side HUD/control loop; a one-second test heartbeat stood in for the service worker heartbeat. Full installed-extension permissions and shortcut delivery remain unverified here.


## Version 0.4 visual learning

The between-lane mode is disabled. The new workflow records the user's keyboard demonstrations and canvas-derived features and trains an action head on the packaged pretrained MobileNet backbone. No human demonstration dataset or trained game policy was available in this environment.

- The published quantized model source checksum was verified before conversion. ONNX graph validation passed for the pruned spatial encoder.
- Real Chromium single-thread WASM inference returned 288 finite, deterministic spatial features and changed when the test object moved. A warm cloud inference was approximately 32 ms; this is not an i5-8265U/UHD-620 benchmark.
- The browser pipeline test persisted 40 examples from two synthetic image episodes, trained the head, reloaded it from IndexedDB, and classified the held-out synthetic episode. An initial weak result led to training-only feature normalization; the subsequent run achieved macro F1 ~0.818 / accuracy 0.85 on 20 synthetic images. These numbers do not measure game performance.
- Whole episodes are separated for validation. The test also verified terminal-tail deletion and trusted-key capture that excludes focused text inputs.
- The browser checks were repeated using the extension-equivalent `script-src 'self' 'wasm-unsafe-eval'` policy. The popup check uses a mocked Chrome API and does not establish capture permissions or shortcut delivery.
- All 43 Node tests passed, including the learning core and cancellation checks alongside the earlier controller regressions. Full installed-extension recording/playback remains unverified in this cloud browser because unpacked extensions are administrator-blocked.

A qualified gameplay claim requires recording user demonstrations, training the control head, then evaluating on new runs. This release supplies that pipeline; it does not claim a trained zero-coin agent or autonomous reinforcement learning.

The offscreen recorder was also exercised with a real generated MediaStream and a mocked Chrome message bridge: it saved 14 labelled samples (including all four move types), kept one episode across pause/resume, and issued no movement decisions. The popup smoke test passed with a mocked Chrome API. These checks do not substitute for real tab-capture permissions in an installed extension.
