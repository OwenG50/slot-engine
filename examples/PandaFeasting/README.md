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
pnpm --filter panda-feasting panel
pnpm --filter panda-feasting simulate
pnpm --filter panda-feasting optimize
pnpm --filter panda-feasting analyze
# Or simulation, optimization, and analysis together:
pnpm --filter panda-feasting build
```

`run audit` is intentional: `pnpm audit` invokes pnpm's dependency security audit.
Use the repository's required Node version, **>=23.8.0**.

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
| `src/math.ts`, `src/resultSets.ts`         | ButchEm-derived probability targets and candidate generation                 |
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
| FeatureSpin / `featureSpin`               |   50× |        80% |                48× | One spin, always adds 3–10 wilds, independent multipliers per wild |
| BonusFeature / `bonusFeature`             |  100× |       100% |                96× | Real 3-scatter trigger board, then normal bonus                    |
| SuperBonusFeature / `superBonusFeature`   |  300× |       100% |               288× | Real 4-scatter trigger board, then super bonus                     |
| HiddenBonusFeature / `hiddenBonusFeature` | 1000× |       100% |               960× | Real 5-scatter trigger board, then hidden bonus                    |

All seven modes are exposed. Hidden bonus is reachable through five
scatters in Base/ExtraChance/ExtraChance2 or through the 1000× hidden-bonus buy.
The buy uses the same hidden-tier mechanics: five initial spins, stage 1,
ten winning low symbols per promotion, and a reset to five spins per new stage.
It uses the existing event shapes and never explodes on its trigger reveal.
FeatureSpin has no scatters, bonus trigger, collection, or persistent stage.
Its natural wilds also draw independent multipliers from the same stage pool.

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
| H1     |       50× |       15× |        8× |
| H2     |       40× |       12× |        5× |
| H3     |       30× |       10× |        3× |
| H4     |       15× |        5× |        2× |
| H5     |       10× |        3× |      1.5× |
| L1     |        5× |      1.5× |      0.5× |
| L2     |        3× |        1× |      0.2× |
| L3     |        3× |        1× |      0.2× |
| L4     |      1.5× |      0.5× |      0.1× |
| L5     |      1.5× |      0.5× |      0.1× |

`W` substitutes any paying symbol. A complete five-wild line pays as H1; W has
no separate shorter wild-prefix paytable. `S` does not pay or substitute.
For each winning line, add the multipliers of its participating wild cells and
multiply the line's paytable award by that sum. Without wilds the multiplier is

1. Two 1× wilds therefore give 2×; a 2× and a 25× wild give 27×.
   The same wild can contribute to multiple winning lines, once per line.

## Bonus stages

| Scatters on base trigger | Tier     | Initial spins | L symbols per stage promotion |
| ------------------------ | -------- | ------------: | ----------------------------: |
| 3                        | `normal` |             5 |                            15 |
| 4                        | `super`  |             5 |                            12 |
| 5                        | `hidden` |             5 |                            10 |

At most one scatter appears per reel. Bonus and FeatureSpin strips contain no
scatters. Non-triggering base candidates show at most two.

All tiers start at stage 1 with progress 0. After a bonus spin's wins finish,
collect all actual L1–L5 cells belonging to paid winning lines, deduplicated by
position. Wilds and losing low symbols never count.

Once the threshold is reached, advance **one stage**, discard surplus progress,
reset progress to 0, and reset remaining spins to **exactly five**. This also
works on the last available spin. Stage thresholds are individually editable
for stages 1–4 in `FEATURE_RULES.stageThresholds`.

Progress accumulates across spins at the current stage. The updated thresholds
are 50% higher for Normal and Super, and 100% higher for Hidden. Reaching stage 5
requires at least 60/48/40 collected low symbols in Normal/Super/Hidden, before
counting discarded overflow.

Normal cannot immediately promote on a stage-entry explosion spin alone: the
3–10 added wilds leave at most 12 real low symbols, below its 15-symbol threshold.
The burst can pay strongly while later spins complete the collection. Hidden
still has the easiest progression, but its advantage over Normal is smaller
than with the previous 10/8/5 thresholds. Review stage-reach rates on the weighted
books when tuning these settings; the current optimized RTP is verified below.

| Stage | Every natural or spawned bonus wild |
| ----- | ----------------------------------: |
| 1     |                                  1× |
| 2     |                                  2× |
| 3     |                                  5× |
| 4     |                                 10× |
| 5     |                                 25× |

Stage 1 has no entry explosion. On the first spin after promotion to stages
2–5, reveal the normal board, then add 3–10 wilds with the new stage multiplier,
then evaluate wins. No further entry wilds spawn on that stage's later spins.
All wilds disappear with the next spin; natural wilds on subsequent spins still
use the current stage multiplier.

Stage 5 stops collection entirely. A bonus lasts at most 25 free spins: five
initial spins plus at most five additional spins for each of four promotions.
Reaching the round cap ends the feature immediately and skips further collection.

## Explosion distributions and reels

These are **candidate-generation weights**, before payout rejection and optimizer
weighting. Their final player-facing frequencies can change with optimization.

- Non-triggering Base/ExtraChance/ExtraChance2 spins roll a 2.5% explosion
  chance. Added wilds have 1× multipliers. Reveals that trigger any bonus tier,
  including bought-bonus trigger reveals, never emit `triggerExplode` or spawn
  explosion wilds. Stage-entry wilds can still spawn later during the bonus.
- Regular FeatureSpin candidates always explode. Every added wild independently draws a stage:
  1× at 50%, 2× at 30%, 5× at 12%, 10× at 6%, and 25× at 2%.
- Regular candidates select the added-wild count using these weights:

| Added wilds          |   3 |   4 |   5 |   6 |   7 |   8 |   9 |  10 |
| -------------------- | --: | --: | --: | --: | --: | --: | --: | --: |
| Weight / probability | 30% | 25% | 18% | 12% |  7% |  4% |  3% |  1% |

FeatureSpin's result sets starting at 2,000x (including exact max) use proposal weights from
`FEATURE_SPIN_HIGH_WIN_SAMPLING`: counts 3–10 have weights 1/1/3/5/10/20/25/35,
and stages 1–5 have weights 1/2/5/12/80. This supplies enough valid high-win books
without long rejection searches. Every multiplier still resolves through the
same 1×/2×/5×/10×/25× stage pool; placements, physical strips, line evaluation,
and event payloads use the normal game rules. Other result sets retain their
existing proposal weights. Final max-win probability remains the optimizer's
1-in-100,000 FeatureSpin target, independent of candidate generation quotas.

Locations are distinct and selected without replacement. Existing W and S cells
are excluded, so “adds 3–10” really means 3–10 new wilds and no hidden scatters.
Boards without enough available cells are redrawn before reveal.

Base symbol weights are L5/L4/L3/L2/L1 = 17/17/16/15/14 and
H5/H4/H3/H2/H1 = 10/9/8/7/6. W weight is 0.5. S weight is 1.5 on base strips and
absent on bonus strips. Physical strips contain 1,000 stops per reel.
There are exactly two sets: `base_lines_v1` and `bonus_lines_v1`. FeatureSpin
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
  uniformly from 0%, 35%, 65%, 85%, and 100%. Bands starting at 2,000x use 100%.
- A proposal chooses uniformly among the 11 paylines; prefix lengths 3/4/5
  have weights 15/25/60. Stages 1-4 choose from the five low symbols 90% of
  the time and all ten paying symbols otherwise. Stage 5 uses all ten.
- Matching stops can be W with probability 5% at stages 1-4, 25% at stage 5,
  or 60% at stage 5 for exact-max candidates. Multipliers still come exclusively
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

ButchEm's 85% acceptance of otherwise-valid non-triggering boards containing
scatters is retained. Zero-scatter and forced-trigger boards bypass that filter.

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
| `reveal`                     | `{board, anticipation, upgrades:{}, roamingWilds:[], bonusTier?, freeSpin?}`           | Every spin, before added wilds                                                     |
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
| `collectSymbols` **new**     | `{symbols:[{symbol,reel,row}], initialProgress, finalProgress}`                        | After bonus wins settle, stages 1–4                                                |
| `newStageUnlocked` **new**   | `{stage}`                                                                              | After collection reaches the current threshold                                     |

Normal reveal cells are `{name:"L1"}`. Wild cells add `Wild:true` and `multiplier`;
scatter cells add `Scatter:true`. FeatureSpin's natural wilds report their own
individual multiplier in their reveal cell.

Empty `upgrades` and `roamingWilds` preserve ButchEm's reveal shape without
introducing its mechanics. `bonusTier` and `freeSpin` appear only on bonus
reveals, as in ButchEm. No extra line identifier is added to `winInfo`, preserving
its exact shape; positions identify each paid path, and overlapping lines remain
separate win entries.

Anticipation matches ButchEm: each reel receives 1 if at least two scatters have
already appeared on earlier reels, otherwise 0. For example, scatters on reels
0 and 1 give `[0,0,1,1,1]`. Bonus anticipation is always zero.

`collectSymbols` is emitted even when its array is empty, so progress remains
explicit. Its `finalProgress` is the raw sum after collecting that spin, before
promotion resets it. For example, Normal at 13 + 4 emits initial 13 / final 17, then
`newStageUnlocked:{stage:2}` resets the frontend's progress to 0.

`addAdditionalFreeSpins` preserves ButchEm's cumulative counter semantics:
after promotion on free spin 2 of an initial five, it reports
`{additionalFs:2, remainingFs:5, totalFs:7, positions:[]}`. The next spin reports
`updateFreeSpin:{amount:3,total:7}`. This represents exactly five spins at the
new stage before that next spin is consumed.

The normal order for a promoting bonus spin is:

```text
updateFreeSpin → reveal → [spawnNewStageWilds]
→ [winInfo → setWin → setTotalWin]
→ collectSymbols → newStageUnlocked → addAdditionalFreeSpins
```

There is no `triggerExplode` inside bonuses: animate that explosion from
`newStageUnlocked`. Base/FeatureSpin order is
`triggerExplode → reveal → spawnNewStageWilds → [winInfo → setWin → setTotalWin]`.
The reveal is an immutable snapshot of the original symbols; the frontend
applies `spawnNewStageWilds` before displaying the line wins.

Zero-pay spins omit win presentation; a zero-pay round also omits `finalWin`.
At the cap, `win` amounts are clipped in line order and sum exactly to the
remaining award. `meta.winWithoutMult` and `meta.multiplier` retain their raw
calculation values, matching ButchEm's capped-win convention.

## Payout distributions

The game retains ButchEm's **96% RTP, mode hit rates, bonus frequencies, tier
means, payout-band boundaries, and FeatureSpin family payout budgets**.
Individual band means are adjusted for PandaFeasting's discrete pays and actual
available payouts. Tests verify those budgets and run the native optimizer
against both historical criteria and the explicit band criteria.

The optimizer requires a mean strictly inside a group's available payout range
when it contains multiple distinct payouts. A sub-0.25× group containing only
0.1× and 0.2× wins therefore targets 0.15×. Targeting 0.2× would require a boundary
solution that this solver rejects, even though 0.2× books exist.

Other interior means are Base's 200×+ band at 250×, ExtraChance's 0.5–1× band at
0.6× and 1.5–2× band at 1.65×, ExtraChance2's narrow super-bonus median band at
251.6×, and FeatureSpin's 3,000–5,000× band at 3,600×. Balancing allocations absorb
the corresponding payout changes to retain the overall RTP and hit targets;
FeatureSpin also retains each family's probability and expected payout.

| Mode         | Normal bonus frequency | Super frequency | Hidden frequency |
| ------------ | ---------------------: | --------------: | ---------------: |
| Base         |               1 in 300 |      1 in 3,000 |      1 in 50,000 |
| ExtraChance  |               1 in 150 |      1 in 1,500 |      1 in 25,000 |
| ExtraChance2 |                1 in 60 |        1 in 600 |      1 in 10,000 |

These are mutually exclusive trigger-tier probabilities, including their
max-win outcomes. The three rates add to the overall bonus probability.

| Entry                       | Normal mean / minimum | Super mean / minimum | Hidden mean / minimum |
| --------------------------- | --------------------: | -------------------: | --------------------: |
| Base and corresponding buys |              96 / 16× |            288 / 87× |            960 / 800× |
| ExtraChance                 |              92 / 12× |            280 / 65× |            940 / 800× |
| ExtraChance2                |              90 / 12× |            276 / 65× |            930 / 800× |

Minimums are inherited **candidate acceptance floors**, not artificial top-ups.
Rounds below the floor are resampled; symbols and events always explain the
actual payout. Feature totals include the triggering spin.

Conditional bonus median targets are normal/super/hidden =
74.8/256.5/900× for Base/buys, 72.5/254/885× for ExtraChance, and
70/252/875× for ExtraChance2.

Below-cost probability targets (zero pays plus partial returns) are 90% for each
ExtraChance mode, 80% for FeatureSpin, 75% for BonusFeature, and 80% for
both SuperBonusFeature and HiddenBonusFeature. Base's inherited payout bands
determine its below-cost rate.

FeatureSpin preserves the former 70/15/10/5% payout-family allocation, with
family mean targets 21.428571/60/120/240×, giving an overall mean of 48×.
The 70% family includes all 20% zero-pay rounds. These are only payout coverage
groups; they do **not** assign a bonus stage, wild count, or multiplier.

Exact 10,000× target probabilities are:

| Outcome              |        Conditional frequency |
| -------------------- | ---------------------------: |
| FeatureSpin max win  |    1 in 100,000 FeatureSpins |
| Normal bonus max win |   1 in 50,000 normal bonuses |
| Super bonus max win  | 1 in 16,666.67 super bonuses |
| Hidden bonus max win |    1 in 5,000 hidden bonuses |

For a naturally triggered bonus, multiply its trigger probability by the
conditional max probability. All max awards are generated through the same
game rules and capped; a max-win criterion does not fabricate the payout.

Simulation quotas are equal across the final payout bands: 45/45/45/34/13/12/8
bands for Base/ExtraChance/ExtraChance2/FeatureSpin/Normal/Super/Hidden buys.
Each band gets its own candidate pool, preventing narrow targets from receiving
only a few books out of a large coarse pool. Legacy coarse-criteria books remain
accepted by the target matchers. Simulation quotas are **not player probabilities**.
Optimizer targets set the
final weights. `run targets --bands` prints every range, probability and
target average; `__build__/targets.json` contains the same full distribution.

## Validation and limits

Validation with the balanced line-game reels:

- 97 PandaFeasting tests passed, including 1,000 random-board comparisons against
  the installed native line evaluator.
- The native retry regression covers the previously failing seed 3, another
  100 seeds, and deterministic replay, each with a 5,000-flow budget, separately
  for FeatureSpin's 3,000-5,000x, 5,000-10,000x, and exact-max bands.
- Reel regressions verify balanced symbol frequencies and line proposals across
  all five stages, all 11 paylines, and all ten paying symbols.
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

The current 70,000-book build has been optimized and audited. Measured RTP is
96% in every mode; hit rates are 20%/25%/25%/80%/100%/100%/100% in mode order.
The optimizer audit uses the actual integer-weight published lookup tables,
checks their payouts against the raw simulation, and checks each requested mean
against the generated support. Regenerate and re-optimize after future rule or
paytable changes; review stage and explosion pacing separately from RTP.

With the revised 50× H1 five-of-a-kind pay and 25× highest wild, a single line
cannot reach the 10,000× cap. Its absolute maximum is a five-wild line paying
`50 × (25 + 25 + 25 + 25 + 25) = 6,250×`. Four 25× wilds plus H1 pay 5,000×;
three 25× wilds plus two H1 symbols pay 3,750×.

FeatureSpin therefore requires multiple winning lines to reach max win.
For example, eight added 25× wilds on the first four reels of the top and middle
rows, with H1 on reel five, produce two 5,000× horizontal H1 wins. Other line
and multiplier combinations can also reach 10,000×. Bonuses can accumulate the
same cap over multiple spins. The updated regression tests cover the single-line
ceiling and the eight-wild example; the native audit samples actual max outcomes.

Lowering H1 relative to the other pays narrows the payout gap: H2/H3/H4 five-of-a-kind
now pay 80%/60%/30% of H1, compared with 50%/30%/20% in the original paytable.
This allows those symbols to contribute more evenly to target payouts. All ten
paying symbols were already eligible; the paytable does not itself increase their
landing frequency or guarantee more distinct symbols per round. Accepted and
optimized symbol mixes depend on reel weights and payout selection.
The configured FeatureSpin max-win target remains 1 in 100,000. Lower pays make
raw max outcomes harder to form, but final weighted max-win odds change only if
that optimization target is changed or cannot be met by the generated pool.

The smaller pool reduces raw wild strength: with the existing per-stage weights,
the average FeatureSpin wild multiplier falls from 4.8× to 2.8×. Final max-win odds
remain optimizer targets and must be revalidated with newly generated books;
old books and measured distributions do not describe the revised rules.

A standalone ordinary base spin uses 1× wilds and cannot itself reach 10,000×:
the theoretical full-wild-board payout is 11 × 50 × 5 = 2,750×. Moreover, the
inherited ordinary-win candidate bucket accepts only up to 1,999.99×.
Base/ExtraChance/ExtraChance2 reach the round max through their triggered bonuses.

The validation host ran Node 22.21.0 and reported the repository's >=23.8.0 engine
warning. Tests, typechecking, and the real-reel audit succeeded there; run the
full publishing pipeline under the repository's required Node version.
