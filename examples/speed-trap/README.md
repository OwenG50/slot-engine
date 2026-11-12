# Speed Trap

Run `pnpm --filter speed-trap build` to simulate, analyze, and optimize all seven modes.
After changing only optimizer probabilities, reuse existing simulation results with
`pnpm --filter speed-trap optimize`. Run tests with `pnpm --filter speed-trap test`.

All modes target 96% RTP relative to their own cost. FeatureSpin costs 50x and
requires a 48x average payout; Hidden Bonus Buy costs 1000x and requires 960x.

## FeatureSpin and symbol values

The paid FeatureSpin starts with 1-5 randomly selected active cameras and
2-8 newly landed cars, at most two per row. Its cameras and final cars carry into any bonus.
Candidate car-count weights for 2-8 are 70/12/8/4/3/2/1; camera-count weights
for 1-5 are 70/18/8/3/1. These are sampling weights, not published probabilities:
legal-board and payout filtering affect the final distribution. Added cars
use the same W3/W2/W1 mix as head-on partners and never overwrite scatters.
A dedicated eight-car simulation pool ensures the rebuilt books cover the
upper limit; it does not pin the published probability of eight cars.
Tier entry adds 0/1/2 new cameras on inactive reels for Normal/Super/Hidden and
guarantees 0/1/2 new cars on free spin 1, excluding inherited cars.

Car multiplier values use flattened descending weights: W3 weights 6,5,4,3;
W2 weights 11,10,9,8,7,6,5,4; W1 weights 10,9,8,7,6,5, in ascending-value
order. Each higher initial multiplier remains strictly rarer within its type.

Reel car weights are balanced toward more W2/W1 variety: base W1 0.26,
W2 0.24, W3 0.32; bonus W1 0.78, W2 0.60, W3 0.70. Bonus reels use higher
weights for every car type. Reel IDs `speed_trap_base_v4` and
`speed_trap_bonus_v11` regenerate cached strips.
These are strip-generation weights, not published arrival shares, which also
depend on legal-board rejection and payout optimization. Rebuilt weighted
books have W3 at roughly 47-60% of car arrivals, W2 near 25-37%, and W1 near
14-21% (5-8% of bought-bonus trigger-spin cars). Purchased Normal/Super/Hidden
bonuses average 2.080/2.877/3.997 new cars, excluding trigger-spin cars carried
into the bonus.

| Car | Initial multipliers |
| --- | --- |
| W3 | 2, 3, 4, 5 |
| W2 | 6, 7, 8, 9, 10, 12, 14, 15 |
| W1 | 20, 25, 30, 35, 40, 50 |

| Symbol | 3 matches | 4 matches | 5 matches |
| --- | ---: | ---: | ---: |
| H1 | 2.5 | 5 | 10 |
| H2 | 1 | 2 | 4 |
| H3 | 0.8 | 1.5 | 3 |
| H4 | 0.5 | 1 | 2 |
| L1 | 0.2 | 0.6 | 1.2 |
| L2 | 0.2 | 0.6 | 1.2 |
| L3 | 0.1 | 0.5 | 1 |
| L4 | 0.1 | 0.5 | 1 |

## Payout shapes

[payoutShape.ts](src/payoutShape.ts) holds equal-weight averages of ButchEm and
PandaFeasting's published whole-mode probabilities and conditional payout means
in these bands: 0.01-1x, 1-2x, 2-5x, 5-10x, 10-20x, 20-50x, 50-100x,
100-200x, 200-500x, 500-1000x, 1000-2000x, 2000-5000x, and 5000-10000x.
Upper endpoints are exclusive; 10000x has its own exact-max band.

Non-max probabilities are scaled proportionally to each mode's configured
nonzero hit rate: 20%, 24%, 25%, 78%, and 100% for the three buys. Reference
means are scaled together within the bands to fund exactly 96% RTP after the
fixed max-win contribution. Each optimizer target pins both probability and
conditional mean, preventing the former broad buckets from concentrating
return at their lower or upper boundaries.

