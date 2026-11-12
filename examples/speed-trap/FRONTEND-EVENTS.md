# Speed Trap frontend implementation handoff

Implement playback from the server's ordered event stream. Do not generate
outcomes, rerun game math, infer bonus entry from scatters, or recalculate awards
on the frontend. The examples below describe the current engine implementation,
including same-spin camera activation and repeated flashes.

FeatureSpin's paid spin lands 2-8 new cars (at most two per row) and starts with
1-5 random active cameras. Its final cars and cameras carry into any triggered bonus.
Tier entry adds 0/1/2 new cameras on inactive reels for Normal/Super/Hidden and
guarantees 0/1/2 new cars on free spin 1, excluding inherited cars.
FeatureSpin therefore enters Normal/Super/Hidden with 1-5/2-5/3-5 active cameras.
Camera additions are capped by the number of inactive reels available.

Initial multipliers (higher values have strictly lower probability):
W3 = 2,3,4,5 (weights 6,5,4,3); W2 = 6,7,8,9,10,12,14,15 (weights 11,10,9,8,7,6,5,4);
W1 = 20,25,30,35,40,50 (weights 10,9,8,7,6,5).
Final values may be larger through doubles and crash addition.

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

## 1. Transport, units, coordinates, and state

Published books have this envelope:

```json
{
  "id": 1,
  "payoutMultiplier": 7200,
  "events": [
    { "index": 1, "type": "reveal", "data": {} },
    { "index": 2, "type": "carMove", "data": {} }
  ]
}
```

This envelope shows structure only: the two empty `data` objects above are
placeholders, not valid event payloads. Complete payload examples follow.

- Published events contain a **1-based `index`**, `type`, and `data`. Consume
  the events in array order. The engine's internal hooks supply `{ type, data }`;
  serialization adds `index`.
- Event payout amounts are **base-bet multipliers**. For a base bet of $0.20,
  an event `amount: 72` pays $14.40, even in a 50x/100x/etc. cost mode.
- The book's `payoutMultiplier` is different: it is the round multiplier
  **multiplied by 100**. `7200` means 72x; `1000000` means the 10000x cap.
- Car multipliers and `winInfo.meta.multiplier` are dimensionless, not money.
- Coordinates are zero-based: `reel` is 0-4 and `row` is 0-3, top to bottom.
- Boards are column-major: **`board[reel][row]`**, five columns of four cells.
- Paying symbols: `L1`, `L2`, `L3`, `L4`, `H4`, `H3`, `H2`, `H1`.
  `W` is an unmultiplied start-cell wild, never a natural reel landing; `W1`, `W2`, `W3` are car
  wilds; `S` is a scatter.
- Property names are case-sensitive: `Wild` and `Scatter` have capital initials.
  When absent, treat those flags as false; the engine does not emit false flags.

Maintain round/bonus state separately from per-spin animation state:

- Latest original reveal, plus a separate working board for movement effects.
- Moving cars from the current `carMove`, and sticky cars from earlier free spins.
- Camera activation per reel and sticky-car multipliers per position.
- Bonus tier, total/free spins played, current spin win, and accumulated round win.
- Reset cameras and sticky cars before each paid round. On bonus entry initialize
  cameras from `initialCameraStatus`, but retain the trigger spin's final car
  endpoints, symbols, and multipliers as stationary sticky cars. Do not retain
  start-cell wilds. This applies to natural and bought bonuses.

The examples are illustrative payloads, **not one consecutive complete round**.
Their `index` values illustrate legal positions in a stream; they are not fixed
indices to use for event dispatch.

## 2. All nine event types

### 2.1 `reveal`: render the board and activate cameras

Example paid-spin reveal:

```json
{
  "index": 1,
  "type": "reveal",
  "data": {
    "board": [
      [{ "name": "H3" }, { "name": "L2" }, { "name": "L1" }, { "name": "L4" }],
      [
        { "name": "H1" },
        { "name": "W1", "Wild": true, "multiplier": 1 },
        { "name": "H2" },
        { "name": "H3" }
      ],
      [{ "name": "L3" }, { "name": "L4" }, { "name": "H2" }, { "name": "L4" }],
      [{ "name": "L1" }, { "name": "L2" }, { "name": "H1" }, { "name": "L3" }],
      [
        { "name": "S", "Scatter": true },
        { "name": "H2" },
        { "name": "L2" },
        { "name": "L4" }
      ]
    ],
    "anticipation": [0, 0, 0, 0, 0],
    "cameraStatus": [
      { "reel": 0, "active": false },
      { "reel": 1, "active": false },
      { "reel": 2, "active": false },
      { "reel": 3, "active": false },
      { "reel": 4, "active": false }
    ]
  }
}
```

