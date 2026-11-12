# Speed Trap: current frontend implementation handoff

Updated: 2026-11-09. This document is standalone and can be given directly to
an AI agent implementing the frontend in another repository.

## Implementation brief

Implement animation and UI playback from the ordered server event stream.
The server determines all outcomes. Do not simulate movement, roll multipliers,
choose camera reels, calculate awards, or add minimum-payout top-ups.

Important current rules:

- Ordinary `W` symbols never land naturally, in any mode. Moving cars create
  them at their starting cells and every crossed cell. Only `W1`, `W2`, and `W3`
  are naturally landing car wilds.
- At most two **new** cars land on a row per spin. Existing sticky cars do not
  count toward this limit. Every new car moves at least one cell before stopping.
- `carMove` supplies initial and final multipliers, plus explicit collision
  information. It does not supply paths, car symbols, or camera status.
- Free-spin scatters activate cameras **before movement**. Those cameras can
  flash immediately, even if a car then drives over the scatter.
- Each crossing car can trigger an active camera. Multiple flashes per camera
  per spin are valid. A car landing on an active-camera reel flashes it as it
  pulls away; `cameraFlashes[].reel` can equal `triggeringCar.start.reel`.
  The moving car doubles at that start flash and every entered active camera.
  Stationary cars on that reel also double: pre-spin sticky cars and cars that
  finished moving on earlier rows this spin, plus lower-row cars still waiting
  at their starting cells.
- Animate rows 0, 1, 2, 3 in order. All new cars on a row move together, finish
  their camera doubles and crash addition, then become eligible for later rows'
  flashes at their endpoints. Same-row new cars are not stationary-double targets.
  Lower-row new cars are already eligible at their starting cells before moving.
- Winning-line multipliers sum only wild multipliers **greater than 1**.
  There is no extra base 1x when qualifying multipliers exist.
- All payouts come from line wins. There are no top-up events or awards.

## 1. Transport and units

A published book has `id`, `payoutMultiplier`, and an `events` array. Every event
has `{ "index": number, "type": string, "data": object }`.

- `index` starts at 1. Process events in array order; never use fixed indices
  to identify an event type.
- Event payout amounts are in **base-bet x**, not currency or selected-mode-cost
  multiples. At a $0.20 base bet, `amount: 72` means $14.40.
- Book-level `payoutMultiplier` is scaled by 100: `7200` means 72x.
  `1000000` means the 10000x round cap.
- Car multipliers and `winInfo.wins[].meta.multiplier` are dimensionless.
- Board dimensions are 5 reels by 4 rows, column-major: `board[reel][row]`.
- Coordinates are zero-based: reels 0-4, rows 0-3 from top to bottom.
- Symbol IDs are `H1`, `H2`, `H3`, `H4`, `L1`, `L2`, `L3`, `L4`,
  `W`, `W1`, `W2`, `W3`, and `S`.
- `Wild` and `Scatter` are case-sensitive flags. Missing flags mean false.

Mode is external round context, not repeated in each event:

| Mode ID | Cost in base-bet x | Entry |
| --- | ---: | --- |
| `base` | 1 | Paid spin |
| `extraChance` | 1.5 | Paid spin |
| `extraChance2` | 3 | Paid spin |
| `featureSpin` | 50 | Paid spin with 2-8 new cars and 1-5 random active cameras |
| `bonusFeature` | 100 | Normal bonus buy |
| `superBonusFeature` | 300 | Super bonus buy |
| `hiddenBonusFeature` | 1000 | Hidden bonus buy |

Target RTP is 96% for every mode. Do not implement probability selection in
the frontend.

### Current paytable and initial car multipliers

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

| Car | Allowed initial values | Relative weights in the same order |
| --- | --- | --- |
| W3 | 2, 3, 4, 5 | 6, 5, 4, 3 |
| W2 | 6, 7, 8, 9, 10, 12, 14, 15 | 11, 10, 9, 8, 7, 6, 5, 4 |
| W1 | 20, 25, 30, 35, 40, 50 | 10, 9, 8, 7, 6, 5 |

Higher initial values are strictly rarer within each type. These are starting
values only: camera doubles and crash addition can produce other final values.
Do not roll these values in the frontend.

