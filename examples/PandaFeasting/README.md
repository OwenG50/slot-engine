# PandaFeasting

An independent game package alongside ButchEm. Five reels × three visible rows,
11 fixed left-to-right paylines, and a **10,000× total-round cap**. No padding,
cascades, sticky wilds, roaming wilds, or scatter retriggers.

The multiplier progression, overflow rule, 11 lines, total-base-bet payouts, and
all-wild behavior below were confirmed during implementation.

## Running and editing

From the repository root:

```sh
pnpm --filter panda-feasting test
pnpm --filter panda-feasting typecheck
pnpm --filter panda-feasting run targets
pnpm --filter panda-feasting run targets --bands
pnpm --filter panda-feasting run audit
pnpm --filter panda-feasting run audit-optimization
pnpm --filter panda-feasting run audit-bonus-hit-rate
pnpm --filter panda-feasting run report-wild-launches --output __build__/wild-launch-report.json
pnpm --filter panda-feasting panel
pnpm --filter panda-feasting simulate
pnpm --filter panda-feasting optimize
pnpm --filter panda-feasting analyze
# Or simulation, optimization, and analysis together:
pnpm --filter panda-feasting build
```

`run audit` is intentional: `pnpm audit` invokes pnpm's dependency security audit.
Use the repository's required Node version, **>=23.8.0**.

`report-wild-launches` joins exported books to final published lookup weights and
reports counts 1-15 (bonus boards can have fewer than three eligible cells),
count/multiplier combinations, and full-screen wild outcomes. It includes both
per-explosion frequencies and the chance of at least one matching launch per
round, separated by mode and base/FeatureSpin/bonus tier. Bonus-tier groups are
conditional on entering that tier; the `all` group uses every paid round.
Zero-weight books do not contribute to player odds. `supportedBooks: 0` flags
counts absent from positive-weight support. Regenerate the report after each
optimization; hashes identify the books and lookups used. This reads the local
exported JSONL counterparts, not remote live-player telemetry.

| File                                       | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `index.ts`, `package.json`, `panel.ts`     | Engine registration, simulation/optimization, and panel entry                |
| `src/settings.ts`                          | Stage thresholds/multipliers, mode costs, spawn weights, simulation sizes    |
| `src/paylines.ts`, `src/paytable.ts`       | Confirmed line geometry and symbol payouts                                   |
| `src/reels.ts`                             | Balanced physical strips for line games                                      |
| `src/lineSampling.ts`                      | Bonus candidate sampling along individual paylines                           |
| `src/evaluations.ts`                       | Line evaluation, additive wild multipliers, round cap                        |
| `src/feature.ts`                           | Collection, stage progression, and wild placement                            |
| `src/events.ts`, `src/onHandleGameFlow.ts` | Event serialization and complete game flow                                   |
| `src/math.ts`, `src/resultSets.ts`         | Panda payout targets and candidate generation                                |
| `scripts/audit.ts`                         | Bounded real-reel coverage audit and event replay                            |
| `scripts/auditOptimization.ts`             | Checks real simulation support, published target weights, RTP, and hit rates |
| `scripts/targets.ts`                       | Full distribution export to `__build__/targets.json`                         |
| `tests/`                                   | Mechanics, event contracts, mode targets, and native-evaluator comparison    |

`PANDA_SIM_RUNS` overrides all simulation sizes; mode-specific overrides are
`PANDA_SIM_RUNS_BASE`, `PANDA_SIM_RUNS_EXTRA_CHANCE`,
`PANDA_SIM_RUNS_EXTRA_CHANCE_2`, `PANDA_SIM_RUNS_FEATURE_SPIN`,
`PANDA_SIM_RUNS_BONUS_FEATURE`, `PANDA_SIM_RUNS_SUPER_BONUS_FEATURE`,
and `PANDA_SIM_RUNS_HIDDEN_BONUS_FEATURE`.
Each must be an integer >=100. `PANDA_SIM_CONCURRENCY` must be >=2.
The current settings generate 10,000 accepted candidates per mode:
70,000 accepted rounds across all seven modes.

Generated strips and reports live in the ignored `__build__` directory.
As in ButchEm, the engine reuses existing reel CSVs. Changing reel weights requires
regenerating the affected CSVs, or giving the changed strips new IDs.

## Modes

All payouts below are in **base-bet units**; RTP divides the round payout by the
mode's actual cost. A “hit” means a positive round payout, including partial returns.

| Display mode / engine key                 |  Cost | Hit target | Mean payout target | Behavior                                                           |
| ----------------------------------------- | ----: | ---------: | -----------------: | ------------------------------------------------------------------ |
| Base / `base`                             |    1× |        20% |              0.96× | Normal game, rare wild explosion, all three scatter tiers          |
| ExtraChance / `extraChance`               |  1.5× |        25% |              1.44× | Twice Base's frequency for each bonus tier                         |
| ExtraChance2 / `extraChance2`             |    3× |        25% |              2.88× | Five times Base's frequency for each bonus tier                    |
| FeatureSpin / `featureSpin`               |   50× |        72% |                48× | One spin, always adds 3–15 wilds sharing one selected stage multiplier |
| BonusFeature / `bonusFeature`             |  100× |       100% |                96× | Real 3-scatter trigger board, then normal bonus                    |
| SuperBonusFeature / `superBonusFeature`   |  300× |       100% |               288× | Real 4-scatter trigger board, then super bonus                     |
| HiddenBonusFeature / `hiddenBonusFeature` | 1000× |       100% |               960× | Real 5-scatter trigger board, then hidden bonus                    |

All seven modes are exposed. Hidden bonus is reachable through five
scatters in Base/ExtraChance/ExtraChance2 or through the 1000× hidden-bonus buy.
The buy uses the same hidden-tier mechanics: five initial spins, stage 1,
ten winning low symbols per promotion, and a reset to five spins per new stage.
It uses the existing event shapes and never explodes on its trigger reveal.
FeatureSpin has no scatters, bonus trigger, collection, or persistent stage.
It selects one stage per round. Natural and added wilds all share that stage's
multiplier. Before exploding, it emits one meter fill with the selected stage,
multiplier and progress so the frontend can smoothly transition from its previous
display without resetting. Final partial
progress is randomly selected from 10%-90% inclusive in 1% steps, is presentation-only, and does not
carry into the next round. It is sampled after every payout-affecting choice,
so changing the cosmetic fill cannot change the board, stage, wilds, or award.

Bought and naturally triggered bonuses both show a genuine trigger board drawn
from physical reel stops. The trigger board's line wins count toward the feature
total and the shared round cap.

## Paylines and pays

Rows are zero-based: top `0`, middle `1`, bottom `2`. In image order, top row
left-to-right followed by bottom row left-to-right:

