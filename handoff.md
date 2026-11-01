# No Coin Pilot — handoff for the next AI

Updated 2026-11-01. This is unfinished source work. The user's latest instruction is to give them the source and this handoff so another AI can continue. Do not describe this as a working 30-minute bot.

## What the user wants

- A Chrome/Edge extension that plays Subway Surfers automatically, collects **zero coins**, and survives **30 minutes or longer**.
- Use the available game state to make reliable decisions about coins, trains, barriers and movement. Real gameplay performance is the acceptance criterion.
- Use normal left/right lane changes, jumps and rolls. The user rejected persistent positions between lanes. Avoid crashing into trains, oscillating pointlessly, or pausing at almost every uncertain prediction. Legitimate ramp/roof movement needs accurate support and collision handling.
- Finish the implementation autonomously. The user is frustrated with repeated short-lived versions and does not want more requests to upload footage, configure training, or confirm routine work.
- Fix recordings labelling every action as `hold`. That pipeline has already been fixed and browser-tested; preserve those fixes.
- Original training request: https://www.speedrun.com/subsurf/runs/ywoxj7nm, starting at **00:23**. Its video is https://youtu.be/dkfO-fIHAuE (about three hours). The user asked the AI to process/train it itself. Actual video access failed in this environment; **no frames from that video were trained on**. Optional video annotation/local learning exists, but the default controller now reads native game state and requires no training.

Keep testing and fixing actual failures. Passing unit tests alone does not establish that the user's bot works. Do not fake success by disabling pickups, changing counters, removing collision handlers, granting invulnerability, teleporting the character or counting paused time as survival.

## Repository and delivery

- Repository: https://github.com/hadmainoo-blip/systema
- Working branch: `codex/no-coin-pilot-0.6`
- Open draft PR: https://github.com/hadmainoo-blip/systema/pull/1
- Project directory: `subway-no-coin/`.
- Source archive: `systema-source-handoff.zip`, with a `systema-source/` top-level folder, this document, the project, tests, runtime/model assets and selected evidence. It excludes dependencies, `.git`, the old extension ZIP and miscellaneous workspace scratch data. `SOURCE-MANIFEST.json` inside records each included file's SHA256.
- The previous committed checkpoint before this handoff was `3bcc16bb0ac409fdc712b86ead4c6daa92d97ea4`. The handoff commit includes subsequent work and known failures.
- `no-coin-pilot.zip` is still the **old 0.6.2** extension artifact from commit `6e5a790745ff579de3a6615230dcee0d532d8620`. It does not contain the current changes. Its SHA256 is `7f5bf5688f9f89a58e2c210b9fbc9d8a9cbd9f924fadb6e839d79e1b433e1f13`.
- Source manifest/package versions still say 0.6.2. This handoff is a source snapshot, not a new validated release. Rebuild/version a release only after reviewing and testing the intended controller.

## Current state and exact evidence

Evidence is in `subway-no-coin/validation/handoff-2026-11-01/`.

| Candidate | Wall seconds | Forward-gameplay seconds | Final Z | Coins | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `terrain-fine-1` | 78.07 | 75.48 | 10,096.29 | 1 | Failed: coin collected |
| `fastpaths-1` — current source | 2.04 | 0.77 | 85.57 | 1 | Failed: coin collected |

Both ran the actual supported game, used ordinary controls, kept native physics/counters/collisions active, disabled predictive braking, and stopped on a real collected coin. They used **render-suppressed diagnostics** to reduce software WebGL overhead. They do not establish visible rendering or installed-extension performance. Generated layouts differed, so these are not controlled comparisons and do not establish which candidate performs better generally.

The longer run actually reached observed ground Y 29.44, consistent with elevated support, but still failed. Its search switched from Worker to the main thread around trace second 24. Planner compute time averaged 42.54 ms, p95 72.70 ms, maximum 485.90 ms. Reader maximum was 201.2 ms. Investigate stalls and the Worker timeout/fallback before making performance claims.

The current source adds a fast check for complete hold/one-command trajectories before expanding the beam. Its latest run performed premature jump/roll sequences and failed at the first coin row. Keep this experiment distinguishable from the longer-run snapshot.