FeatureSpin starts its paid reveal with 1-5 random active cameras and 2-8
new cars, at most two per row. Cameras and final cars persist into any triggered bonus.
Tier entry adds new cameras on distinct inactive reels: Normal 0, Super 1,
Hidden 2. First free-spin guarantees are Normal 0, Super 1, Hidden 2 **new**
cars, excluding inherited sticky cars. Thus FeatureSpin enters Normal/Super/Hidden
with 1-5/2-5/3-5 initially active cameras respectively, before free-spin scatters.
Additions are capped by the available inactive reels.
Use the supplied snapshots rather than assuming a bonus resets its cameras.

## 2. State to maintain

Keep:

1. An immutable copy of the current original reveal.
2. A separate working board for start-wild and final-car rendering.
3. Sticky-car positions, symbols, and multipliers from previous free spins.
4. Active camera reels and bonus tier.
5. Played/total free spins, current spin win, and accumulated round total.

Reset feature state before a new paid round. On bonus entry retain the trigger
spin's final car endpoints, original car symbols, and final multipliers as
stationary sticky cars. Trails and leftover start-cell wilds do not carry over.
Initialize cameras from `freeSpinTrigger.initialCameraStatus`. This applies to
all natural entries and bonus buys; the inherited cars are eligible for camera
doubling on free spin 1 and never appear as newly moving cars there.

The JSON examples below are **independent illustrations**, not one consecutive
round. Do not concatenate them into a playback fixture.

## 3. All nine event types

### 3.1 `reveal`

```json
{
  "index": 1,
  "type": "reveal",
  "data": {
    "board": [
      [{"name":"H3"},{"name":"L2"},{"name":"L1"},{"name":"L4"}],
      [{"name":"H1"},{"name":"W1","Wild":true,"multiplier":1},{"name":"H2"},{"name":"H3"}],
      [{"name":"L3"},{"name":"L4"},{"name":"H2"},{"name":"L4"}],
      [{"name":"L1"},{"name":"L2"},{"name":"H1"},{"name":"L3"}],
      [{"name":"S","Scatter":true},{"name":"H2"},{"name":"L2"},{"name":"L4"}]
    ],
    "anticipation": [0,0,0,0,0],
    "cameraStatus": [
      {"reel":0,"active":false},
      {"reel":1,"active":false},
      {"reel":2,"active":false},
      {"reel":3,"active":false},
      {"reel":4,"active":false}
    ]
  }
}
```

- Render this board and save the immutable copy.
- `cameraStatus` is always the full five-reel snapshot. Apply it before cars move.
- Every free-spin reveal also includes `newlyActivatedCameras`, for example
  `[2]` or `[]`. Paid reveals omit that field.
- On a free spin, a scatter on reel 2 activates reel 2's camera before movement;
  that reveal already reports reel 2 as active.
- Free-spin scatters can land only on inactive-camera reels: at most one per
  reel per spin, and once per reel across the whole bonus. Initially active
  cameras also prevent scatter landings. Paid trigger-spin scatters do not
  consume this allowance. When all cameras are active, no more scatters land
  during that bonus, even if an earlier scatter was overwritten by a car.
- New cars reveal with a **placeholder** multiplier of 1. Use the subsequent
  `carMove.initialMultiplier` for their actual starting labels.
- Existing sticky cars reveal with their current multipliers.
- `anticipation` has one 0/1 value per reel; 1 means earlier reels already
  revealed at least two scatters. It is an animation hint, not a trigger.
  This applies only to base/bonus-entry spins. Every free-spin reveal in every
  bonus tier always supplies `[0,0,0,0,0]`: scatters activate cameras, not anticipation.
- Natural reel reveals do not contain ordinary `W` start-cell wilds.

### 3.2 `carMove`

```json
{
  "index": 2,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": {"reel":1,"row":1},
        "end": {"reel":4,"row":1},
        "direction": "right",
        "initialMultiplier": 35,
        "multiplierAfterMove": 35,
        "multiplier": 35,
        "collision": {"kind":"edge"}
      }
    ]
  }
}
```

This example can follow the paid reveal above.

- A `carMove` follows a reveal only when at least one new car lands. Spins
  without new cars have no `carMove`; `cars` is never empty.
- Read each car's symbol from the original reveal at `start`.
- Cars move horizontally on the same row. Interpolate from `start` to `end`;
  there is no `path` field. Every new car travels at least one cell.
