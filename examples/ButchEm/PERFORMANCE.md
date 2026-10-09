# Simulation performance

The current random roaming mechanic was profiled on October 7, 2026, using the
existing physical reel CSVs and the pinned Core 0.3.2 simulation runner. This
report replaces timings for the previous winning-cluster collection mechanic.
These measurements used the five-cell movement cap. The cap increased to eight
on October 8, 2026; the timings and book hashes below describe the earlier cap.

## Measured improvement

The fixed-seed comparison covers **all 80 result sets across all seven modes**,
with ten accepted books per result set. It includes **13,122 candidate attempts**
and **13,770 game-flow executions**, including the engine's accepted-round replay.
The local measurement runtime was Node 22.21.0; the repository's normal runtime
requirement remains Node >=23.8.

| Measurement                                |   Before |                After, two runs |
| ------------------------------------------ | -------: | -----------------------------: |
| Single-worker generation and serialization |  26.58 s |                  12.07-13.80 s |
| Accepted books                             |      800 |                            800 |
| Candidate attempts                         |   13,122 |                         13,122 |
| Game-flow executions                       |   13,770 |                         13,770 |
| Accepted-book SHA-256 hashes               | Baseline | Identical for every result set |

This is **1.9-2.2x faster**, or approximately **48-55% less generation time**.
The measurement excludes process startup, reel loading, file writing,
compression, optimization, and analysis. Full-build speedup depends on those
costs and the mode mix; it is not necessarily the same ratio.

The local diagnostic files are `__build__/performance/roaming-speed-baseline.json`,
`roaming-speed-final.json`, and `roaming-speed-verified.json`. CPU profiles and
an intermediate geometry-only comparison are in the same ignored directory.
Generated production books, lookup tables, and reel CSVs were not replaced.

## What changed

- Enumerate each anchor's straight and L-shaped geometry once per worker.
  Cache up to **1,024 blocker/distance layouts** as references to that immutable
  geometry. The board has only 25 single-cell and 16 expanded anchors, so the
  underlying geometry is finite and cache memory stays bounded.
- Represent footprints and swept cells with 25-bit masks. Collision and reveal
  landing checks no longer build temporary coordinate arrays and sets for
  every candidate route.
- Check reveal feasibility without constructing animation paths. Different
  routes to the same endpoint are checked once in this read-only search, since
  they leave the same stationary blockers for the next truck. Random playback
  still includes **every original route**, in its original order and weighting.
- Remove the extra reset before each board draw. Core 0.3.2's draw methods
  already reset reels, padding, and anticipation. ButchEm has no locked reels;
  the extra reset only allocated those arrays twice.
- Find forced-scatter stops once per draw and reuse them across that draw's
  retries. The physical strips do not change during those retries.
- Cache construction of the eight fixed reel-weight maps (four profiles,
  base/bonus phases). Public calls still return independent mutable copies.

No reel weights, payout rules, upgrades, collection rules, event schemas,
terminal-spin behavior, sample counts, quotas, optimizer targets, or worker
counts were changed. The random stream, route ordering, accepted books, retry
counts, and replay counts match the baseline. Public movement paths and event
payloads remain independent of the private frozen geometry.

Regression coverage compares every anchor, blocker, and movement limit against
an independent copy of the original route enumerator. It also compares joint
reveal feasibility on mixed boards and checks cache ownership. Existing game,
math, event-contract, and real-strip max-win tests still apply.

## Repeat the comparison

The benchmark reads existing reel CSVs and writes diagnostics only. Establish a
baseline before a future implementation change, then compare after that change:

```powershell
$env:BUTCH_BENCH_RUNS = "10"
$env:BUTCH_BENCH_MODES = "base,extraChance,extraChance2,featureSpin,bonusFeature,superBonusFeature,hiddenBonusFeature"
$env:BUTCH_BENCH_LABEL = "before-next-change"
pnpm --filter butch-em benchmark

# Make the performance change, keeping strips and sampling settings unchanged.
$env:BUTCH_BENCH_LABEL = "after-next-change"
$env:BUTCH_BENCH_COMPARE = "before-next-change"
pnpm --filter butch-em benchmark

Remove-Item Env:BUTCH_BENCH_RUNS, Env:BUTCH_BENCH_MODES, Env:BUTCH_BENCH_LABEL, Env:BUTCH_BENCH_COMPARE
```

The comparison fails if any accepted-book digest, attempt count, or game-flow
execution count changes. Use the same runtime, modes, result sets, run counts,
and unchanged reel CSVs. Repeat timings with similar background load.

| Variable               | Default                                            | Purpose                                            |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `BUTCH_BENCH_RUNS`     | `3`                                                | Accepted books per result set                      |
| `BUTCH_BENCH_MODES`    | `base,bonusFeature,hiddenBonusFeature,featureSpin` | Comma-separated modes                              |
| `BUTCH_BENCH_CRITERIA` | All in selected modes                              | Comma-separated result sets                        |
| `BUTCH_BENCH_LABEL`    | `latest`                                           | Diagnostic JSON filename                           |
| `BUTCH_BENCH_COMPARE`  | Unset                                              | Saved baseline label; fail on behavior differences |

## Remaining costs

Native board drawing and cluster evaluation now account for more of the work.
Narrow result-set payout ranges still reject complete rounds. Those retries
remain intentional coverage sampling; changing quotas, reel distributions, or
acceptance ranges would alter the math or candidate mix. This optimization
reduces the cost of each attempt while preserving the current acceptance logic.

Workers already default to available CPU parallelism, capped at 24 and floored
at 2. `BUTCH_SIM_CONCURRENCY` remains available to tune resource use. This work
did not increase worker counts or disable uncompressed book output.