`terrain-fine-source/` contains all four control files from the 78-second attempt. Each was reconstructed from the saved executed source bundle and verified against the report's original SHA256. It can be reproduced in a separate checkout. The current and that earlier candidate share the profile, reader and pilot; their planners differ:

```text
legacy-profile.js  2b32648170a800f126481f8fff7dc85a1d470940d9cdc638d18f41dda8b8ee92
native-reader.js   dedcfa72005e0fc64db9a6a4261f6614c2694d5fde6d34a4b60cefc695d37ae9
native-pilot.js    c0b9da6a138909f482d2f360b080177788717483c6066265369152a0f6f689d5
earlier planner   0dfb27a2c26abc2c83868f7f2dad2bf7f425cb76c610927bdc6f19c137e1f2e9
current planner   f419e810a8955a8be1d65f19a5fe6a7400e00199bbf7f799a0cf51216db977c5
```

Current `npm test`: **121 passed, 1 failed**. The failure is `tests/planner-geometry.test.js:40`, “an unavoidable coin does not cause a deliberate collision with a solid train wall,” specifically `assert.ok(d.risk < 1000000)`. Earlier assertions for `blocked === false`, `zeroCoinRoute === false`, center target and positive risk pass. Risk sums repeated contacts with coins across simulation steps, so inspect the assumption that a total above one million identifies a physical train collision. Do not silently delete the regression or report all tests passing.

`tests/native_worker_browser_check.py` exercises a real browser Worker with the actual pilot and a mock native reader. It checks ordinary movement, Stop during search, rejecting a previous run's result, responsive main-thread timers and fallback after Worker errors. This is a component check, not gameplay proof. The evidence folder also contains earlier real recorder/worker results referenced in `VALIDATION.md`; the recorder retained all five labels (hold 9, left 2, right 1, jump 1, roll 1) on its generated-stream fixture.

## Architecture and important files

- `extension/controller.js`: extension/CDP bridge and cancellation-aware startup. Waits for Unity initialization. Always injects `precision:false` into built-in mode, ignoring old precision settings. Starts the in-page reader and pilot with the pure planner serialized into the supported game.
- `extension/native-reader.js`: verified-build native state, coin update hook, obstacle rays, movement calls, engine-step sampling and new ramp profiles.
- `extension/native-pilot.js`: control loop, focus/watchdog/manual-stop handling, accepted lane tracking, optional predictive braking and new background search Worker.
- `extension/native-planner.js`: bounded trajectory search, exact rounded capsule/sphere/box sweeps, moving obstacle extrapolation, terrain support, jump/roll transitions and the latest fast-path experiment.
- `extension/legacy-profile.js`: hash-pinned native API indices and verified offsets.
- `extension/worker.js`, `runtime-settings.js`: default built-in backend, untrained-policy fallback and settings migration. Predictive braking is opt-in; actual coin collection still stops a failed no-coin attempt.
- Recorder/learning code and tests already fix hold-only labelling, native/keyboard matching, final event draining, Stop/start races, and duplicate training jobs. Video imports require action labels and skip unlabelled footage.
- `tests/live_native_check.py`: real-game source-function runner with per-file hashes, source bundle, native counters, motion/plan history, engine time and progress JSON. It exits early on failure. It does not load an installed extension.
- `scripts/verify-gameplay.mjs`: strict long-run evidence gate. Synthetic gate tests are not survival evidence.

## Verified engine facts

Supported target only: **https://ashuni.lol/legacy/sanfrancisco/**, **original mode**. Unity 2019.4.18f1 / Subway Surfers 1.94.0. Player URL hash: `7b4bf9ca5568e64f1790d6018cf02863220554988b2c0b9e1fbb98f7cbe63e8f`. Source hash: `7acb0ed25fa83d2542d73535381a93f3328d61fab037d10567bcab129c385142`. Reject other builds instead of applying these offsets blindly.

Runtime metadata probes are retained as JSON in the evidence folder. Function tables are **signature-specific**: an index in `dynCall_vii` is not interchangeable with the same integer in another table.