Example free-spin reveal with two new cars, an existing sticky car, and a
scatter activating reel 2's camera:

```json
{
  "index": 12,
  "type": "reveal",
  "data": {
    "board": [
      [
        { "name": "W3", "Wild": true, "multiplier": 1 },
        { "name": "L2" },
        { "name": "W3", "Wild": true, "multiplier": 1 },
        { "name": "L4" }
      ],
      [{ "name": "H1" }, { "name": "L3" }, { "name": "H2" }, { "name": "H3" }],
      [
        { "name": "L3" },
        { "name": "W1", "Wild": true, "multiplier": 30 },
        { "name": "H2" },
        { "name": "S", "Scatter": true }
      ],
      [{ "name": "L1" }, { "name": "L2" }, { "name": "H1" }, { "name": "L3" }],
      [{ "name": "L1" }, { "name": "H2" }, { "name": "L2" }, { "name": "L4" }]
    ],
    "anticipation": [0, 0, 0, 0, 0],
    "cameraStatus": [
      { "reel": 0, "active": false },
      { "reel": 1, "active": false },
      { "reel": 2, "active": true },
      { "reel": 3, "active": false },
      { "reel": 4, "active": false }
    ],
    "newlyActivatedCameras": [2]
  }
}
```

Frontend handling:

- Render the original board, preserving a copy for later car-symbol lookups.
- `cameraStatus` is always a full five-reel snapshot, already including this
  reveal's activations. Apply it **before animating car movement**.
- `newlyActivatedCameras` is present on every free-spin reveal, including `[]`
  when no camera was newly activated. It is absent on paid-spin reveals.
- New cars reveal with `multiplier: 1`; their actual final multiplier comes
  in `carMove`. Existing sticky cars reveal their current multiplier.
- `anticipation` contains one 0/1 value per reel. A reel is marked 1 when
  earlier revealed reels already contained at least two scatters.
  It is an animation hint, **not** a bonus trigger or camera status.
  Only base/bonus-entry spins use this rule. All free-spin reveals always emit
  `[0, 0, 0, 0, 0]`, regardless of landed scatters or bonus tier.
- Scatters activate cameras only during free spins. Cameras stay active until
  bonus end, even if movement later overwrites the triggering scatter.
- New cameras can flash on this same spin. There is no separate activation event.
- Free-spin scatters land only on inactive-camera reels, at most one per reel
  per spin and once per reel across the bonus. Reels active at bonus entry
  cannot receive scatters either. Trigger-spin scatters do not use this limit.
  Once all cameras are active, subsequent free spins contain no scatters.

### 2.2 `carMove`: animate new cars, start-cell wilds, and camera flashes

No-camera-flash example, following the paid reveal above:

```json
{
  "index": 2,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 1, "row": 1 },
        "end": { "reel": 4, "row": 1 },
        "direction": "right",
        "initialMultiplier": 35,
        "multiplierAfterMove": 35,
        "multiplier": 35,
        "collision": { "kind": "edge" }
      }
    ]
  }
}
```

Repeated-flash example, following the free-spin reveal above:

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 0, "row": 0 },
        "end": { "reel": 4, "row": 0 },
        "direction": "right",
        "initialMultiplier": 2,
        "multiplier": 4,
        "multiplierAfterMove": 4,
        "collision": { "kind": "edge" }
      },
      {
        "start": { "reel": 0, "row": 2 },
        "end": { "reel": 4, "row": 2 },
        "direction": "right",
        "initialMultiplier": 2,
        "multiplier": 4,
        "multiplierAfterMove": 4,
        "collision": { "kind": "edge" }
      }
    ],
    "cameraFlashes": [
      {
        "reel": 2,
        "triggeringCar": { "start": { "reel": 0, "row": 0 }, "before": 2, "after": 4 },
        "doubledCars": [
          { "position": { "reel": 2, "row": 1 }, "before": 30, "after": 60 }
        ]
      },
      {
        "reel": 2,
        "triggeringCar": { "start": { "reel": 0, "row": 2 }, "before": 2, "after": 4 },
        "doubledCars": [
          { "position": { "reel": 2, "row": 1 }, "before": 60, "after": 120 }
        ]
      }
    ]
  }
}
```

Mutual-crash example: the W2 at reel 0 starts at 6x, and the W3 at reel 4
starts at 2x. Both move before stopping adjacent at reels 2 and 3;
both receive 8x. Use the initial values for the addition animation, not reveal's
1x placeholder. The two cars explicitly reference one another by original
landing position and final position.

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 0, "row": 0 },
        "end": { "reel": 2, "row": 0 },
        "direction": "right",
        "initialMultiplier": 6,
        "multiplierAfterMove": 8,
        "multiplier": 8,
        "collision": {
          "kind": "newNew",
          "withStart": { "reel": 4, "row": 0 },
          "withPosition": { "reel": 3, "row": 0 }
        }
      },
      {
        "start": { "reel": 4, "row": 0 },
        "end": { "reel": 3, "row": 0 },
        "direction": "left",
        "initialMultiplier": 2,
        "multiplier": 8,
        "multiplierAfterMove": 8,
        "collision": {
          "kind": "newNew",
          "withStart": { "reel": 0, "row": 0 },
          "withPosition": { "reel": 2, "row": 0 }
        }
      }
    ]
  }
}
```

