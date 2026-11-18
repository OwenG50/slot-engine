![Banner](.github/media/banner.png)

> [!NOTE]
> Slot Engine is a community project and is not affiliated with Stake.

# Slot Engine

TypeScript libraries for building slot games.

## Available Packages

### `@slot-engine/core`

Library for configuring and simulating slot games. Produces output compatible with Stake Engine / Stake RGS.

[📖 Documentation](https://slot-engine.dev/docs/core)  

### `@slot-engine/panel`

Web GUI for interacting with Slot Engine. Run simulations, view statistics, explore game files.

[📖 Documentation](https://slot-engine.dev/docs/panel)

### (WIP) `@slot-engine/lgs`

Local gaming server. Test your game locally without uploading to Stake Engine and save time during development.

[📖 Documentation](https://slot-engine.dev/docs/lgs)

## Contributing

See [the contributing guide](CONTRIBUTING.md) for more information.

## Finding natural bonus examples

To find naturally triggered bonuses, max wins, and ordinary spins across win
levels from a game build, run:

```sh
pnpm exec tsx scripts/find-natural-bonus-sims.ts --build-dir examples/speed-trap/__build__
```

By default, the script scans `base`, `extraChance`, `extraChance2`, and
`featureSpin` when their books exist. It reads the mode books and published
lookup-table weights, excludes bonus-buy modes,
and selects examples across weighted payout quantiles. It also includes 10 distinct
positive-weight max-win simulations per selected mode, labeled `maxwin` in the
`tier` column. These must pay exactly the `maxWin` cap in `frontend_config.json`,
not merely the highest available payout. Their quantile column is left blank;
the script fails explicitly if too few max-win examples exist.

Each mode also includes 10 payout-varied `ordinary` examples per available
non-max win level, including zero-payout losses. These never contain a bonus
trigger. The `winLevel` column comes from the game's total-payout `setWin` or
`freeSpinEnd` event (losses are level 0), not a cost-adjusted payout calculation.
Exact-cap outcomes are covered by `maxwin` rows rather than duplicated as ordinary
examples. Only levels present with positive published weights can be sampled;
if a level has fewer than 10 books, all are included and the shortfall is printed.
Missing non-max levels are also reported rather than substituting bonus wins
or inventing outcomes. Quantiles for ordinary rows are conditional on that mode
and win level.

SpeedTrap's FeatureSpin samples include its naturally triggered Normal, Super,
and Hidden bonuses as well as ordinary FeatureSpin wins. FeatureSpin modes
without natural bonus triggers, such as ButchEm and PandaFeasting, instead
include ordinary win-level examples and max wins; absent bonus tiers are reported
without failing. Bonus examples remain payout-varied selections of 10 per tier.

The CSV is written to `sample_sims/natural-bonus-samples.csv` in the game's main
directory (next to `__build__`); each row includes the book ID and JSONL line
number for locating the full simulation. Use `--mode` with a comma-separated
mode list, `--count` to change the number of examples per bonus tier, max wins,
and ordinary win level, or `--output` to choose another CSV path. For example:

```sh
pnpm exec tsx scripts/find-natural-bonus-sims.ts --build-dir examples/ButchEm/__build__ --mode base,extraChance
```