- Character current `JumpHeight`: offset **72**. Normal-height configuration: 108 (20). Sneakers configuration: 112 (40). Read the current value for the active jump.
- Gravity: offset 104, observed 200. Normal jump impulse is `sqrt(2 * gravity * JumpHeight)` (~89.44). Semi-implicit integration makes actual clearance depend on engine frame step.
- Track movement: offset 444 is a signed direction integer (-1, 0, +1), not a pointer. Native target lane: 460. Fractional lane position: 464. Current cached lane: 164. Native world coordinates: 248.
- Normal lateral movement was observed at roughly `forwardSpeed / 1.5`. This is still an approximate motion model and needs calibration under acceleration, stumbling and transitions.
- Player trigger at offset 20: vertical CapsuleCollider, radius about 3, half-height 5, center `player.y + 5.5`, forward offset +1. Coins are SphereColliders of radius 4.5.
- Physical CharacterController at offset 184: radius 2, half-height 4.5, center `player.y + 4.5`. Fatal train handling also responds to the larger trigger; switching all train prediction to the smaller controller was experimentally unsafe.
- Rolled trigger: approximately radius 3, center `player.y + 4`. Tiny float differences matter: runtime X radius may be 3.000000238; an exact `halfHeight >= radius` check incorrectly disabled rounded sweeps for rolls. Current code allows a .001 tolerance.
- A normal midair roll forces downward speed. An ascending real probe observed the first post-roll speed around -92.78 (negative jump impulse plus one gravity step). Current model uses `-jumpV`. Other poses/powerups need verification.
- A ground jump cancels a roll. A live probe showed upward speed 89.44 and rolling false after invoking the ordinary native Jump at the roll's landing. The cached jumping flag can remain true for one landing frame. The reader allows ground jumps with non-positive vertical speed and player Y within .05 of known ground. It still rejects airborne ground jumps.
- Roll duration is modelled as .5 game seconds; the observed flag interval included frame/cache delay. Existing in-progress roll simulation still starts at .35 seconds remaining and should be improved.
- Flat native surface ray Y was **0.6**, standing player Y about **0.8**, matching .2 controller skin width. Train roof surface was **29.2**, with elevated standing ground around 29.4.
- Actual RaycastHit array elements are 44 bytes. Point offset 0, normal offset 12, distance offset 28. The existing native collider getter receives element address minus 8. Downward point/normal interpretation was verified against real road and roof hits.
- Movement methods: ChangeTrackBy 3228 through `dynCall_viii`; Jump 6567 and Roll 6569 through `dynCall_vii`. Native methods preserve real collision/pickup handling. Do not invoke guessed signatures.

## New work that needs careful review

### Search and command timing

Ordinary planning now uses 90 steps at 1/30 second (3-second horizon), beam 192. It includes midair rolls, ground jumps that cancel rolls, distinct rolled ground/air phases, hard pruning of physical obstacle hits, and a small survival reserve for paths that already failed the no-coin objective. The latest fast path checks complete hold/one-command trajectories first. There is no guarantee of optimality or robustness.

A four-coin row at Z90/120/150/180 between long side trains is a useful counterexample. A single jump often cannot clear it. Independent dense sampling found legitimate jump/roll/ground-jump trajectories; coarse 50 ms planning missed them. Early/late takeoffs and the roll timing are tight. Preserve rounded geometry and account for command/engine latency.

The pilot replans before the next scheduled action deadline instead of waiting until that deadline. It no longer imposes a global 180 ms pause between different action types. Repeated commands of the same type have a 60 ms bound, and native state guards remain active.

### Search Worker

The pure planner runs in a Blob Worker by default. The native reader, action application, heartbeat and emergency stop remain on the game thread. `startNativePilot(options, planner, workerPlanner=planner)` accepts a pure Worker planner separately so instrumentation wrappers can remain on the page. The live harness uses `planner.onDecision` to capture Worker results.