Other valid variants:

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 4, "row": 0 },
        "end": { "reel": 0, "row": 0 },
        "direction": "left",
        "initialMultiplier": 3,
        "multiplierAfterMove": 6,
        "multiplier": 6,
        "collision": { "kind": "edge" }
      }
    ],
    "cameraFlashes": [{
      "reel": 2,
      "triggeringCar": { "start": { "reel": 4, "row": 0 }, "before": 3, "after": 6 },
      "doubledCars": []
    }]
  }
}
```

```json
{
  "index": 13,
  "type": "carMove",
  "data": {
    "cars": [
      {
        "start": { "reel": 4, "row": 0 },
        "end": { "reel": 2, "row": 0 },
        "direction": "left",
        "initialMultiplier": 2,
        "multiplier": 2,
        "multiplierAfterMove": 2,
        "collision": {
          "kind": "newSticky",
          "withStart": { "reel": 1, "row": 0 },
          "withPosition": { "reel": 1, "row": 0 }
        }
      }
    ]
  }
}
```

Frontend handling:

- A `carMove` follows a reveal only when at least one new car lands; it is
  omitted otherwise and `cars` is never empty. Sticky cars stay stationary.
- Each car has `start`, `end`, `direction`, `initialMultiplier`, `multiplierAfterMove`, `multiplier`,
  and `collision`. There is no `symbol`, `path`, or repeated camera snapshot.
- `collision.kind` is `"edge"`, `"newNew"`, or `"newSticky"`.
  `"edge"` means the car stops at the row boundary, without a partner.
  The other kinds include `withStart` (partner's original landing position)
  and `withPosition` (partner's final position). For a moving partner, match
  `withStart` to another entry's `start`; for a pre-existing sticky partner,
  both positions identify that sticky cell. Do not animate a shared pair twice.
- Two new cars on the same row always drive in opposite directions: toward
  each other or away from each other. Same-direction/rear-end collisions are
  not emitted. A `"newNew"` crash is always reciprocal: each entry's `withStart`
  is the other's `start`. Animate that head-on collision only once.
  Existing sticky cars can still intercept new cars (`"newSticky"`).
  Camera flashes can change edge cars' multipliers without a collision.
- Read the car symbol from the original reveal at `start`.
- The row never changes. Interpolate horizontally from start to end.
  Every new car moves at least one cell: `start !== end` in accepted books.
  At most two **new** cars land on each row in a spin; existing sticky cars
  do not count toward that landing limit. Illegal candidates are retried.
- Do not recalculate collision outcomes. The endpoint and multiplier are final.
- Play rows 0 through 3 in order, with same-row cars moving together.
  Display `initialMultiplier`, animate `triggeringCar` camera doubles, then
  use `multiplierAfterMove` at the row's crash/stop. Crash addition uses the
  camera-adjusted multipliers once per pair. `multiplier` is the end-of-spin
  value after any later-row stationary doubles; do not apply it prematurely.
- Build the resolved board in two passes: write an unmultiplied `W` at
  each moving car's `start` and every crossed cell through its `end`, then
  place all cars at their `end` with their original symbols and final
  multipliers. Paint the entire travel path wild. Existing sticky cars remain
  in place. There is **no second reveal** after movement. This changes board
  reconstruction, not the event schema; camera flashes still follow the full path.
- Only final car positions persist as sticky cars in free spins; their original
  trail wilds do not independently persist.
- Free-spin cars may cross scatters. Camera activation has already happened.
  Paid-spin candidate boards avoid crossing scatters.
- `cameraFlashes` is absent if no camera flashed; it is not emitted as `[]`.
- Each car starting on or entering an active camera's reel triggers one flash.
  A start-reel flash plays as the car pulls away, before its later flashes.
  Stopping on that reel after entering counts.
- Multiple cars can flash the same camera. **Do not deduplicate by reel.**
- A real flash may have `doubledCars: []`; still show its flash animation.
- The moving car doubles at its active starting reel and at each entered active
  camera, including its endpoint. `triggeringCar: { start, before, after }`
  identifies the flash source and supplies its pre-crash camera double.
- `doubledCars` contains pre-spin sticky cars and cars on earlier completed rows.
  It also includes new cars waiting on lower rows, at their **starting cells**.
  Same-row new cars do not receive stationary doubles.
  Waiting cars keep these doubles and double again at their own start-reel flash.
  Finish each row's camera doubles and crash addition before advancing.
- Process every `doubledCars` update in array order, using `after` as the new
  multiplier. The `before` value supports the doubling animation.
- Flash entries are grouped by row top-to-bottom, then car and traversed reel,
  not a frame-by-frame timeline. Match `triggeringCar.start` to a car's `start`.
  Do not assume one flash per spin or require a separate car ID.
- Apply all movement and camera updates before displaying wins.

Initialize all new cars from `initialMultiplier` before the first row moves.
Do not reset a waiting car to that value when its row begins: an earlier row
may already have doubled it. For example, two 2x cars starting on active reel 2
on rows 0 and 1 finish their moves at 4x and 8x: row 0 doubles the waiting car
2 -> 4 at its start, then row 1's own start flash doubles it 4 -> 8.
Waiting-car `doubledCars.position` is a playback position, not a sticky endpoint.
When reconstructing only the final board, do not transfer its multiplier onto
the unmultiplied start-cell `W`; use the moving car's final endpoint multiplier.

Row playback example: three 2x cars on rows 0, 1, 2 enter active camera reel 4
and stop there. Each has `multiplierAfterMove: 4`. Row 1's flash doubles row 0
to 8; row 2's flash doubles row 0 to 16 and row 1 to 8. Their final `multiplier`
values are 16, 8, 4. Use `multiplierAfterMove` when each row stops, then apply
later-row `doubledCars`; do not start from the final values and double again.
See the [row playback handoff](FRONTEND-HANDOFF-UPDATED.md#row-by-row-playback-and-later-row-flashes)
for the implementation sequence.

### 2.3 `winInfo`: display awarded payline wins

```json
{
  "index": 3,
  "type": "winInfo",
  "data": {
    "totalWin": 43.2,
    "wins": [
      {
        "symbol": "L2",
        "kind": 5,
        "win": 43.2,
        "positions": [
          { "reel": 0, "row": 1 },
          { "reel": 1, "row": 1 },
          { "reel": 2, "row": 1 },
          { "reel": 3, "row": 1 },
          { "reel": 4, "row": 1 }
        ],
        "meta": { "multiplier": 36, "winWithoutMult": 1.2 }
      }
    ]
  }
}
```

- Present only when this spin pays a positive amount.
- `totalWin` is this spin's award, not the accumulated bonus total.
- `wins` contains positive awarded wins only. `kind` is the matched symbol
  count, **not a payline ID**. No line ID is serialized; use `positions`.
- `symbol` is the paying symbol, including `H1` for an all-wild five-symbol line.
- `meta.winWithoutMult` is the paytable amount; `meta.multiplier` is the line
  multiplier. The example is `1.2 * 36 = 43.2`.
- Line multipliers use the game's additive wild rules, not multiplication of
  all car multipliers. Only wild multipliers greater than 1 are added, with
  no extra base 1x: `5 + 3 + 1 + 1` yields 8x, not 10x or 9x.
  If none exceed 1, use 1x. This also applies to all-wild lines.
  The frontend should not reproduce this math.
- Awards are capped to the remaining room under the 10000x round cap.
  Consequently, `win` can be less than
  `meta.winWithoutMult * meta.multiplier`. Display the supplied `win`.

### 2.4 `setWin`: display a spin award

```json
{ "index": 4, "type": "setWin", "data": { "amount": 43.2, "winLevel": 2 } }
```

- Normally follows `winInfo` with the same spin award.
- Do not add `winInfo.totalWin` and `setWin.amount` as separate winnings:
  they describe the same award.
- Use `winLevel` for celebration intensity. It is calculated from this event's
  amount in base-bet x, not the selected mode's cost.

### 2.5 `setTotalWin`: set the accumulated bonus total

```json
{ "index": 20, "type": "setTotalWin", "data": { "amount": 144.5 } }
```

- Emitted after every free spin, including zero-paying free spins.
- `amount` is an absolute total, **not a delta**.
- Includes the trigger spin's payout for both natural and bought bonus entry.
- Not emitted for an ordinary paid-only round.

### 2.6 `freeSpinTrigger`: enter a bonus

Normal example:

```json
{
  "index": 3,
  "type": "freeSpinTrigger",
  "data": {
    "tier": "normal",
    "totalFs": 10,
    "initialCameraStatus": [
      { "reel": 0, "active": false },
      { "reel": 1, "active": false },
      { "reel": 2, "active": false },
      { "reel": 3, "active": false },
      { "reel": 4, "active": false }
    ]
  }
}
```

Super example:

```json
{
  "index": 3,
  "type": "freeSpinTrigger",
  "data": {
    "tier": "super",
    "totalFs": 10,
    "initialCameraStatus": [
      { "reel": 0, "active": false },
      { "reel": 1, "active": false },
      { "reel": 2, "active": true },
      { "reel": 3, "active": false },
      { "reel": 4, "active": false }
    ]
  }
}
```

Hidden example:

```json
{
  "index": 3,
  "type": "freeSpinTrigger",
  "data": {
    "tier": "hidden",
    "totalFs": 10,
    "initialCameraStatus": [
      { "reel": 0, "active": true },
      { "reel": 1, "active": false },
      { "reel": 2, "active": true },
      { "reel": 3, "active": false },
      { "reel": 4, "active": false }
    ]
  }
}
```

- These are alternative entry examples, not three consecutive events.
- Normal adds zero active cameras, Super one random inactive camera, Hidden two.
  Trigger-spin cameras persist too: FeatureSpin enters with 1-5/2-5/3-5 active
  cameras respectively, capped at five. Use the supplied reel selections.
- Initialize the bonus counter and preserve the trigger spin's final cars as
  sticky cars, with their final multipliers. They do not move on free spin 1
  and are eligible for its camera flashes. Natural entries occur
  after a paid spin; bonus buys also play a trigger spin before `freeSpinTrigger`,
  landing exactly 3/4/5 scatters for Normal/Super/Hidden respectively.
- Paid 3/4/5 scatter landings map to Normal/Super/Hidden, but **the event is the
  authority** for starting a bonus. FeatureSpin can suppress an organic trigger;
  a paid round that already reached the cap does not start free spins.
- Free-spin scatters activate cameras; they do not award extra free spins.
- There are no trigger positions in this event. For all entries, use the
  preceding paid reveal if scatter positions are needed for transition effects.

### 2.7 `updateFreeSpin`: update the played-spin counter

```json
{ "index": 11, "type": "updateFreeSpin", "data": { "amount": 2, "total": 10 } }
```

- Emitted immediately before the free-spin reveal.
- `amount` is the current spin number, starting at 1.
  For a "spins remaining after this spin" display use `total - amount`.
- `total` is currently 10. A max win can end the bonus early.

### Minimum payouts: simulation acceptance, never top-ups

Every award comes from real line wins. Simulation rejects and retries bonus
candidates below their entry route's minimum; it never adds money to reach it.
This applies to both forced bonus coverage and organically triggered bonuses
inside other simulation criteria. These are selection rules, not frontend
awards or animation events.

Current minimums, including any paid trigger win:

| Route                                     | Normal | Super | Hidden |
| ----------------------------------------- | -----: | ----: | -----: |
| Natural Base / ExtraChance / ExtraChance2 |     16 |    87 |   1011 |
| Bonus buys                                |      1 |    10 |     50 |
| Entered from paid FeatureSpin             |    120 |   450 |   1600 |

`bonusFloorApplied` has been removed. Rebuild books before using this contract;
old books containing that event are obsolete. Do not implement top-up animations
or add amounts on the frontend.

### 2.8 `freeSpinEnd`: finish the bonus

```json
{ "index": 59, "type": "freeSpinEnd", "data": { "amount": 1011, "winLevel": 6 } }
```

- `amount` is the full bonus/round total, including the paid trigger win,
  funded entirely by line wins. It is not an additional payout.
- Present even if the 10000x cap ended the bonus before spin 10.
- Use it for the bonus-summary transition. It does not award more free spins.

### 2.9 `finalWin`: finish the entire round

```json
{ "index": 5, "type": "finalWin", "data": { "amount": 72 } }
```

Max-win variant:

```json
{ "index": 25, "type": "finalWin", "data": { "amount": 10000 } }
```

- `amount` is the authoritative whole-round payout, not an extra award.
- Appears only if the round pays more than zero.
- For bonus rounds it follows `freeSpinEnd` and has the same amount.
- There is no separate `maxWin`, `roundEnd`, `cameraActivate`, `cameraFlash`,
  or collision event. Detect max-win presentation from the supplied 10000x
  final payout; camera flashes are nested inside `carMove`.
- A zero-paying round finishes at the end of its event list with no `finalWin`.

## 3. Win-level thresholds

These are shared by `setWin` and `freeSpinEnd`:

| Level | Event amount in base-bet x |
| ----- | -------------------------- |
| 0     | 0                          |
| 1     | Greater than 0, below 25   |
| 2     | 25 to below 50             |
| 3     | 50 to below 100            |
| 4     | 100 to below 200           |
| 5     | 200 to below 350           |
| 6     | 350 to below 10000         |
| 7     | 10000 or more              |

The round cap is 10000x, so actual payouts cannot exceed it.

## 4. Event-order templates

Square brackets below mean optional groups, not literal arrays in the transport.

**Paid round without a bonus**, including standalone FeatureSpin:

```text
reveal
carMove
[winInfo -> setWin]
[finalWin]
```

**Natural bonus entry**:

```text
reveal                       paid trigger spin
carMove
[winInfo -> setWin]           paid spin award, if any
freeSpinTrigger
  updateFreeSpin
  reveal                     activate cameras first
  carMove                    move cars, process all flashes and sticky doubles
  [winInfo -> setWin]
  setTotalWin
  ...repeat free-spin group, up to 10 spins or until capped...