Optimizer targets partition payout bands by entry tier as well as payout.
The tier slices preserve each reference band's total probability and mean,
while pinning actual bonus frequencies. Simulation acceptance verifies the
event-generating tier and target coverage, so ordinary-win pools cannot
silently contribute bonus entries (or vice versa). Empty legacy pools are
excluded. Natural tiers draw from the highest eligible bands first; FeatureSpin
spreads its much rarer entries across bands above each tier's minimum.
Bought bonus distributions match the reference games' shapes; natural and
FeatureSpin shapes are adapted to Speed Trap's configured hit rates.

| Mode | Normal bonus | Super bonus | Hidden bonus |
| --- | ---: | ---: | ---: |
| Base | 1 in 300 | 1 in 3,000 | 1 in 62,500 |
| ExtraChance | 1 in 150 | 1 in 1,500 | 1 in 31,250 |
| ExtraChance2 | 1 in 60 | 1 in 600 | 1 in 12,500 |
| FeatureSpin | 1 in 1,500 | 1 in 15,000 | 1 in 312,500 |

These are final optimized probabilities, not reel-draw or simulation quotas.
FeatureSpin retains minimum total payouts of 120x/450x/1600x for
Normal/Super/Hidden, including the trigger spin, with no top-ups.
Run `pnpm --filter speed-trap audit:bonus-odds` after rebuilding to verify actual
event-derived bonus frequencies against published weights, as well as minimums,
RTP, whole-mode payout bands, and exact-max odds. The audit also reconstructs
every spin using start-cell-only wilds and verifies each capped line award.

Run `pnpm analyze --build-dir examples\speed-trap\__build__` for a weighted
whole-mode and per-bonus report in `Math Mode Analysis`.

## Exact max wins

Every mode has a dedicated `[10000, 10000]` result set with `forceMaxWin` enabled.
Max-win odds follow ButchEm and PandaFeasting: Base 1 in 4,000,000,
ExtraChance 1 in 3,200,000, ExtraChance2 1 in 2,800,000, and FeatureSpin
1 in 60,000. Bonus buys use `0.01 * (0.96 * cost - floor) / (10000 - floor)`
as their exact-max probability: approximately 1 in 10,525 for Normal,
1 in 3,594 for Super, and 1 in 1,093 for Hidden.
Other payout bands exclude 10000x.

Dedicated max-win candidates enter a real bonus with the bought tier, Hidden
for natural modes, or Normal for FeatureSpin. FeatureSpin's 1-in-60,000 max
probability exceeds its 1-in-312,500 Hidden entry probability, so its max pool
must not be assigned exclusively to Hidden. Upper-tail coverage also uses real triggered bonuses.
Bonus sampling mixes natural stops with two edge cars and intervening H1s
on existing stops in rows without sticky cars, respecting the landing limit.
The left edge prefers W3 and the right edge W1, falling back to other car
types only when absent, preserving mixed-tier upper-tail coverage as strips
change. Non-max upper-tail pools use these conditioned stops 60% of the time;
the remaining draws use normal stops. Bought-bonus tails are split into
1000-1999.99x and 2000x+ pools so high-tail sampling still covers the low end
of the 1000-2000x payout band.
Exact-max sampling uses the conditioned stops whenever an empty row remains.
Car movement, collisions,
cameras, multiplier draws, and line evaluation
still run normally; payouts above the cap are truncated to exactly 10000x.
No symbols or multipliers are invented and no max-win top-up is awarded.

Only wild multipliers greater than 1 are summed on a winning line, without an
extra base 1x. If none qualify, the line pays at 1x. Ordinary `W` symbols are
created at moving cars' starting cells and every cell they cross; they cannot
land naturally on base or bonus reels. Final car symbols replace trail wilds
at their endpoints. Trail wilds are unmultiplied.
Simulation results must include the dedicated exact-max criteria and coverage
of each payout band. Existing broad simulation pools support the new shape
targets, so probability and mean changes require only optimization.

The optimizer tilts payouts within each band to reach its target mean. Adding
simulation runs cannot fix a target whose probability-weighted maximum payout
is below the required average; its probability budget must be corrected first.

## Frontend event contract

Added pairs balance inward and outward placements. Two new cars on one row can only both
move before meeting when at least two cells separate them (reels 0+3, 0+4, or
1+4), so only such pairs steer inward, with preference 0.50. Two new cars on
the same row always drive in opposite directions, toward or away from each
other. Unlocked close pairs drive apart; pairs incompatible with forced edge
directions, scatter avoidance, or the minimum movement distance are retried.
Same-direction/rear-end collisions are not allowed; `newNew` crashes are always
reciprocal head-ons. Existing sticky cars can still intercept new cars.
When an interior car has a reachable pre-spin sticky
target only on one side, that direction has probability 0.65. Forced edge
directions and paid-spin scatter avoidance always take priority.