Inputs are projected forward by the observed Worker latency, capped at .12 seconds. This projection approximates motion and uses the old ground height during the projection; ramps and rapid state changes may invalidate it. Results from before a command/run change, paused runs, or round trips above 250 ms are discarded. A request taking more than 350 ms currently shuts down the Worker and falls back to synchronous planning. **That fallback happened in the 78-second run and may be harmful.** Review timeout behavior, state freshness, scheduling and failure recovery. Stop terminates the Worker and revokes its URL.

### Ramp and roof support

World AABBs of rotated ramp colliders included empty space and made usable slopes look like walls. The reader now samples downward rays every 2.5 units for verified-looking untagged `colliderCapsule`/`collider` objects with plausible ramp dimensions, caches points by collider/bounds, and attaches `surface` profiles to obstacles. It retains normals and validates hit coordinates. Profiles are approximations, and the name/dimension classification is heuristic.

The planner combines sampled ramps and known train roofs with road height and controller skin. It models gradual climbing, falling/landing, slope limits and side-entry step limits. It suppresses the ramp's fictional AABB wall only along a sampled central corridor when the character clears that surface. Review gaps, null samples, interpolation, slopes, simultaneous lane changes and fresh-state projection. This does not yet prove safe general terrain traversal.

### Remaining performance/correctness risks

1. The latest source still fails actual zero-coin play. Reproduce and inspect its accepted commands and recent plans before treating any change as an improvement.
2. Worker/main fallback and planner cost can miss narrow movement windows. A Worker removes main-thread blocking but does not make delayed decisions fresh automatically.
3. Beam pruning and timing resolution can discard feasible multi-command routes. Do not compensate by shrinking real colliders or ignoring coins.
4. Terrain support and lateral-speed/roll-time models remain approximate. Native source/metadata is available for read-only calibration; no complete decompiled game source is checked in.
5. Tests and gameplay claims must refer to the exact same four source hashes. The longer-run snapshot differs from the current planner.

## Run and validate

From `subway-no-coin/`, with Node 22+:

```sh
npm test
python tests/native_worker_browser_check.py
python tests/recorder_browser_check.py
python tests/worker_browser_check.py
python tests/popup_browser_check.py
```

Python browser checks require Playwright and Chromium. This environment uses `/usr/bin/chromium`. Runtime/model assets are checked in. Rebuild them only if needed with `npm ci --ignore-scripts && npm run build`. The ordinary extension packaging command is `python scripts/package.py`; it replaces the old repository extension ZIP, so label/version the result accurately.

Quick actual-game diagnosis:

```sh
python tests/live_native_check.py --seconds 180 --render-mode no-state --telemetry full --width 240 --height 400 --output ../work/live-candidate.json
```

Visible software rendering: omit `--render-mode no-state`. For an explicit synchronous-planning comparison, use `--no-planning-worker`. Avoid overlapping game browsers during a performance trial. Record failures as failures and keep the original source hashes.

Target verification:

```sh
python tests/live_native_check.py --seconds 1800 --telemetry compact --width 240 --height 400 --output ../work/live-30min.json
node scripts/verify-gameplay.mjs ../work/live-30min.json
```

The gate requires at least 1,800 seconds of both wall time and actual forward-gameplay time, zero native coins, no death/pause, continuous active trace and matching source hashes. Current reports fail this gate. Short diagnostic windows cannot substantiate 30-minute survival.

## Environment notes

The managed environment has unrestricted HTTP policy through its configured proxy, no VPN, and no extra cloud identities. Preserve inherited proxy/CA settings and read the cloud runtime skill when resuming here. The normal game works through Chromium; simple Python HTTP fetching received Cloudflare 1010 responses. No YouTube footage was obtained.

Administrator policy blocks unpacked extension installation/capture in cloud Chromium. It has not been changed or bypassed. Real gameplay checks execute the actual source functions through Playwright/CDP; component/browser checks cover other modules. Installed-extension end-to-end success is unverified. In a local browser, load the `extension/` folder containing `manifest.json` using Developer mode, then refresh the supported game and start a fresh run.

Miscellaneous `work/` files in the original shared workspace contain earlier probes, logs and browser profiles. They are intentionally excluded from the source archive. The selected reproducible evidence and exact earlier source snapshot are included under `validation/handoff-2026-11-01/`.