- Display `initialMultiplier` before travel, apply `triggeringCar` camera doubles,
  then `multiplierAfterMove` at the row's crash/stop. The final `multiplier` also
  includes stationary doubles caused by later rows. Do not display that final
  value prematurely or apply later flashes twice.
- Do not assume a final multiplier can be inferred from collision kind alone.
- There is no `symbol` or `cameraStatus` inside this event.
- `cameraFlashes` is optional and omitted when no camera flashed.

#### Collision kinds and partner lookup

| Kind | Meaning | Additional fields |
| --- | --- | --- |
| `edge` | This car stopped at the row boundary | None |
| `newNew` | This car hit another car landed this spin | `withStart`, `withPosition` |
| `newSticky` | This car hit a car sticky before this spin | `withStart`, `withPosition` |

For `newNew`, match `withStart` to another moving entry's `start`;
`withPosition` is that partner's final cell. For `newSticky`, both coordinates
identify the stationary sticky partner. Every `newNew` pair is reciprocal: each
car's `withStart` is the other's `start`, identifying a head-on crash. Two new
cars on a row always drive in opposite directions, toward or away from each
other; same-direction/rear-end collisions are not emitted. Head-ons are now
common, especially in bonuses, so make that animation a highlight. The event
schema is unchanged.

Two new cars combine their multipliers once, and both show the combined value.
A collision into a pre-existing sticky car does **not** add the two multipliers;
the moving car retains its own camera-adjusted multiplier. Sticky-camera
doubling is separate.

Mutual-crash example:

```json
{
  "index": 2,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start":{"reel":0,"row":0},
        "end":{"reel":2,"row":0},
        "direction":"right",
        "initialMultiplier":6,
        "multiplierAfterMove":8,
        "multiplier":8,
        "collision":{
          "kind":"newNew",
          "withStart":{"reel":4,"row":0},
          "withPosition":{"reel":3,"row":0}
        }
      },
      {
        "start":{"reel":4,"row":0},
        "end":{"reel":3,"row":0},
        "direction":"left",
        "initialMultiplier":2,
        "multiplier":8,
        "multiplierAfterMove":8,
        "collision":{
          "kind":"newNew",
          "withStart":{"reel":0,"row":0},
          "withPosition":{"reel":2,"row":0}
        }
      }
    ]
  }
}
```

Animate one `6 + 2 = 8` collision, not two additions. Each car displays 8x.

New cars on the same row travel in opposite directions. `newNew` crashes
always have reciprocal references; same-direction/rear-end crashes are not emitted.

Sticky-crash variant:

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start":{"reel":4,"row":0},
        "end":{"reel":2,"row":0},
        "direction":"left",
        "initialMultiplier":2,
        "multiplier":2,
        "multiplierAfterMove":2,
        "collision":{
          "kind":"newSticky",
          "withStart":{"reel":1,"row":0},
          "withPosition":{"reel":1,"row":0}
        }
      }
    ]
  }
}
```

#### Reconstructing the resolved board

Use the immutable reveal for all start-symbol lookups, even when paths overlap.

1. Copy the revealed board into a working board.
2. For every moving car, write an unmultiplied `W` into its starting cell and
   every crossed cell through its endpoint. Paint the full path wild.
3. After writing **all** trail wilds, place **all** moving cars at their endpoints
   with their original symbols and final multipliers.
4. Leave pre-existing sticky cars in place and apply their camera updates.

Only final car positions receive the car's final multiplier.
Camera flashes still follow the complete movement path, including the start.
The event schema is unchanged, but board reconstruction must use this rule.
There is no second reveal after movement.

Only final car endpoints persist as sticky cars into the next free spin.
Trail wilds do not independently persist.
The next reveal supplies the new authoritative board.

Paid-spin cars do not cross scatters. Free-spin cars may cross/overwrite them
because camera activation has already been processed.

#### Camera flashes and repeated doubling

Example: two new W3 cars traverse reel 2 on different rows; a pre-existing
sticky car on reel 2, row 1 starts at 30x.

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start":{"reel":0,"row":0},
        "end":{"reel":4,"row":0},
        "direction":"right",
        "initialMultiplier":2,
        "multiplier":4,
        "multiplierAfterMove":4,
        "collision":{"kind":"edge"}
      },
      {
        "start":{"reel":0,"row":2},
        "end":{"reel":4,"row":2},
        "direction":"right",
        "initialMultiplier":2,
        "multiplier":4,
        "multiplierAfterMove":4,
        "collision":{"kind":"edge"}
      }
    ],
    "cameraFlashes": [
      {
        "reel":2,
        "triggeringCar":{"start":{"reel":0,"row":0},"before":2,"after":4},
        "doubledCars":[
          {"position":{"reel":2,"row":1},"before":30,"after":60}
        ]
      },
      {
        "reel":2,
        "triggeringCar":{"start":{"reel":0,"row":2},"before":2,"after":4},
        "doubledCars":[
          {"position":{"reel":2,"row":1},"before":60,"after":120}
        ]
      }
    ]
  }
}
```