```text
 1  00000       2  11111       3  22222
 4  01210       5  21012       6  01010
 7  12121       8  10101       9  21212
10  00122      11  22100
```

Each line pays its longest contiguous match from reel 1, with at least three
symbols. Different lines pay independently, including overlapping lines. There
is no division by 11 and no multiplication by the feature-buy cost.

| Symbol | 5 matches | 4 matches | 3 matches |
| ------ | --------: | --------: | --------: |
| H1     |       30? |       15? |        5? |
| H2     |       20? |       10? |        4? |
| H3     |       15? |        8? |        3? |
| H4     |       10? |        5? |        2? |
| H5     |        6? |        3? |      1.5? |
| L1     |        3? |      1.5? |      0.5? |
| L2     |        2? |        1? |      0.2? |
| L3     |        2? |        1? |      0.2? |
| L4     |        1? |      0.5? |      0.1? |
| L5     |        1? |      0.5? |      0.1? |

`W` substitutes any paying symbol. A complete five-wild line pays as H1; W has
no separate shorter wild-prefix paytable. `S` does not pay or substitute.
For each winning line, add only participating wild multipliers greater than 1
and multiply the line's paytable award by that sum. If no wild contributes a
multiplier greater than 1, use 1. Two 1x wilds give 1x; a 2x and a 1x wild give
2x; two 2x wilds give 4x; a 2x and a 25x wild give 27x.
The same wild can contribute to multiple winning lines, once per line.

## Bonus stages

| Scatters on base trigger | Tier   | Initial spins | Symbols for 1->2 / 2->3 / 3->4 / 4->5 |
| ------------------------ | ------ | ------------: | ------------------------------------- |
| 3                        | normal |             5 | 8 / 10 / 12 / 14                      |
| 4                        | super  |             5 | 6 / 8 / 10 / 12                       |
| 5                        | hidden |             5 | 4 / 6 / 8 / 10                        |

At most one scatter appears per reel. Bonus and FeatureSpin strips contain no
scatters. Non-triggering base candidates show at most two.

All tiers start at stage 1 with five spins and progress 0. Collect actual winning low-symbol
cells once per position after the original board wins. Wilds and losing cells are not food.

The food thresholds for stages 1-6 are (stages 1-5 promote; stage 6 fills once):

| Tier | Food per promotion |
| --- | --- |
| Normal | 10 / 12 / 15 / 18 / 21 / 24 |
| Super | 9 / 11 / 13 / 16 / 19 / 22 |
| Hidden | 8 / 10 / 12 / 14 / 17 / 20 |

A promotion discards surplus food. It emits `triggerExplode` with `{source: 'stage'}`,
then `spawnNewStageWilds` on the SAME board, using the completed stage's multiplier
(1x for completing stage 1, 2x for stage 2, 5x for stage 3, 10x for stage 4, and 25x for stage 5). All
winning lines on that overlaid board pay again, including unchanged wins. There is no
new reveal, no extra spin consumed, no food from the replay, and no chained promotion.
Existing natural wilds retain the multiplier shown on their reveal. The replay is
capped against the remaining 10,000x round budget.

Only after replay wins and their amount events does `newStageUnlocked` advance the
meter and allow Panda to respawn. Remaining spins then reset to five, unless max win
has already ended the round. Normally 3-15 wilds are added; if fewer cells are eligible
on the existing board, all remaining eligible cells are used without replacing wilds.

The bonus candidate sampler's low-only preference is 0.3: its mixed branch picks
from all ten paying symbols, giving conditioned lines a 65% low / 35% high split
before stage 6. This is candidate coverage, not a final player-facing hit rate.
Individual bonus spins have no specified hit-rate target. Each tier's winning-spin
rate emerges from the legal sampled outcomes and payout weighting;
better tiers are not forced to have higher hit rates. Trigger spins are excluded
from the measured bonus-spin rate. Bonus-buy whole-round hit rates remain 100%
under the existing payout floors; other mode-wide hit-rate targets are unchanged.

Build/optimize runs a second constrained weighting pass after the standard
payout optimizer. It preserves every payout band's probability and average,
starting from uniform book priors, then steering full-screen launch events
toward explicit per-stage targets. There are no stage-payout, symbol-share,
winning-spin or stage-reach targets. Books, events, payouts, and legal boards are never rewritten. CSV
row-offset indexes are regenerated alongside calibrated lookup weights, and the
optimizer audit verifies every offset. `__build__/bonus-hit-rate-report.json`
reports achieved hit rates and stage reach with both policies `"unconstrained"`, not requested
percentages or nearest-feasible targets. RTP, payout-band masses, and band averages remain mandatory;
invalid payout support still fails before any calibrated table is replaced.
The native optimizer no longer applies an 8x preference near each band's mean.
Full-screen stage targets now adjust book selection without changing these
mandatory payout constraints. The bonus audit reports cumulative reach
and mutually exclusive highest stages, plus average highest stage; it checks
Normal < Super < Hidden for Base, both Extra Chance modes, and the buys.
The prior stage-payout curves, normal-stage-5 prior, and H-symbol-share
preference have been removed. The audit still reports actual weighted H-line
share alongside stage distributions.

`fitFullScreenStages` measures the expected number of full-screen launches at
each supported multiplier within each paid mode and iteratively adjusts only
full-screen book priors toward explicit per-multiplier targets, refitting exact
payout-band masses and means after each adjustment. Books with multiple full
screens use their largest log preference once. The shared launch-count pool,
mechanics and stage multipliers are unchanged; natural and launched wilds
always share the same spin's multiplier.

Targets come from `FULL_SCREEN_TARGETS` in `src/settings.ts` and scale with
each mode's unchanged max-win probability. Stage 4-6 full screens (10x/25x/50x)
always pay the 10,000x cap, so together they are limited to `maxWinShare`
(60%) of max wins, split evenly. The other 40% of max wins come from other
routes (food collection, multi-line wins). Stage 1-3 full screens (1x/2x/5x)
pay less than the cap and each target `lowStageRatio` (4) times a single
high-stage target. For example, Base targets about 1 in 5M per low stage and
1 in 20M per high stage (about 1 in 1.35M overall). FeatureSpin targets 1 in
75,000 and 1 in 300,000 (about 1 in 20,000 overall).

The fit stops when every target is within tolerance, or after 64 updates. If
support or payout constraints prevent a target, it warns and reports
`achieved: false`. It never relaxes payout targets to force a fit. Final
integer weights are checked again before any table is replaced. The
calibration report's `fullScreenTargets` lists targets, achieved launch masses
and status for every mode, including FeatureSpin.

