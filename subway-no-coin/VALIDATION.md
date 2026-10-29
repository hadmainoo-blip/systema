# Validation — 2026-10-29

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