- Entering an active camera reel triggers a flash. Merely starting there does
  not count; entering and stopping there does.
- Never deduplicate flashes by reel. Apply each update in array order.
- Use `before` for the animation and set the multiplier to `after`.
- A real flash may contain `"doubledCars": []`. Still animate the flash.
- `triggeringCar.start` identifies the crossing car by matching its `cars[].start`.
  Animate its `before -> after` camera double. Entering and stopping counts;
  starting on an active camera flashes and doubles as the car pulls away.
- Complete a row's camera doubles before crash addition. A 6x car crossing
  two cameras and a 2x partner crossing one combine as `24 + 4 = 28`.
- `doubledCars` contains pre-spin sticky cars and cars settled on **earlier rows**.
  It also contains **later-row cars waiting at their starts**. Same-row new cars
  cannot receive these stationary updates. Every flash can double an eligible
  car again, including a waiting car's own start flash once its row begins.
- Multiple eligible sticky cars on the flashing reel can all be updated.
- Flash entries are grouped by row (top-to-bottom), then car and traversed reel;
  they are not a frame-by-frame movement timeline. Associate them by
  `triggeringCar.start`; no separate car ID is needed.
- Apply all movement and camera updates before displaying wins.

#### Row-by-row playback and later-row flashes

`cars` is ordered by row, then starting reel. Run same-row car animations
together; do not animate all four rows at once. `cameraFlashes` is grouped by
triggering row, then car and traversed reel, not a simultaneous-tick timeline.
Filter by `triggeringCar.start.row` while playing a row.

Initialize all new cars from `initialMultiplier` before playing any row.
Do not reset that value when a waiting car begins moving: preserve prior flashes.
For each row:

1. Animate its cars and their `triggeringCar.before -> after` camera doubles.
2. Apply each flash's `doubledCars` updates to pre-spin sticky cars and earlier
   completed rows at their endpoints, and later rows at their starting cells.
   Use the supplied `before`/`after`, not inferred arithmetic.
3. Resolve same-row crashes after camera doubles. Set each car to its supplied
   `multiplierAfterMove`. Deduplicate reciprocal crash partners.
4. Make that entire row stationary/eligible before playing the next row.
5. After all rows, verify displayed endpoints match `cars[].multiplier`.
   This is a final snapshot, not another award or another multiplier addition.

Example: three 2x cars on rows 0, 1, and 2 each drive from reel 0 to reel 4,
whose camera is active:

| Played row | Crossing car | Stationary updates from that flash |
| --- | --- | --- |
| 0 | 2 -> 4 | None |
| 1 | 2 -> 4 | Row 0: 4 -> 8 |
| 2 | 2 -> 4 | Row 0: 8 -> 16; row 1: 4 -> 8 |

Their `multiplierAfterMove` values are `[4,4,4]`, but end-of-spin `multiplier`
values are `[16,8,4]`. A car cannot receive a stationary double from its own
row, even if its movement animation finishes before its same-row partner.
Already-sticky cars anywhere on a flashing reel remain eligible on every row,
including sticky cars positioned below the currently moving row.

If two 2x cars instead start on active reel 2 on rows 0 and 1, row 0's start
flash doubles both cars to 4x. Row 1 later starts at 4x and its own flash
doubles it to 8x. `initialMultiplier` remains 2 for both cars; their
`multiplierAfterMove` values are 4 and 8 (assuming no other cameras or crashes).
Waiting-car updates use starting coordinates, not eventual endpoints. For
final-board reconstruction, only endpoint snapshots carry car multipliers;
never apply a waiting-car update to the unmultiplied `W` left at its start.

