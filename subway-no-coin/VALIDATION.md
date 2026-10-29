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