After the strip draw, a lone new car with an open lane may get an oncoming
partner car on its row: probability 0.27 on paid spins and 0.73 in free spins.
Free spins without a compatible opposing pair can also add a fresh pair on an open
row with probability 0.20/0.09/0 for Normal/Super/Hidden. Added cars use a
W3/W2/W1 mix of 40/30/30, never replace scatters or cars, and never cross sticky
cars or (on paid spins) scatters. These are generation probabilities; published
rates depend on board coverage and optimized book weights. Pushing the Normal
pair chance much higher prevents sub-10x Normal bonuses and makes the required
payout shape infeasible.

When both placement types are available, added pairs choose 50% inward
(reels 0+3, 0+4, 1+4) and 50% outward (reels 1+3), then choose uniformly
within that type. Outward lanes must be clear through both edges. If only one
type is legal, use it. Edge direction locks and opposite-direction requirements
can force inward motion regardless of steering preference. These generation
preferences do not imply a 50% collision rate in optimized books.

For a standalone AI-agent handoff with complete example payloads for all nine
event types, optional variants, and implementation checks, see
[FRONTEND-EVENTS.md](FRONTEND-EVENTS.md).

Books contain ordered `{ type, data }` events. Coordinates are zero-based on an
unpadded 5-reel, 4-row board; `board[reel][row]` is column-major. Payout amounts
are base-bet multipliers, not cents or multiples of the selected mode's cost.
The book's top-level `payoutMultiplier`, unlike event amounts, stores x100.

### Spin playback

1. `reveal`: render `board`, `anticipation`, and the full `cameraStatus` array
   (`{ reel, active }` for all five reels). Each cell has `name` and optional
   `Wild`, `Scatter`, and `multiplier`. Sticky cars show their current multiplier;
   newly landed cars initially show 1 and receive their actual multiplier in
   `carMove`. During free spins, `newlyActivatedCameras` lists the reels activated
   by this reveal's scatters (possibly empty). `anticipation` is always all
   zeroes during free spins in every bonus tier.
2. `carMove`: animate only the newly landed cars. Each car contains
   `start`, `end`, `direction` (`"left"` or `"right"`), `initialMultiplier`,
   `multiplierAfterMove`, the final `multiplier`, and `collision`. Animate rows
   0 through 3 in order, with same-row cars moving together. Show `initialMultiplier`,
   apply moving-car camera doubles, then use `multiplierAfterMove` on collision.
   Later rows may double that settled car again; `multiplier` is its end-of-spin
   value. A mutual crash combines
   each pair only once.
   Read the car symbol from the preceding reveal at `start`. Positions specify
   a straight horizontal movement, so no path is serialized. Each new car must
   move at least one cell before stopping; at most two new cars land per row.
   Existing sticky cars do not count toward that limit. Invalid candidates are
   retried before events are emitted. `collision.kind` is `edge`, `newNew`, or
   `newSticky`; car crashes include `withStart` and `withPosition` identifying
   the partner's original and final cells. Use the supplied final
   multiplier rather than computing collision arithmetic on the frontend.
3. If present, `carMove.cameraFlashes` contains
   `{ reel, triggeringCar: { start, before, after }, doubledCars }` entries.
   Match `triggeringCar.start` to the crossing car's `start` for flash timing.
   Its `before` and `after` describe its own camera double before crash addition.
   Animate each actual flash and update each listed sticky car at `position`
   from `before` to `after`. Absence means no flash. An actual flash can have
   `doubledCars: []` if there is no eligible sticky car on that reel.
   `carMove` does not repeat `cameraStatus`.
4. `winInfo` and `setWin` appear only for a positive spin payout. Highlight the
   provided winning positions on the resolved board and use the authoritative
   `winInfo.totalWin` / `setWin.amount`; these are already capped. No second
   reveal is sent after movement.