### 3.3 `winInfo`

```json
{
  "index": 3,
  "type": "winInfo",
  "data": {
    "totalWin": 9.6,
    "wins": [
      {
        "symbol":"L2",
        "kind":5,
        "win":9.6,
        "positions":[
          {"reel":0,"row":1},
          {"reel":1,"row":1},
          {"reel":2,"row":1},
          {"reel":3,"row":1},
          {"reel":4,"row":1}
        ],
        "meta":{"multiplier":8,"winWithoutMult":1.2}
      }
    ]
  }
}
```

- Present only for positive spin wins. Highlight supplied positions on the
  **resolved** board.
- `kind` is matched symbol count, **not a payline ID**.
- `symbol` is the paying symbol; an all-wild five-symbol line uses `H1`.
- `winWithoutMult` is the paytable amount; `multiplier` is the line multiplier.
  Here `1.2 * 8 = 9.6`.
- Only wild multipliers above 1 on the matched portion of a line are summed.
  `5 + 3 + 1 + 1` produces 8x, not 9x or 10x. A single 5x produces 5x.
  If none exceed 1, the multiplier is 1x. All-wild lines follow the same rule.
- Awards are capped to the remaining room under 10000x, so `win` may be less
  than `winWithoutMult * multiplier`. Always display supplied awards.

### 3.4 `setWin`

```json
{"index":4,"type":"setWin","data":{"amount":9.6,"winLevel":1}}
```

Shows the same current-spin award as `winInfo.totalWin`, not another payment.
Do not add them together.

### 3.5 `setTotalWin`

```json
{"index":20,"type":"setTotalWin","data":{"amount":144.5}}
```

Emitted after every free spin, including zero-paying spins. Set the accumulated
total to `amount`; it is not a delta. All bonus entries include the trigger
spin's win. Ordinary paid-only rounds do not emit this event.

### 3.6 `freeSpinTrigger`

```json
{
  "index":3,
  "type":"freeSpinTrigger",
  "data":{
    "tier":"super",
    "totalFs":10,
    "initialCameraStatus":[
      {"reel":0,"active":false},
      {"reel":1,"active":false},
      {"reel":2,"active":true},
      {"reel":3,"active":false},
      {"reel":4,"active":false}
    ]
  }
}
```

- `tier` is `normal`, `super`, or `hidden`; every tier starts with 10 free spins.
- Normal adds zero active cameras, Super one random inactive camera, Hidden two.
  Inherit all trigger-spin cameras as well; FeatureSpin therefore starts with
  1-5/2-5/3-5 total cameras respectively, capped at five. Use the supplied snapshot.
- Preserve the trigger spin's final cars as stationary sticky cars on entry,
  including their multipliers; do not clear them. Both natural and bought entries first play a
  trigger spin. Buys land exactly 3/4/5 scatters for Normal/Super/Hidden before
  this event; its line wins count toward the total, without consuming a free spin.
- Paid 3/4/5 scatter landings map to Normal/Super/Hidden, but **this event**
  authorizes entry. FeatureSpin may suppress an organic trigger; a paid spin
  already at the cap does not enter a bonus.
- Free-spin scatters activate cameras; they do not retrigger/add free spins.
- There are no trigger positions in this event. Use the preceding trigger
  reveal for scatter transition effects, including bought bonuses.

### 3.7 `updateFreeSpin`

```json
{"index":11,"type":"updateFreeSpin","data":{"amount":2,"total":10}}
```

Immediately precedes the free-spin reveal. `amount` is the current played-spin
number, starting at 1. Remaining after this spin is `total - amount`.
A max win may end the bonus before spin 10.

### 3.8 `freeSpinEnd`

```json
{"index":59,"type":"freeSpinEnd","data":{"amount":1011,"winLevel":6}}
```

Shows the full bonus/round total, including any paid trigger win. It is not
another award. Present even when the cap ends the bonus early.

### 3.9 `finalWin`

```json
{"index":60,"type":"finalWin","data":{"amount":1011}}
```

- Authoritative whole-round payout, not an increment.
- For bonus rounds it follows `freeSpinEnd` and has the same amount.
- Emitted only if the round pays more than zero.
- For a max win, `amount` is 10000. There is no separate `maxWin` event.
- A zero-paying round finishes at the end of the array, without `finalWin`.
- There are no separate `roundEnd`, `cameraActivate`, `cameraFlash`, or
  collision events.