Use `pnpm --filter panda-feasting run audit-bonus-hit-rate` to independently
recompute the final rates and stage reach from published integer-weight LUTs.

| Stage | Natural bonus wild | Wild spawned on completing this stage |
| --- | ---: | ---: |
| 1 | 1x | 1x |
| 2 | 2x | 2x |
| 3 | 5x | 5x |
| 4 | 10x | 10x |
| 5 | 25x | 25x |
| 6 | 50x | 50x (one final explosion; no promotion) |

There is no entry explosion at stage 1 and no delayed wild spawn on the next reveal.
Wilds disappear with the next spin. Stage 6 collects food until its meter fills,
then explodes once with 50x wilds and replays all wins on the same board. It does
not emit `newStageUnlocked` or `addAdditionalFreeSpins`. Its progress is capped at
the threshold and remains full for the rest of the bonus; no further collection
or explosions occur. Natural wilds remain 50x on subsequent spins. A bonus lasts
at most 30 free spins (five initial plus at most five for each of five promotions).

Natural-entry payout floors are 16x / 87x / 1,011x for Normal / Super / Hidden.
Purchased bonus floors are 1x / 10x / 50x, configured separately in `BONUS_BUY_MINIMUMS`. Each mode still targets 96% RTP. The stage reach brief is a
tuning goal, not an outcome guarantee; 3,000-4,000x at Normal Stage 5 is a payout
guideline, not a hard minimum. Stage 6 is intended to be rarer still. Final weighted
stage reach and conditional average payouts are measured from fresh books.

The earlier 10,000-book bought modes had the following weighted stage reach:

| Tier   | Winning bonus spins | Reach stage 3 | Reach stage 5 |
| ------ | ------------------: | ------------: | ------------: |
| Normal |                 30% |         0.92% |       0.0048% |
| Super  |               32.5% |        17.59% |       0.0167% |
| Hidden |                 35% |        44.47% |       1.7434% |

These are historical measurements from the earlier hit-rate-constrained pool,
not current targets or predictions. Fresh books and optimization are needed to
measure the unconstrained bonus-spin rates and resulting stage distribution.
Reports live in `__build__/bonus-hit-rate-audit.json`
and `__build__/optimization-report.json`.

## Explosion distributions and reels

These are **candidate-generation weights**, before payout rejection and optimizer
weighting. Their final player-facing frequencies can change with optimization.

- Non-triggering Base/ExtraChance/ExtraChance2 spins roll a 2% explosion
  chance when books are generated. Published odds are set separately by
  `BASE_GAME_EXPLOSION_ONE_IN`: calibration weights books inside each exact
  payout band so a paid round has a base-game explosion 1 in 31 in all three
  modes (previously an uncontrolled 1 in 31 / 14.2 / 14.8). Added wilds have
  1× multipliers. Reveals that trigger any bonus tier,
  including bought-bonus trigger reveals, never emit `triggerExplode` or spawn
  explosion wilds. Stage-entry wilds can still spawn later during the bonus.
- Regular FeatureSpin candidates always explode. They select one shared stage:
  1x at 50%, 2x at 30%, 5x at 6%, 10x at 6%, 25x at 6%, and 50x at 2%.
  The stage proposal weights, bonus food thresholds, and collection rules are
  unchanged; the global stage ladder is now 1x/2x/5x/10x/25x/50x. Published
  weighted stage frequencies can change after payout rejection and calibration;
  these proposal percentages are not guaranteed player-facing odds.
- Every mode and candidate path selects the added-wild count using this one pool:

| Added wilds |  3 |  4 |  5 |  6 | 7 | 8 | 9 | 10 |  11 |   12 |  13 |   14 |   15 |
| ----------- | -: | -: | -: | -: | -: | -: | -: | -: | --: | ---: | --: | ---: | ---: |
| Weight      | 30 | 25 | 18 | 12 | 7 | 4 | 3 |  1 | 0.5 | 0.25 | 0.1 | 0.05 | 1 |

Weights total 101.9. Counts 3-14 retain their relative weights; 15 has been
increased from 0.01 to 1 in the shared pool. Selecting 15 has proposal probability
1/101.9, about 0.981% of candidate launches, not a guaranteed published player frequency. A launch
can now fill all 15 visible cells with wilds. Stage multipliers and the 10,000x
round win cap are unchanged. Existing generated books must be regenerated and
reoptimized before the extended range appears in published game data.

There are no mode-specific count overrides, high-win count pools, forced
15-wild quotas. Full-screen frequency is set only by book weighting (see
`FULL_SCREEN_TARGETS` above). Base explosions, FeatureSpin,
all bonus tiers and high-win candidates share `FEATURE_RULES.spawnCountWeights`.
Bonus stage launches clamp the sampled count to the eligible cells on the
existing board. All boards, multipliers and payouts follow normal mechanics;
existing optimization targets determine RTP, hit rates, payout bands and final
full-screen odds. A high-multiplier full screen can consume the remaining win
cap, so its final frequency is still limited by the max-win budget.
Use `report-wild-launches` after building to verify positive-weight support.

FeatureSpin's result sets starting at 2,000x (including exact max) use proposal weights from
`FEATURE_SPIN_HIGH_WIN_SAMPLING`: stages 1-6 have weights 1/2/2/3/12/80.
Counts still use the same shared pool above. This supplies valid high-win books
without long rejection searches. Every multiplier still resolves through the
same 1x/2x/5x/10x/25x/50x stage pool, selected once for the whole round; placements, physical strips, line evaluation,
and event payloads use the normal game rules. Ordinary base payout bands starting at 50x use a legal H1-line proposal and
the shared count pool. Final max-win probability remains the optimizer's
1-in-60,000 FeatureSpin target, independent of candidate generation quotas.

Max-win bonus candidates mix two legal reel-stop proposals. Half retain the
ordinary line sampler, including its high-stage natural-wild preference. Half
use `BONUS_LINE_SAMPLING.maxWinFoodRoundProbability` to select low-symbol
winning lines without conditioning natural wilds, including at stage 6.
This lets those candidates finish collecting food before a natural-wild win
ends the round, providing coverage for the final 50x explosion. Adjacent strip
cells remain untouched and may still contain natural wilds. Stage thresholds,
free-spin awards, collection, same-board replays and early max-win termination
are unchanged. Every explosion still draws its count from the shared pool;
no full screen is required or guaranteed. These outcomes share the existing
max-win probability budget rather than adding to it.

Locations are distinct and selected without replacement. Existing W and S cells
are excluded, so “adds 3–15” really means 3–15 new wilds and no hidden scatters.
Boards without enough available cells are redrawn before reveal.