To reproduce the evaluated board, write an unmultiplied `W` at each moving
car's starting cell and every cell through its endpoint, then place all cars
at their final positions. Camera flashes still follow the entire
path, including the starting reel. Existing sticky cars remain in
place. Save the original reveal before processing any moves so symbols can be
looked up reliably even when paths overlap. Only final car positions and their
multipliers persist between free spins; trail wilds do not persist.

Example `carMove` without a flash:

```json
{
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 0, "row": 1 },
        "end": { "reel": 4, "row": 1 },
        "direction": "right",
        "initialMultiplier": 5,
        "multiplierAfterMove": 5,
        "multiplier": 5,
        "collision": { "kind": "edge" }
      }
    ]
  }
}
```

### Cameras and bonus lifecycle

- Paid spins start with all cameras off except FeatureSpin's 1-5 random cameras.
  A bonus emits `freeSpinTrigger` with
  `tier`, `totalFs: 10`, and `initialCameraStatus`. Normal starts with no active
  added cameras, Super adds one random inactive camera, Hidden adds two.
  Inherited FeatureSpin cameras do not count toward those additions, which are
  capped by the available inactive reels. Bought bonuses
  first play a trigger spin landing exactly 3/4/5 scatters for Normal/Super/Hidden,
  then emit this event, just like natural entries. Trigger-spin line wins count
  toward the round/bonus total; the trigger spin does not consume a free spin.
  Keep the trigger spin's final car endpoints and multipliers as stationary
  sticky cars from free spin 1, for both natural and bought bonuses. Trails
  and leftover start-cell wilds do not carry over.
- Each free spin starts with `updateFreeSpin` (`amount` is the spin number
  played, not remaining spins; `total` is 10), followed by the spin events above.
- A scatter visible in a free-spin reveal activates that reel's camera for the
  rest of the bonus. Free-spin scatters can land only on inactive-camera reels:
  at most one per reel per spin, and at most one landing per reel per bonus.
  Initially active cameras also block scatters. Trigger-spin scatters do not
  count against this free-spin limit.
  `cameraStatus` already includes this activation, and
  `newlyActivatedCameras` identifies which activation animations to play.
- **Camera activation happens before movement.** Newly activated cameras can
  flash immediately when a new car enters their reel on that same spin. A car
  landing on an active-camera reel also flashes that camera as it pulls away.
- Cars may cross scatters during free spins: activate cameras using the original
  reveal first, then animate movement and start-cell wilds. Crossed scatters
  remain unless a final car position covers them; camera activation persists.
  Paid spins still preserve scatters and avoid routes that cross them.
- Each active camera flashes once for **each car that starts on or crosses its
  reel**.
  Several cars can therefore trigger the same camera repeatedly within a spin,
  doubling existing sticky multipliers each time (e.g. 30 -> 60 -> 120).
  The moving car doubles at its active starting reel first, then at each entered
  active camera, including its endpoint. Each row finishes camera doubles and crash addition
  before the next row moves. Pre-spin sticky cars and cars settled on earlier
  rows receive `doubledCars` updates on that reel. Lower-row cars waiting to move
  receive them at their starting cells, retaining those doubles when their row
  begins. Their own starting camera then doubles them again. Same-row new cars
  do not receive stationary doubles. Initialize labels from `initialMultiplier`
  once before row playback; do not reset them at the start of each row.
  `cameraFlashes` can contain repeated reel numbers: process every entry in
  array order, applying each `after` value rather than deduplicating by reel.
  Entries are grouped by row, then car and traversed reels, not
  a frame-by-frame movement timeline. Apply all updates before showing wins.
  Active cameras and sticky multipliers persist until bonus end.
- `setTotalWin` updates the accumulated bonus total after each spin, including
  any paid trigger win. All payouts come from line wins: there are no top-ups
  and no `bonusFloorApplied` event. Simulation rejects and retries candidates
  below the entry route's minimum, including organic bonus entries in other
  coverage pools, rather than adding an artificial award.
- `freeSpinEnd` supplies the bonus total and win level; `finalWin` supplies the
  entire round payout. A 10000x cap can end the bonus before all ten spins.
  Reset camera/sticky state before the next paid round. A zero-paying round
  has no `finalWin`.

The simplified event schema requires fresh books: run
`pnpm --filter speed-trap build` before serving the new events in the panel or
frontend. Optimization alone changes weights, not existing event payloads.