## 4. Event ordering

Brackets below mean optional groups, not transport arrays.

Paid-only round:

```text
reveal
carMove
[winInfo -> setWin]
[finalWin]
```

Natural bonus:

```text
reveal                         paid trigger spin
carMove
[winInfo -> setWin]
freeSpinTrigger                retain trigger cars, initialize cameras
  updateFreeSpin
  reveal                       apply camera activations first
  carMove                      resolve movement and all camera updates
  [winInfo -> setWin]
  setTotalWin
  ...repeat free-spin group until finished or capped...
freeSpinEnd
finalWin
```

Bonus buys use the same full sequence, including trigger-spin `reveal`,
`carMove` when new cars land, and optional `winInfo -> setWin` before `freeSpinTrigger`.
Normal/Super/Hidden buys land exactly 3/4/5 scatters respectively.
That spin is part of the bought round, not an additional bet or one of its
10 free spins. Its line wins are included in all subsequent totals.

## 5. Win levels

`setWin` and `freeSpinEnd` use these thresholds in event-amount base-bet x:

| Level | Amount |
| --- | --- |
| 0 | 0 |
| 1 | Greater than 0, below 25 |
| 2 | 25 to below 50 |
| 3 | 50 to below 100 |
| 4 | 100 to below 200 |
| 5 | 200 to below 350 |
| 6 | 350 to below 10000 |
| 7 | 10000 |

## 6. Minimums are not frontend awards

The engine rejects simulation candidates whose naturally funded bonus totals
miss the route's minimum. It never tops them up. Minimums include the paid
trigger win where applicable:

| Entry route | Normal | Super | Hidden |
| --- | ---: | ---: | ---: |
| Natural Base / ExtraChance / ExtraChance2 | 16 | 87 | 1011 |
| Bonus buys | 1 | 10 | 50 |
| FeatureSpin bonus entry | 120 | 450 | 1600 |

Do not handle `bonusFloorApplied`, invent top-up events, or add money to satisfy
these numbers. Old books with that removed event are obsolete.

## 7. Frontend acceptance checklist

- Dispatch all nine events and surface malformed/unsupported events explicitly.
- Use the server's event stream, never local outcome generation.
- Keep original reveals immutable and reconstruct movement on a separate board.
- Read car symbols at original start positions; show actual initial multipliers
  from `carMove`, not reveal's 1x placeholder.
- Support left/right movement, overlapping paths, empty car lists, and all
  three collision kinds.
- Associate `newNew` crash partners using reciprocal references.
  Never combine a reciprocal pair twice.
- Do not add a sticky partner's multiplier on `newSticky`.
- Create one unmultiplied `W` at each moving car's start, not along its path.
  Do not generate natural `W`.
- Persist only final sticky endpoints across free spins.
- Activate cameras before movement; preserve activation after scatter overwrite.
- Animate every flash, including empty `doubledCars`; never deduplicate by reel.
- Apply moving-car camera doubles and repeated stationary `doubledCars` updates
  in row order. Enable newly settled cars only after their entire row finishes.
- Display supplied line multipliers and capped awards; do not add 1x wilds.
- Do not count `setWin`, totals, or summaries as extra awards.
- Handle zero-win stream endings and early 10000x bonus endings.
- Reset round/feature state before the next round.
- Play bought-bonus trigger reveals and their awards before the bonus transition;
  never jump directly from purchase to `freeSpinTrigger`.

For integration fixtures, use complete freshly rebuilt books from
`__build__/books_<mode>.jsonl`, not a mixture of these independent examples.
The current engine uses base v3 and bonus v10 reel-set IDs: no natural `W`,
increased bonus car frequency, and more W2/W1 variety. These changes and
start-reel flashes add no event fields.
Do not use earlier books with the previous math/event contract.
Rebuild after this camera change: crossing cars double, and earlier completed
rows become stationary-double targets. Every car now has `multiplierAfterMove`
for its row's completion, separate from end-of-spin `multiplier`.

Engine references, if this document is viewed inside the engine repository:
[events](src/events.ts), [game flow](src/onHandleGameFlow.ts),
[movement and cameras](src/feature.ts), [line evaluation](src/evaluations.ts),
[settings](src/settings.ts), and [reel generation](src/reels.ts).