Base symbol weights are L5/L4/L3/L2/L1 = 13/13/12/11/10 and
H5/H4/H3/H2/H1 = 14/13/12/11/10. W weight is 0.5. S weight is 1.5 on base strips and
absent on bonus strips. High symbols now have 60 of the 119 paying-symbol weight units (previously 40), approximately half of paying symbols. The paying-symbol total stays unchanged, so wild/scatter relative weights are preserved. Physical strips contain 1,000 stops per reel.
There are exactly two sets: `base_lines_v2` and `bonus_lines_v2`. FeatureSpin
uses the scatter-free bonus set. All payout bands use these same balanced strips;
there are no dense, tail, maxwin, or individual-symbol reel variants. Versioned
IDs ensure that cached CSVs from the former concentrated profiles are not reused.

Base and FeatureSpin draw random reel stops (apart from forced bonus scatters).
Bonus candidate generation mixes random stops with stops aligned to one randomly
selected payline. Only 3-5 positions on that line are conditioned. The other cells
come from adjacent physical strip positions; no paying symbols are painted onto
the board. This avoids boosting one symbol across all 15 cells while still
generating enough high-stage rounds to satisfy the existing optimizer targets.

`BONUS_LINE_SAMPLING` in `src/lineSampling.ts` controls this proposal:

- Each ordinary bonus candidate chooses a per-spin line-sampling probability
  uniformly from 0%, 10%, 20%, 35%, 65%, 85%, and 100%. Bands starting at 2,000x use 100%.
- A proposal chooses uniformly among the 11 paylines; prefix lengths 3/4/5
  have weights 15/25/60. Stages 1-5 choose from the five low symbols 30% of
  the time and all ten paying symbols otherwise. Stage 6 uses all ten.
- Matching stops can be W with probability 5% at stages 1-5, 25% at stage 6,
  or 60% at stage 6 for exact-max candidates. Multipliers still come exclusively
  from the current stage. Symbols are selected anew for each proposed line.

These settings describe simulation proposals, not final player probabilities.
Acceptance still requires the complete round to meet its payout band, bonus
minimum, and ordinary game rules. Optimizer targets remain unchanged. Reaching
high stages, winning-line frequency, and board appearance should be playtested
using the newly optimized books, since those details can change even at fixed RTP.