freeSpinEnd
finalWin
```

**Bonus buy**: the same sequence, including the initial trigger-spin `reveal`,
`carMove` when new cars land, and optional `winInfo -> setWin` before `freeSpinTrigger`. The trigger
spin lands exactly 3/4/5 scatters for Normal/Super/Hidden and does not consume
one of the 10 free spins. Its line wins are included in every subsequent total.

## 5. Frontend agent acceptance checklist

- Implement dispatch for all nine types above; validate received payloads and
  surface unsupported/malformed events instead of silently ignoring them.
- Keep server outcomes authoritative. Use animation state only for presentation.
- Render a 5x4 column-major board, with correct top-to-bottom row coordinates.
- Resolve car symbols from an immutable copy of the preceding reveal.
- Support empty car lists, explicit edge/sticky/new-car crash partners, leftward movement, and
  several cars whose paths overlap.
- Activate cameras before car animation, including same-spin activations.
- Preserve camera activation when a free-spin car overwrites its scatter.
- Support several flashes of one camera in a spin and chained sticky doubles.
- Show real flashes even when there are no sticky cars in `doubledCars`.
- Double each crossing car and apply repeated stationary updates to pre-spin
  sticky cars, earlier completed rows, and later-row cars waiting at their starts,
  never same-row new cars.
- Preserve final sticky-car multipliers across free spins; discard start-cell wilds.
- Apply `winInfo` to the resolved board, not the original reveal.
- Do not invent a payline ID or require one; use the provided win positions.
- Require every award to be backed by `winInfo`; there are no top-ups.
- Treat `setTotalWin`, `freeSpinEnd`, and `finalWin` as totals, not increments.
- Stop naturally at stream end, including zero wins and early max-win endings.
- Reset bonus/car/camera state before the next paid round.

For integration fixtures, copy complete real book objects from
`__build__/books_<mode>.jsonl`, not a mixture of the illustrative event examples.
Modes are `base`, `extraChance`, `extraChance2`, `featureSpin`, `bonusFeature`,
`superBonusFeature`, and `hiddenBonusFeature`. The mode is external round
context; individual gameplay events do not repeat it.

Engine source of truth:
[events](src/events.ts), [game flow](src/onHandleGameFlow.ts),
[movement and cameras](src/feature.ts), [evaluation](src/evaluations.ts),
and [settings](src/settings.ts). Rebuild books after gameplay/schema changes;
optimization alone does not regenerate their events.