This uses the current engine's documented
[generated strips](https://slot-engine.dev/docs/core/config/reel-sets),
[result sets](https://slot-engine.dev/docs/core/config/result-sets), and
[forced physical stops](https://slot-engine.dev/docs/core/game-context/board-service).
The documentation describes these APIs; the one-line proposal is PandaFeasting's
own sampling design. Cabin Fever, Viking Quest, and Smokeys Stash likewise use
balanced symbol mixtures rather than per-symbol concentrated reel families.

Legal non-triggering boards containing one or two scatters are accepted without
an extra scatter rejection filter. Trigger-tier probabilities are set by the
optimizer, not by a ButchEm-specific board acceptance rule.

## Events and frontend contract

The engine supplies the envelope:

```json
{ "index": 0, "type": "eventName", "data": {} }
```

All reused event names, field names, coordinate shapes, and amount units match
ButchEm. In particular, its actual names are `freeSpinTrigger` and `setTotalWin`,
not `freeSpinsTrigger` or a separate `totalWin` event. `totalWin` is a field
inside `winInfo`.

Coordinates are `{ "reel": 0, "row": 0 }`. Boards are column-major
`board[reel][row]`, exactly five columns of three cells.

| Event                        | `data` payload                                                                         | When                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `reveal`                     | `{board, anticipation, bonusTier?, freeSpin?}`                                         | Every spin, before added wilds                                                     |
| `winInfo`                    | `{totalWin, wins:[{symbol, kind, win, positions, meta:{multiplier, winWithoutMult}}]}` | All positive line awards grouped into one event                                    |
| `setWin`                     | `{amount, winLevel}`                                                                   | After `winInfo`                                                                    |
| `setTotalWin`                | `{amount}`                                                                             | Cumulative feature total, including trigger win; single-spin total outside bonuses |
| `freeSpinTrigger`            | `{tier, totalFs, positions}`                                                           | After the 3/4/5-scatter trigger board settles                                      |
| `updateFreeSpin`             | `{amount, total}`                                                                      | Before each free spin; cumulative spins played and awarded                         |
| `addAdditionalFreeSpins`     | `{additionalFs, remainingFs, totalFs, positions:[]}`                                   | After promotion; remainingFs is exactly 5                                          |
| `freeSpinEnd`                | `{amount, winLevel}`                                                                   | Feature completion, including cap termination                                      |
| `finalWin`                   | `{amount}`                                                                             | End of a positive-paying round                                                     |
| `triggerExplode` **new**     | `{}`                                                                                   | Before an exploding base or FeatureSpin reveal                                     |
| `spawnNewStageWilds` **new** | `{wilds:[{reel,row,multiplier}]}`                                                      | After reveal, before line evaluation                                               |
| `collectSymbols` **new**     | `{symbols:[{symbol,reel,row}], initialProgress, finalProgress}`                        | After original bonus wins settle, until the stage-6 meter is full                   |
| `newStageUnlocked` **new**   | `{stage}`                                                                              | After collection reaches the current threshold                                     |
| `featureSpinMeter`          | `{action:"fill", stage, multiplier, progress}`                                         | FeatureSpin only, once before its explosion; progress is normalized to 0-1           |

Normal reveal cells are `{name:"L1"}`. Wild cells add `Wild:true` and `multiplier`;
scatter cells add `Scatter:true`. FeatureSpin's natural wilds report the round's
shared selected-stage multiplier in their reveal cell.

Reveals contain only Panda and shared engine fields; ButchEm's empty `upgrades`
and `roamingWilds` placeholders are omitted. No extra line identifier is added to `winInfo`, preserving
its exact shape; positions identify each paid path, and overlapping lines remain
separate win entries.

Anticipation matches ButchEm: each reel receives 1 if at least two scatters have
already appeared on earlier reels, otherwise 0. For example, scatters on reels
0 and 1 give `[0,0,1,1,1]`. Bonus anticipation is always zero.

`collectSymbols` is emitted even when its array is empty, so progress remains
explicit. Its `finalProgress` is the raw sum after collecting that spin, before
promotion resets it. For example, Normal stage 1 at 8 + 4 emits initial 8 / final 12,
then `newStageUnlocked:{stage:2}` resets the frontend's progress to 0.
Stage 6 instead caps `finalProgress` at 24 / 22 / 20 for Normal / Super / Hidden.
The frontend must leave this meter full after its explosion; there is no reset or
further `collectSymbols` event for the remainder of that bonus.

`addAdditionalFreeSpins` preserves ButchEm's cumulative counter semantics:
after promotion on free spin 2 of an initial five, it reports
`{additionalFs:2, remainingFs:5, totalFs:7, positions:[]}`. The next spin reports
`updateFreeSpin:{amount:3,total:7}`. This represents exactly five spins at the
new stage before that next spin is consumed.

The normal order for a promoting bonus spin is:

```text
updateFreeSpin → reveal
→ [winInfo → setWin → setTotalWin]
→ collectSymbols → triggerExplode → spawnNewStageWilds
→ [winInfo → setWin → setTotalWin]
→ newStageUnlocked → addAdditionalFreeSpins
```

Bonus explosions use `triggerExplode:{source:"stage"}`. On stage-6 completion the
same sequence ends after the replay wins, without an unlock or spin award.
Base explosion order is
`triggerExplode → reveal → spawnNewStageWilds → [winInfo → setWin → setTotalWin]`.
The reveal is an immutable snapshot of the original symbols; the frontend
applies `spawnNewStageWilds` before displaying the line wins.

FeatureSpin prepends exactly one meter fill event to that same explosion order,
describing the final reached stage. No reset event is emitted.
For selected stage 3 (5x), the sequence is:

```text
featureSpinMeter {action:"fill",  stage:3, multiplier:5, progress:0.37}
triggerExplode → reveal → spawnNewStageWilds → [winInfo → setWin → setTotalWin]
```

The single fill supplies the total reached stage, its multiplier, and
progress on that stage. The frontend smoothly transitions from the previous
display to these new values, without clearing the meter first. This retained
display is presentation-only; the previous round's stage and progress do not
affect the new outcome. No intermediate fill or reset events are emitted. Final fill
is a random 0.10-0.90 inclusive, including at stage 6; the example's 0.37 is illustrative.
There is exactly one explosion and one board evaluation, no food collection or
free-spin award. `newStageUnlocked` remains bonus-only. These events supply the
backend animation contract; no frontend implementation is included here.

Zero-pay spins omit win presentation; a zero-pay round also omits `finalWin`.
At the cap, `win` amounts are clipped in line order and sum exactly to the
remaining award. `meta.winWithoutMult` and `meta.multiplier` retain their raw
calculation values, matching ButchEm's capped-win convention.

## Payout distributions

The game targets **96% RTP**, the configured mode hit rates, bonus frequencies,
and tier means. Panda FeatureSpin uses one set of disjoint payout bands rather
than the inherited 70/15/10/5 coverage-family allocation. It keeps its 50x cost,
72% whole-round hit rate, a measured 82.9% below-cost probability (17.1% cost
recovery), 48x mean payout, and
1-in-60,000 max-win chance. Its payout curve is now configured directly in
`src/math.ts`; it is independent of wild-count and stage-multiplier proposals.
Tests validate Panda's own constraints without importing ButchEm math.

The optimizer requires a mean strictly inside a group's available payout range
when it contains multiple distinct payouts. A sub-0.25× group containing only
0.1× and 0.2× wins therefore targets 0.15×. Targeting 0.2× would require a boundary
solution that this solver rejects, even though 0.2× books exist.

Other interior means are Base's 200×+ band at 250×, ExtraChance's 0.5–1× band at
0.6× and 1.5–2× band at 1.65×, ExtraChance2's narrow super-bonus median band at
251.6×, and FeatureSpin's 3,000–5,000× band at 3,600×. Balancing allocations absorb
the corresponding payout changes to retain the overall RTP and hit targets;
FeatureSpin balances its remaining payout budget in the 100-250x band.

Ordinary (non-bonus) wins in Base and both Extra Chance modes favour the
5-10x and 10-20/25x bands over 2-5x. Their 25x+ ordinary bands were trimmed to
pay for this, and the 2-5x (Extra Chance 2: 3-5x) recovery band absorbs the
rest. Published odds are below. Extra Chance 2 moved some 2-3x mass into
1-2x so its below-cost budget is unchanged.

| Ordinary win | Base | Extra Chance | Extra Chance 2 |
| --- | ---: | ---: | ---: |
| 2-5x | 1 in 34.5 | 1 in 21.1 | 1 in 11.4 |
| 5-10x | 1 in 114.5 | 1 in 75.6 | 1 in 51.1 |
| 10-20x (Base) / 10-25x | 1 in 292.7 | 1 in 197.2 | 1 in 109.4 |
The curve is volatile: 28% losses and mostly small wins pay for a heavier
500-1,000x band, and trims 1,000x+ outcomes (other than the fixed max), at the same 50x price and 48x average. It adapts the supplied
100x-cost reference rather than copying its absolute payout bands, because our
price is half as large and our cap is 10,000x. The 100-250x band takes the
remaining probability and EV budget, targeting 6.124% at a 140.14x conditional
mean. Below-cost frequency is not a separate mandatory target; this curve
gives 82.9% (17.1% cost recovery). Exact max is 1 in 60,000, and RTP stays at 96%.

| FeatureSpin payout, base-bet x | Probability | Effective 1-in-X |
| --- | ---: | ---: |
| Loss | 28% | 3.57 |
| Above 0, below 1 | 0.6% | 166.67 |
| 1-2 | 1.8% | 55.56 |
| 2-5 | 12% | 8.33 |
| 5-10 | 16% | 6.25 |
| 10-25 | 15% | 6.67 |
| 25-50 | 9.5% | 10.53 |
| 50-100 | 6.2% | 16.13 |
| 100-250 | 6.124% | 16.33 |
| 250-500 | 2.7% | 37.04 |
| 500-1,000 | 1.75% | 57.14 |
| 1,000-2,000 | 0.27% | 370.37 |
| 2,000-3,000 | 0.03% | 3,333.33 |
| 3,000-5,000 | 0.016% | 6,250 |
| 5,000-below 10,000 | 0.0083% | 12,000 |
| Exactly 10,000 | 0.00167% | 60,000 |

Ranges include the lower bound and exclude the upper. Probability is per paid
FeatureSpin, not conditional on a win. Published 500x+ probability is 2.076%
(about 1 in 48), 1,000x+ is 0.326%, 2,000x+ is 0.056% and 5,000x+ (including
max) is 0.01%.
Use `pnpm --filter panda-feasting run report-feature-spin-distribution --output <file.json>`
to recompute the published distribution, tail probabilities and quantiles.
Use `pnpm --filter panda-feasting run report-payout-distributions [--output <file.json>] [--markdown <file.md>]`
to compare every mode side by side. It splits rounds into ordinary base-game
rounds (no bonus triggered), each triggered bonus tier and FeatureSpin. Each
group shows its entry odds, mean, RTP contribution and quantiles, plus shared
payout bands with conditional %, per-paid-round 1-in odds and RTP share.

| Mode         | Normal bonus frequency | Super frequency | Hidden frequency |
| ------------ | ---------------------: | --------------: | ---------------: |
| Base         |               1 in 300 |      1 in 3,000 |      1 in 62,500 |
| ExtraChance  |               1 in 150 |      1 in 1,500 |      1 in 31,250 |
| ExtraChance2 |                1 in 60 |        1 in 600 |      1 in 12,500 |

These are mutually exclusive trigger-tier probabilities, including their
max-win outcomes. The three rates add to the overall bonus probability.

| Entry                       | Normal mean / minimum | Super mean / minimum | Hidden mean / minimum |
| --------------------------- | --------------------: | -------------------: | --------------------: |
| Base                        |              92 / 16x |            276 / 87x |          1,750 / 1,011x |
| ExtraChance                 |              88 / 16x |            268 / 87x |          1,725 / 1,011x |
| ExtraChance2                |              86 / 16x |            264 / 87x |        1,712.5 / 1,011x |

Purchased modes instead have means/floors 96x/1x, 288x/10x and 960x/50x.
Natural Normal and Super use the supplied reference charts'
effective 1-in-X odds as relative payout-band priors (`BONUS_REFERENCE_ODDS`).
The charts' book counts are simulation coverage, not player probabilities.
Bands below the entry floor and above the 10,000x cap are excluded; a band
straddling the floor is clipped. Each remaining band's conditional mean is its
cent-denominated midpoint. A log-payout probability tilt is solved independently
per route to preserve its existing mean after reserving the exact-max allocation.
`NATURAL_BONUS_SPREAD` (0.15 Normal / 0.2 Super) adds a quadratic log-payout term
to that fit, moving mass toward the floor and the high tail at the same mean.
This brings natural medians closer to the bought curves: Normal is about 40-42x
(previously 45.5-48.9x) and Super about 143-148x (previously 166-176x). Natural
Normal 1,000x+ improves to about 1 in 377-458 and Super 1,000x+ to 1 in 40-45.
Max-win odds are unchanged.
This approximates the chart shape rather than copying incompatible probabilities:
the Super example has a higher payout budget than our 288x bought average.
Purchased bonuses use separate chart-inspired, single-peaked band probabilities
in `purchasedBonusDistribution`. Probabilities strictly increase towards
50-100x / 100-200x / 500-1,000x for Normal / Super / Hidden and strictly decrease
afterwards, including the exact-max row. Peak probabilities are approximately
29.56% / 31.51% / 36.91%. Super follows the reference chart's spread rather than
a dominant middle band: 200-500x carries about 28% of Super RTP (previously 47%)
and 1,000x+ about 35% (previously 19%). Its odds are 6% / 10% / 16% / 31.51% /
15% / 11% / 6.5% / 2.6% / 1.1% / 0.26% for 10-20x through 5,000-10,000x, cut at
300x so about 21.49% recover cost. The 288x mean and exact-max odds are unchanged.
Normal moves about 1 point of RTP share from 100-200x into 200-1,000x
(500-1,000x is 1.5%, 11.7% of RTP). A subsequent small broadening moves 3 / 3.5 / 3
percentage points out of the previous peaks into neighboring bands, without
increasing the very-low bands or changing the extreme-tail probabilities.
Other bands use midpoint conditional means; the peak's
conditional mean is solved to preserve the existing total average. Its solved
mean must remain within the peak band, otherwise configuration fails explicitly.
This is a budget-constrained adaptation, not an exact copy of higher-cap charts.
The earlier purchased chart fit allowed low-band humps; it is now superseded.

Natural Hidden retains its explicit bands below. These are weighted payout-band targets, not fabricated
payouts or runtime curve draws: selected books still use legal reel mechanics.

The reporting cuts are 2 / 5 / 10 / 20 / 50 / 100 / 200 / 500 / 1,000 /
2,000 / 5,000 / 10,000x, clipped to the route's floor. Each band preserves both
its probability and conditional mean. For Normal, Super and purchased Hidden, exact max wins receive
`BONUS_MAX_EXCESS_SHARE` (1%) of the expected payout above the guaranteed floor;
the rest of the upper tail remains distributed below the cap.
The previous fixed median and buy below-cost constraints are removed.
Stage reach and bonus-spin hit rates are measured rather than forced to
historical percentages. Stage-dependent payout preferences are no longer applied.

Natural Hidden bonuses instead use explicit payout bands:

| Payout range | Conditional probability | Conditional mean |
| ------------ | ----------------------: | ---------------: |
| 1,011-1,499.99x | 30% | 1,250x |
| 1,500-1,999.99x | 61.91% | Solved per entry mode |
| 2,000-4,999.99x | 5% | 2,800x |
| 5,000-9,999.99x | 3% | 6,500x |
| Exactly 10,000x | 0.09% | 10,000x |

The middle-band mean is solved to preserve each entry mode's Hidden mean.
These targets put 3.09% of natural Hidden outcomes at 5,000x or above, so their
weighted P99 must be at least 5,000x. Only 30% pay below 1,500x, guaranteeing
a median of at least 1,500x. Base Hidden entry odds change from 1 in 50,000 to
1 in 62,500, retaining the 2x / 5x Extra Chance frequency multipliers.
The 20% reduction in trigger probability funds exactly 25% higher conditional
Hidden means (previously 1,400x / 1,380x / 1,370x), preserving each route's Hidden
RTP contribution. This spends the entire new budget on better typical payouts,
not more premium outcomes: the 2,000x+ and 5,000x+ conditional masses are unchanged.
Normal/Super means, frequencies and payout curves, purchased bonus targets,
and ordinary-win expected payout remain unchanged. A tiny increase in ordinary
winning-spin probability absorbs the removed Hidden probability, preserving
the mode-wide nonzero-hit target. All mode RTPs remain 96%.
Final quantiles and stage statistics must be
measured after rebuilding the published tables.

Run `pnpm --filter panda-feasting run report-bonus-distributions --output report.json`
after building for independently measured payout ranges, effective 1-in-X odds,
shares of expected return, mode RTP contributions, quantiles, standard deviations, stage reach, and
whole-round payout averages grouped by highest stage. The report validates
published lookup payouts and IDs against the corresponding book events.

Minimums are inherited **candidate acceptance floors**, not artificial top-ups.
Rounds below the floor are resampled; symbols and events always explain the
actual payout. Feature totals include the triggering spin.

Below-cost probability targets (zero pays plus partial returns) are 90% for each
ExtraChance mode and 80% for FeatureSpin. Bonus-buy below-cost rates and medians
emerge from the wider payout curves. Base's inherited payout bands determine
its below-cost rate.

FeatureSpin's exact max-win target is 1 in 60,000 (previously 1 in 100,000); the
5,000-10,000x band shrinks by the same probability so 5,000x+ stays at 0.025%.
For Normal, Super and purchased Hidden, conditional max probability is
`BONUS_MAX_EXCESS_SHARE * (mean - floor) / (10,000 - floor)`.
Natural Hidden instead has conditional max probability 0.0009 (about 1 in 1,111).
Natural entries then multiply every tier's max probability by one per-mode factor
(`naturalMaxWinScale`) so whole-round max wins hit `NATURAL_MAX_WIN_ONE_IN`:
1 in 4,000,000 Base, 3,200,000 ExtraChance and 2,800,000 ExtraChance2
(previously about 3.01M / 1.58M / 0.65M, which scaled with entry frequency).
The removed max EV stays inside each bonus curve: Normal and Super refit their
band tilt, natural Hidden refunds its 1,500-2,000x middle band.
Natural whole-mode max probability is the entry-frequency-weighted sum across
the three tiers. It therefore changes with Extra Chance frequency and each
route's slightly different bonus mean. Max-win EV remains inside each tier's
existing expected payout budget. No symbols or payouts are fabricated.

Simulation quotas are equal across each mode's final payout bands.
Each band gets its own candidate pool, preventing narrow targets from receiving
only a few books out of a large coarse pool. Legacy coarse-criteria bonus books remain
accepted by the target matchers. FeatureSpin requires regenerated books after
the removal of its old coverage-family criteria. Simulation quotas are **not player probabilities**.
Optimizer targets set the
final weights. `run targets --bands` prints every range, probability and
target average; `__build__/targets.json` contains the same full distribution.

## Validation and limits

The earlier shared-stage FeatureSpin and revised multiplier ladder were rebuilt with
30,000 fresh legal books per mode (210,000 total), with all 154 payout bands
independently replayed three times (462 accepted rounds). The math suite has
207 passing tests and its TypeScript project typechecks. Published optimization
and bonus-statistics audits pass, including 96% RTP in every mode. All 30,000
FeatureSpin books were also checked for reset/fill ordering, one explosion,
one reveal, 3-10 added wilds, and one shared natural/spawned multiplier.
In that earlier pass, FeatureSpin's published standard deviation increased modestly from 134.8329x
to 136.1220x while its mean remains 48x, price 50x, and hit/below-cost rates 80%.
Its final weighted selected-stage probabilities are approximately
48.043% / 36.058% / 5.671% / 5.618% / 3.488% / 1.122%; the unchanged regular
50/30/6/6/6/2 proposal weights are not final player-facing stage odds.

The subsequent wider FeatureSpin curve reweights the current 10,000 legal books
per mode (70,000 total), without changing boards, events or stage proposals.
All six non-FeatureSpin published lookup SHA256 hashes are unchanged. All 207 tests,
typechecking, payout/bonus audits and 154 bands with three legal replays each pass.
The published FeatureSpin statistics for this pass are in the payout section above;
the earlier selected-stage frequencies are historical, not new stage-odds targets.

Measured natural Hidden P99 payouts are 7,085.4x / 6,972.9x / 7,003.2x for
Base / ExtraChance / ExtraChance2, with 3.09% of each at 5,000x or above.
The configured floor and lowest weighted books are 1,011x on each route.
Measured medians are 1,564.6x / 1,540.8x / 1,535.7x, with means
1,750x / 1,725x / 1,712.5x. Purchased Hidden keeps its 50x floor and 960x mean.
Purchased Normal / Super / Hidden medians are 36x / 114.3x / 365.4x. The
payout-band probabilities and means were
preserved; individual quantiles and weighted stage reaches are fresh measurements,
not guarantees retained from the old ladder.

All three bought curves now put more results below the old medians and fund a
wider high tail. Normal peaks at 20-50x (22.27%, about a 34.5x mean) instead of
50-100x. Super adds mass to 10-100x and to 1,000x+. Hidden peaks at 200-500x
(23.31%) with 35% of buys below 200x. Bought 1,000x+ chances are 0.43% / 4.33% /
24.7%, and 2,000x+ chances are 0.13% / 1.53% / 11.7% for Normal / Super / Hidden.
Max-win odds (1 in 10,525 / 3,594 / 1,093) are unchanged.

The earlier bought-only smoothing changed Normal / Super / Hidden medians from
39x / 94.8x / 370.8x to 52.5x / 201.6x / 987.6x. Below-20x Normal falls from
39.59% to 27.10%; below-100x Super from 51.07% to 22%; below-200x Hidden
from 33.56% to 16% (35% after the Hidden reshapes).
Very low results are less common, but this is not a guarantee
of recovering buy cost: measured below-cost probabilities are approximately
76.37% / 79.17% / 75.31%, so cost recovery is about 23.63% / 20.83% / 24.69%.
Normal's 20-50x chance is 22.27%; Super's 100-200x chance is 29.67%;
Hidden's 200-500x chance is 23.31%.
Natural Normal's 20-50x chances remain 28.51% / 29.07% / 29.35%, and natural
Super's 200-500x chances remain 32.58% / 31.79% / 31.38% for Base / ExtraChance /
ExtraChance2. All natural lookup hashes and bonus statistics are unchanged by
the bought-only smoothing.

Historical cumulative reach goals (no longer enforced by wide-distribution calibration):

| Tier | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal | 40% | 15% | 5% | 0.05% | 0.005% |
| Super | 99% | 30% | 10% | 0.5% | 0.05% |
| Hidden | 99.9% | 50% | 20% | 3% | 0.5% |

The current calibration uses `fitBonusHitRate` with no hit-rate target,
full-screen stage targets and mandatory payout-band masses/means. It does not invoke
the historical progression fitter or its stage-payout goals. Naturally sampled
full screens are weighted toward per-multiplier targets within the paid mode, without
the old H-symbol-share or near-band-mean preferences.
An exponential payout tilt still enforces the required conditional mean.
Final achieved stage rates remain visible in the calibration and independent audit.

Bonus candidate sampling uses the shared count pool
and an optional unconditioned-reel finish after reaching a candidate payout band.
These proposal choices broaden support; they do not define player probabilities.
All boards come from physical strips and all wins from the same evaluator.
Final published integer-weight RTP, hits, stage reach, tier order and every
lookup row offset are independently audited before the results are reported.


Historical five-stage progression balance: 210,000 books (30,000 per mode), with thresholds
7/8/9/10, 6/7/8/9, and 5/6/7/8 and the stage/H-symbol priors described above.
Average highest stage and reach rates for stages 3-5 increased in all twelve
tier/entry groups versus the previous high-symbol books. Mean highest stages
in the buys are 1.833 / 2.291 / 3.007 (Normal / Super / Hidden). Their stage-5
reach rates are 0.0141% / 0.1502% / 2.8072%. High-symbol awards comprise about
47.16% / 43.61% / 46.50% of paid bonus lines. All modes remain at 96% RTP,
and every bonus tier/entry meets its 30% / 32.5% / 35% winning-spin target.
The final checks passed 118 math tests, both project typechecks, all 186 payout
bands, and 558 legal-round replays; lookup offsets match every published row.

Earlier high-symbol pass (before the current stage weighting): 210,000 books (30,000 per mode) using the updated
paytable and v2 strips. Physical high-symbol shares are 49.40% on base strips
and 50.42% on bonus strips. Weighted H-paying spin rates increased in every
entry/buy category; Base initial reveals rose from 5.69% to 7.88%, and
FeatureSpin from 50.87% to 65.07%. All seven modes retain 96% RTP. All twelve
bonus tier/entry combinations met their requested 30%/32.5%/35% winning-spin
rates without the nearest-feasible fallback. The 186-band replay audit passed
three rounds per band. Later-stage progression and outcome concentration still
need separate balance review: the Normal buy's largest book has 9.23% probability.

Historical validation with the earlier balanced line-game reels:

- PandaFeasting regression tests include 1,000 random-board comparisons against
  the installed native line evaluator.
- The native retry regression covers the previously failing seed 3, another
  100 seeds, and deterministic replay, each with a 5,000-flow budget, separately
  for FeatureSpin's 3,000-5,000x, 5,000-10,000x, and exact-max bands.
- Reel regressions verify balanced symbol frequencies and line proposals across
  all six stages, all 11 paylines, and all ten paying symbols.
- TypeScript typechecking passed.
- Native optimizer regressions cover all seven modes using discrete 0.1×/0.2×
  support and sparse higher-payout bands, with both legacy and new criteria.
- The full native worker simulation completed 70,000 accepted rounds: 10,000 in
  each of the seven modes, with eight workers. Every generated book was checked
  for unique IDs and agreement between event win totals and the published payout.
- All 854,598 reveal events in that build were checked against contiguous windows
  from the new physical strips. The largest paying-symbol frequency on any strip
  was 16.3%. Published-weight average distinct symbols per reveal, before wild
  overlays, ranged from 7.19 (Hidden Bonus) to 7.81 (Base, including its bonuses).
- A fresh full `build` completed simulation, optimization, and analysis for all
  seven modes. Each achieved 96% RTP within integer-weight rounding tolerance.
- The published-weight audit verified every one of the 202 band probabilities
  and averages, plus overall hit rates and below-cost rates.
- The native real-reel audit accepted and replayed 2,020 rounds across **all 202
  optimizer bands**, ten per band, including exact 10,000× outcomes.
- Every generated bonus reel was checked for the absence of S.
- No unreachable payout band or event-replay mismatch was found.
- All ten paying symbols produced wins in each of the seven modes in this
  payout-conditioned audit. This confirms coverage, not their final relative odds.

Audit artifacts are `__build__/coverage-report.json` and selected
`__build__/sample_*.json` books. The report includes the tested paytable,
stage thresholds, stage multipliers, explosion chance, and winning-symbol coverage by mode.
Adjust `PANDA_AUDIT_RUNS`,
`PANDA_AUDIT_MODES` (comma-separated), and `PANDA_AUDIT_MAX_ATTEMPTS` for deeper
coverage. Each accepted sample has a bounded attempt budget; the audit reports
failures instead of retrying indefinitely.
The complete build log is `__build__/balanced-lines-build.log`. Published
weights and target support are checked by `run audit-optimization`, which writes
`__build__/optimization-report.json`. Book verification is saved as
`__build__/balanced-books-verification.json`, including physical-window validation
and published-weight symbol diversity before wild overlays.

The audit defaults to at most 49,999 flow calls per accepted book and rejects
budgets of 50,000 or more, matching the installed worker's 50,000-rejection stop.
It reports the largest individual retry count as well as the total per band.
Previously it allowed 100,000 calls and ran without a parent worker, so it could
prove a max win attainable while missing a production worker failure.

The earlier reproduced failure was FeatureSpin `feature_4_max`, seed 3: the old
ordinary wild proposal exhausted 50,000 attempts. High-win proposal weights fix
that failure. With balanced reels, a broader regression also caught excessive
retries in the 5,000-10,000x band. The high-win proposal now applies to all
FeatureSpin bands starting at 2,000x. It changes the candidate wild-count and
stage draws, never concentrates the paying-symbol strips. The retry guard remains
enabled, and all generated wins pass the normal evaluator and round cap.

The earlier 70,000-book build was optimized and audited before the latest paytable/reel changes. Measured RTP is
96% in every mode; hit rates are 20%/25%/25%/80%/100%/100%/100% in mode order.
The optimizer audit uses the actual integer-weight published lookup tables,
checks their payouts against the raw simulation, and checks each requested mean
against the generated support. Regenerate and re-optimize after future rule or
paytable changes; review stage and explosion pacing separately from RTP.

With H1's five-of-a-kind pay at 30x and the highest wild at 50x,
a five-wild line pays `30 * (50 + 50 + 50 + 50 + 50) = 7,500x`.
Four 50x wilds plus H1 pay 6,000x; three 50x wilds plus two H1 symbols pay 4,500x.
FeatureSpin still reaches the 10,000x cap through multiple lines. Its max-win
target is 1 in 60,000. Actual generated max outcomes and their published
probabilities must be checked after every paytable/reel change.

The H1/H2/H3/H4/H5 five-of-a-kind awards are now 30/20/15/10/6x.
The v2 reel weights increase high-symbol appearances, and bonus line proposals
choose a high symbol 35% of the time before stage five (previously 20%).
Only physical strip stops are used. This changes candidate coverage; final
weighted high-symbol visibility, wins, food collection, and stage reach are
measured from the rebuilt books rather than inferred from proposal settings.

With the unchanged regular stage proposal weights, the selected FeatureSpin
multiplier averages 4.5x before payout rejection and optimizer weighting. Final
max-win odds remain optimizer targets and must be revalidated with newly generated
books; old books and measured distributions do not describe the revised rules.

A standalone ordinary base spin uses 1× wilds and cannot itself reach 10,000×:
the theoretical full-wild-board payout is 11 \* 30 = 330x. Moreover, the
inherited ordinary-win candidate bucket accepts only up to 1,999.99×.
Base/ExtraChance/ExtraChance2 reach the round max through their triggered bonuses.

The validation host ran Node 22.21.0 and reported the repository's >=23.8.0 engine
warning. Tests, typechecking, and the real-reel audit succeeded there; run the
full publishing pipeline under the repository's required Node version.
