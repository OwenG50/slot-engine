# Core Concepts (/docs/core/core-concepts)



***

## How Slot Engine Works [#how-slot-engine-works]

<Callout title="Built for Stake Engine">
  Slot Engine's Core library is designed specifically for Stake Engine integration,
  following similar principles to Stake's Math SDK.
</Callout>

When the [RGS](#rgs-remote-gaming-server) determines a game round outcome,
it randomly selects an entry from a **weighted list of pre-calculated results**.
All possible game outcomes are **predetermined during the build process**
and stored in JSON and CSV files. Slot Engine generates these files,
allowing you to upload them directly to Stake Engine.

Games are configured using [game modes](#game-mode).
For example, you might configure a "base" game mode (normal bet) and a "bonus" game mode (a.k.a. bonus buy).
A single game flow implementation handles all simulations, regardless of the active game mode.

[Result sets](#result-set) are configured for each game mode to determine
whether a [simulation](#simulation) result is accepted or retried until specific acceptance criteria are met.
Multiple result sets ensure diverse and exceptional outcomes across simulations.

Simulation results may produce a suboptimal [RTP](#rtp). This is acceptable,
as an [optimization](#optimization) process typically follows to adjust the values accordingly.

## Terminology [#terminology]

### RGS (Remote Gaming Server) [#rgs-remote-gaming-server]

A remote gaming server that communicates with the client application, accepting bets and returning results to players.

### Game Mode [#game-mode]

A game mode defines a **purchasable** game behavior, similar to "bet modes" in the Stake Math SDK.
Game modes can vary in cost, outcomes, symbols, and mechanics.

Common game mode patterns include:

* **Base game** - The standard gameplay at 1x bet multiplier
* **Bonus game** - e.g. 100x bet for instant free spins
* **Super bonus** - e.g. 500x bet for instant super free spins

Players can bet on the base game or purchase bonus features directly.
A "base" mode can still include free spins triggered naturally, while a dedicated "bonus" mode
allows immediate access for an extra cost.

[Further reading](/docs/core/config/game-modes)

### Simulation [#simulation]

A simulation executes the game flow implementation—equivalent to **pressing the spin button on a slot**.
Each simulation result is stored temporarily until it's either accepted or rejected.
When accepted, the result is stored permanently, the state resets, and a new simulation begins.
When rejected, the simulation retries until acceptance criteria are met.

[Further reading](/docs/core/game-tasks/simulation)

### Result Set [#result-set]

Defining result sets (similar to "distributions" in the Math SDK) is crucial for **simulating very rare scenarios**.
Even if you configure a simulation to run 1.000.000 spins of a game mode, a max win could be rare enough that it never occurs naturally.
Result sets allow you to **enforce specific outcome quotas**, ensuring simulations retry until the defined criteria are met.

[Further reading](/docs/core/config/result-sets)

### Optimization [#optimization]

The process of recalculating weights for all outcomes to achieve a specific target [RTP](#rtp).

[Further reading](/docs/core/game-tasks/optimization)

### RTP [#rtp]

Return to Player (RTP) is a percentage that represents the
theoretical amount of money a player can expect to win back over an extended period of gameplay.


# Quick Start (/docs/core)



***

## Introduction [#introduction]

Slot Engine is a family of TypeScript libraries for building, simulating and testing slot games.

<Cards>
  <Card icon="<CircuitBoard className=&#x22;text-fd-primary&#x22; />" title="Slot Engine Core">
    Library for configuring and simulating slot games. Produces output compatible with Stake Engine / Stake RGS.
  </Card>

  <Card icon="<LayoutDashboard className=&#x22;text-fd-primary&#x22; />" title="Slot Engine Panel">
    Web GUI for interacting with Slot Engine. Run simulations, view statistics, explore game files.
  </Card>

  <Card icon="<Server className=&#x22;text-fd-primary&#x22; />" title="Slot Engine LGS (WIP)">
    Local gaming server. Test your game locally without the need to upload to Stake Engine and save time during development.
  </Card>
</Cards>

### Further Reading [#further-reading]

For a more in-depth introduction to Slot Engine and its features,
check out ["What is Slot Engine?"](/docs/core/what-is-slot-engine).

Unsure which is right for you? ["Slot Engine vs Stake Math SDK"](/docs/core/slot-engine-vs-stake-math-sdk)
provides an in-depth comparison to help you decide.

## Installation & Setup [#installation--setup]

Get started creating your first game using the `@slot-engine/core` library.

<Steps>
  <Step>
    ### Install package from npm [#install-package-from-npm]

    Set up your Node.js project and install `@slot-engine/core`. &#x2A;*Using TypeScript instead of JavaScript is highly recommended.**

    **Slot Engine requires Node >= 23.8.0 or >= 22.15.0** to make use of native Zstandard compression features.

    <CodeBlockTabs defaultValue="npm">
      <CodeBlockTabsList>
        <CodeBlockTabsTrigger value="npm">
          npm
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="pnpm">
          pnpm
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="yarn">
          yarn
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="bun">
          bun
        </CodeBlockTabsTrigger>
      </CodeBlockTabsList>

      <CodeBlockTab value="npm">
        ```bash
        npm i @slot-engine/core
        ```
      </CodeBlockTab>

      <CodeBlockTab value="pnpm">
        ```bash
        pnpm i @slot-engine/core
        ```
      </CodeBlockTab>

      <CodeBlockTab value="yarn">
        ```bash
        yarn add @slot-engine/core
        ```
      </CodeBlockTab>

      <CodeBlockTab value="bun">
        ```bash
        bun install @slot-engine/core
        ```
      </CodeBlockTab>
    </CodeBlockTabs>
  </Step>

  <Step>
    ### Configure your game [#configure-your-game]

    This example provides a quick overview to get you started.
    For detailed configuration options, see the [configuration guide](/docs/core/config).

    ```ts lineNumbers title="index.ts"
    import {
      defineUserState,
      defineSymbols,
      defineGameModes,
      InferGameType,
      createSlotGame,
    } from "@slot-engine/core"

    export const userState = defineUserState({ /* ... */ })
    export type UserStateType = typeof userState

    export const symbols = defineSymbols({ /* ... */ })
    export type SymbolsType = typeof symbols

    export const gameModes = defineGameModes({ /* ... */ })
    export type GameModesType = typeof gameModes

    export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

    export const game = createSlotGame<GameType>({
      id: "my-game",
      name: "My Game",
      maxWinX: 5000,
      scatterToFreespins: {},
      gameModes,
      symbols,
      userState,
      hooks: {},
    })
    ```
  </Step>

  <Step>
    ### Configure simulation [#configure-simulation]

    ```ts lineNumbers=30 title="index.ts"
    game.configureSimulation({
      simRunsAmount: {
        base: 100000,
        bonus: 100000,
      },
      concurrency: 16,
    })

    game.runTasks({
      doSimulation: true,
    })
    ```
  </Step>

  <Step>
    ### Run simulations [#run-simulations]

    Running simulations will generate JSONL and CSV files containing the results of your simulated spins.
    The easiest way to do this is by using the [`tsx` library](https://tsx.hirok.io/).

    ```sh
    cd ./path-to/your-game
    pnpm tsx ./index.ts --slot-engine-run
    ```

    <Callout title="Important">
      For technical reasons, the flag `--slot-engine-run` is required when running your game
    </Callout>

    **Currently, the output format is designed for compatibility with Stake Engine.**
    Future versions may support additional platforms as they emerge.
    Output customization is not available at this time.

    [Learn more](/docs/core/game-tasks/simulation) about game simulations.
  </Step>
</Steps>

<Callout title="Important">
  Before configuring your game, familiarize yourself with the [concepts and ideas](/docs/core/core-concepts) of the Core library
  to understand important terminology and background information. If you've used the Stake Math SDK before, many concepts will be familiar.
</Callout>

## FAQ / Common Issues [#faq--common-issues]

<Accordions>
  <Accordion title="I'm getting 'Module not found' errors when running the game">
    Ensure you `cd`'ed into the game directory where your game file is.

    If you're running the game from a different directory, add `rootDir: __dirname` to your game configuration.
  </Accordion>
</Accordions>


# Comparing to Stake Math SDK (/docs/core/slot-engine-vs-stake-math-sdk)



***

## Slot Engine is inspired by Stake's Math SDK [#slot-engine-is-inspired-by-stakes-math-sdk]

Slot Engine Core and Stake's Math SDK share many similarities, including comparable APIs.
Originally conceived as a TypeScript port of the Math SDK, Slot Engine evolved during development
to deliver an improved developer experience and enhanced code versioning capabilities.

## Challenges & Solutions [#challenges--solutions]

Here's how Slot Engine addresses key challenges encountered with the Math SDK:

### Stake Math SDK Challenges [#stake-math-sdk-challenges]

Stake's solution provides a Python codebase that developers can clone and customize.
However, game development with the Math SDK presents several challenges:

#### Complexity Barriers [#complexity-barriers]

* Requires deep understanding of complex inner workings
* Features deep class inheritance and functions spanning multiple files
* Can overwhelm developers, especially those new to programming

#### Type Safety Issues [#type-safety-issues]

* Lacks comprehensive type definitions
* Results in `any` types throughout the codebase
* Complicates development and debugging

#### Version Management Problems [#version-management-problems]

* Not distributed through package managers
* Upgrading existing games becomes cumbersome and risky
* Custom code modifications make updates nearly impossible without significant refactoring

Despite these challenges, the Stake Math SDK is battle-tested and widely used by
industry professionals for creating sophisticated games.

### Slot Engine's Approach [#slot-engines-approach]

Slot Engine improves the developer experience by reducing some complexity through design choices:

#### Simplified Architecture [#simplified-architecture]

* Consciously avoids exposing all source code during development
* Provides utility functions, services, and hooks instead
* Reduces the need to override core functionality

#### Better Developer Experience [#better-developer-experience]

* Lower learning curve for new developers
* Cleaner, more maintainable code structure
* Improved type safety

#### Package Distribution [#package-distribution]

* Distributed as an npm package for easy installation and updates
* Semantic versioning ensures predictable upgrade paths
* No need to clone and modify source code directly

## Fundamental Differences [#fundamental-differences]

### "Magic Methods" [#magic-methods]

Examining Stake's example games reveals that developers must manually invoke methods like `reset_seed()`, `reset_book()`, or `check_repeat()`.
The purpose of these methods isn't immediately clear—understanding their role in game simulation requires diving deep into the underlying implementation.

Slot Engine eliminates most "magic methods" by incorporating their functionality directly into the core logic,
reducing developer confusion and improving code clarity for developers.

### Game Flow [#game-flow]

*(This text explains some opinions of the author and the reason for certain design decisions)*

Stake's Math SDK provides pre-built functions for common game mechanics.
However, these functions are designed for standard game patterns and often fall short when implementing unique features.
For instance, the default functions cannot accommodate super bonus mechanics without modification.
Since every slot game has distinctive requirements, developers frequently need to override
entire functions to achieve their desired functionality.

Slot Engine takes a fundamentally different approach to address this.
Rather than offering monolithic functions for major game flow components,
the Core library provides granular utility functions that serve as building blocks for custom game logic.

Developers implement their complete game flow within a single hook function that integrates with the game configuration.
This hook orchestrates the entire game sequence using utility functions combined with custom code.
While this approach may initially appear more complex than navigating pre-built functions, it offers significant advantages:
it eliminates the need to navigate complex source code hierarchies and override multiple interconnected functions,
ultimately providing developers with greater flexibility to create truly customized gaming experiences.


# What is Slot Engine (/docs/core/what-is-slot-engine)



***

## Introduction [#introduction]

Slot Engine is a comprehensive TypeScript library ecosystem for building slot games.
It provides robust mathematical and game logic foundations, with client visualization capabilities planned for future releases.

The term "Slot Engine" refers to both the complete ecosystem and the core library specifically.

## Why Slot Engine [#why-slot-engine]

The launch of Stake Engine in 2025 introduced a platform where developers can publish games to the world's largest casino,
bringing a new wave of developers and studios into the space.

While Stake provides a purpose-built SDK, it has limitations discussed [on this page](/docs/core/slot-engine-vs-stake-math-sdk).

Since Stake's math SDK is written in Python, many developers—particularly those with web development backgrounds in TypeScript or JavaScript—
face barriers to entry when creating games.
&#x2A;*Slot Engine provides TypeScript and JavaScript developers with an alternative for creating slot games.**


# Quick Start (/docs/lgs)



This library is not released yet.


# Quick Start (/docs/panel)



## Introduction [#introduction]

Slot Engine Panel is part of Slot Engine, a family of TypeScript libraries for building, simulating and testing slot games.

Panel is a web GUI for interacting with, and inspecting Slot Engine games.
It features various useful tools for Slot Engine game developers:

* Game statistics overview
* Payout statistics (payout occurrences, unique payout counts)
* Game simulation (configuration, start, stop)
* Simulation insights
* Bet (crowd) simulation
* Reel set designer
* Books & events explorer

## Installation & Setup [#installation--setup]

Set up Panel using the `@slot-engine/panel` library.

<Steps>
  <Step>
    ### Install package from npm [#install-package-from-npm]

    Set up your Node.js project and install `@slot-engine/panel`.<br />
    It's recommended to set up Panel in the same repository as your game(s), but that's not a requirement.

    <Callout>
      Slot Engine Panel requires your games to use `@slot-engine/core` >= 0.2.0.
    </Callout>

    <CodeBlockTabs defaultValue="npm">
      <CodeBlockTabsList>
        <CodeBlockTabsTrigger value="npm">
          npm
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="pnpm">
          pnpm
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="yarn">
          yarn
        </CodeBlockTabsTrigger>

        <CodeBlockTabsTrigger value="bun">
          bun
        </CodeBlockTabsTrigger>
      </CodeBlockTabsList>

      <CodeBlockTab value="npm">
        ```bash
        npm i @slot-engine/panel
        ```
      </CodeBlockTab>

      <CodeBlockTab value="pnpm">
        ```bash
        pnpm i @slot-engine/panel
        ```
      </CodeBlockTab>

      <CodeBlockTab value="yarn">
        ```bash
        yarn add @slot-engine/panel
        ```
      </CodeBlockTab>

      <CodeBlockTab value="bun">
        ```bash
        bun install @slot-engine/panel
        ```
      </CodeBlockTab>
    </CodeBlockTabs>
  </Step>

  <Step>
    ### Configure Panel [#configure-panel]

    Set up Panel in a separate file.
    For detailed configuration options, see the [configuration guide](/docs/panel/config).

    ```ts lineNumbers title="index.ts"
    import { createPanel } from "@slot-engine/panel"
    import { game as MyGame } from "../../path-to/my-game"

    const panel = createPanel({
      games: [MyGame],
    })

    panel.start()
    ```
  </Step>

  <Step>
    ### Ensure Game Compatibility [#ensure-game-compatibility]

    For Panel to be able to resolve file paths correctly, your game needs to specify the configuration option `rootDir: __dirname`.
    Also, your game must use `@slot-engine/core` >= 0.2.0.

    ```ts lineNumbers title="game/index.ts"
    export const game = createSlotGame<GameType>({
      rootDir: __dirname, // required if connecting this game to @slot-engine/panel
      // ...
    })
    ```

    Furthermore, if you want to use the reel set designer, your reels CSV files must be prefixed with `reels_`.
  </Step>

  <Step>
    ### Run Panel [#run-panel]

    You can run the file however you like. The easiest way to do this is by using the [`tsx` library](https://tsx.hirok.io/).

    ```sh
    cd ./path-to/your-panel
    pnpm tsx watch ./index.ts
    ```

    Running Panel in watch mode is not required, but recommended.
    This way Panel will recognize changes to your game and you don't need to restart Panel after every change.
  </Step>
</Steps>

## Troubleshooting [#troubleshooting]

When you're coming from `@slot-engine/core` 0.1.x, some features of Panel may not work correctly the first time you launch it.
Slot Engine Panel needs some files which are only generated during a simulation run.
If you notice obvious 404 or 500 errors when using Panel for the first time,
ensure your game is on a compatible Core version and re-run simulations.
This should generate the necessary files Panel needs.


# Custom Game State (/docs/core/config/custom-state)



***

## State in Slot Engine [#state-in-slot-engine]

The game state holds information about the current simulation,
such as the current simulation ID or whether free spins were triggered.
By design, the game state includes only essential game flow properties to reduce bloat.
When developers need to track additional information—such as whether a specific feature was triggered—
they should define custom state properties.

## Defining custom State [#defining-custom-state]

To define additional state, use the `defineUserState` function and pass the resulting object to your game configuration.

For example:

```ts lineNumbers
import { defineUserState, createSlotGame, InferGameType } from "@slot-engine/core"

export const userState = defineUserState({
  triggeredSuperFreespins: false,
  freespinsUpgradedToSuper: false,
  globalMultiplier: 1
})

export type UserStateType = typeof userState

export type GameType = InferGameType<any, any, UserStateType>

export const game = createSlotGame<GameType>({
  /* the rest of your configuration */
  userState,
})
```

The values defined here will be set as the initial values for each state property on every new simulation.

## Using custom State [#using-custom-state]

In your [game implementation](/docs/core/game-implementation), you will have access to the underlying state via the context.
From there you can access your custom state.

```ts lineNumbers
export function onHandleGameFlow(ctx: GameContext) {
  /* the rest of your game flow */

  // Example usage
  if (ctx.state.userData.triggeredSuperFreespins) {
    ctx.state.userData.globalMultiplier = 10
  }
}
```


# Game Modes (/docs/core/config/game-modes)



***

## Introduction [#introduction]

A game mode defines a **purchasable** game behavior, similar to "bet modes" in the Stake Math SDK.
Game modes can vary in cost, outcomes, symbols, and mechanics.

Common game mode patterns include:

* **Base game** - The standard gameplay at 1x bet multiplier
* **Ante Bet** - Increased odds of hitting free spins for extra cost
* **Bonus game** - e.g. 100x bet for instant free spins
* **Super bonus** - e.g. 500x bet for instant super free spins

Players can bet on the base game or purchase bonus features directly.
A "base" mode can still include free spins triggered naturally, while a dedicated "bonus" mode
allows immediate access for an extra cost.

## Defining Game Modes [#defining-game-modes]

Game modes usually require a lot of configuration. They define which symbols make up your reel strips
and which simulation results to output. Here is a relatively simple example with one game mode:

```ts lineNumbers
import { defineGameModes, GameMode } from "@slot-engine/core"

export const gameModes = defineGameModes({
  base: new GameMode({
    name: "base",
    cost: 1,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [3, 3, 3, 3, 3],
    isBonusBuy: false,
    reelSets: [
      /* list of reel sets */
    ],
    resultSets: [
      /* list of result sets */
    ],
  }),
})
```

## GameMode Constructor Options [#options]

All options are required.

| Property         | Type          | Description                                                            |
| ---------------- | ------------- | ---------------------------------------------------------------------- |
| `name`           | `string`      | Name of the game mode. Must match the key as set in `defineGameModes`. |
| `reelsAmount`    | `number`      | Number of reels the board has.                                         |
| `symbolsPerReel` | `number[]`    | Amount of symbols on each reel.                                        |
| `cost`           | `number`      | Cost of the game mode, multiplied by the base bet.                     |
| `rtp`            | `number`      | The target RTP of the game mode, between 94 and 98.                    |
| `reelSets`       | `ReelSet[]`   | See: [Game Modes: Reel Sets](/docs/core/config/reel-sets)              |
| `resultSets`     | `ResultSet[]` | See: [Game Modes: Result Sets](/docs/core/config/result-sets)          |
| `isBonusBuy`     | `boolean`     | Whether this game mode is a bonus buy.                                 |


# Hooks (/docs/core/config/hooks)



***

## Introduction [#introduction]

Hooks are a way of adding your own code on top of Slot Engine.
They allow you to execute code or update state at specific points of the program.

## List of Hooks [#list-of-hooks]

These are the hooks you can define in your game configuration.

### onHandleGameFlow [#onhandlegameflow]

| Property           | Type                         | Required |
| ------------------ | ---------------------------- | -------- |
| `onHandleGameFlow` | `(ctx: GameContext) => void` | yes      |

The complete game logic must be [implemented](/docs/core/game-implementation) in this hook.

### onSimulationAccepted [#onsimulationaccepted]

| Property               | Type                         | Required |
| ---------------------- | ---------------------------- | -------- |
| `onSimulationAccepted` | `(ctx: GameContext) => void` |          |

This hook is called after a simulation is accepted and the payout has been written to the book.
Useful to run code after completing a simulation and before continuing with the next.

<Callout title="Important">
  **No payouts or results should be altered using this hook!** But adding additional data
  with `ctx.services.data.tag()` is perfectly fine.
</Callout>

### onGameModeComplete [#ongamemodecomplete]

| Property             | Type                                                    | Required |
| -------------------- | ------------------------------------------------------- | -------- |
| `onGameModeComplete` | `(info: GameModeCompleteInfo) => void \| Promise<void>` |          |

This hook is called after a game mode has been **fully simulated** and all of its files
have been written. It only runs on the main thread, and is awaited.

It receives the completed `mode` name, all file `paths` of the build directory,
and the game `metadata`. A common use case is feeding the lookup table paths into the
`optimize()` function of [`@slot-engine/optimizer`](/docs/core/game-tasks/optimization#using-the-optimizer-manually).

```ts lineNumbers
const game = createSlotGame({
  // ...
  hooks: {
    onHandleGameFlow,
    onGameModeComplete: async ({ mode, paths, metadata }) => {
      console.log(`Mode ${mode} done:`, paths.lookupTable(mode))
    },
  },
})
```


# Overview (/docs/core/config)



***

## Setting up your game [#setting-up-your-game]

Create a game by calling `createSlotGame()` and passing a configuration object.
Begin by defining basic game details, then explore the comprehensive [configuration options](#options) detailed below.

```ts lineNumbers
import { createSlotGame, SPIN_TYPE } from "@slot-engine/core"

export const game = createSlotGame({
  id: "my-game",
  name: "My Game",
  maxWinX: 5000,
  padSymbols: 1,
  scatterToFreespins: {
    [SPIN_TYPE.BASE_GAME]: {
      3: 10,
      4: 12,
      5: 15,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      3: 6,
      4: 8,
      5: 10,
    },
  },
  symbols: {},
  gameModes: {},
  userState: {},
  hooks: {
    onHandleGameFlow(ctx) {},
  },
})
```

When using TypeScript, you will encounter a type error.
This is expected because `createSlotGame` requires a type argument. Let's create a type for your game.

```ts lineNumbers
import { createSlotGame, SPIN_TYPE } from "@slot-engine/core" // [!code --]
import { createSlotGame, SPIN_TYPE, InferGameType } from "@slot-engine/core" // [!code ++]

export type GameType = InferGameType<any, any, any> // [!code ++]

export const game = createSlotGame({}) // [!code --]
export const game = createSlotGame<GameType>({}) // [!code ++]
```

The utility type `InferGameType` requires three type arguments: game modes, symbols, and state.
Since we haven't configured these yet, you can use `any` for now.

You can now prepare the rest of the configuration.

```ts lineNumbers
import { createSlotGame, GameConfig, InferGameType } from "@slot-engine/core" // [!code --]
import {
  createSlotGame, // [!code ++]
  SPIN_TYPE, // [!code ++]
  InferGameType, // [!code ++]
  defineGameModes, // [!code ++]
  defineSymbols, // [!code ++]
  defineUserState, // [!code ++]
} from "@slot-engine/core" // [!code ++]

export const gameModes = defineGameModes({}) // [!code ++]
export type GameModesType = typeof gameModes // [!code ++]

export const symbols = defineSymbols({}) // [!code ++]
export type SymbolsType = typeof symbols // [!code ++]

export const userState = defineUserState({}) // [!code ++]
export type UserStateType = typeof userState // [!code ++]

export type GameType = InferGameType<any, any, any> // [!code --]
export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType> // [!code ++]

export const game = createSlotGame<GameType>({
  /* the rest of your configuration */
  symbols: {}, // [!code --]
  gameModes: {}, // [!code --]
  userState: {}, // [!code --]
  symbols, // [!code ++]
  gameModes, // [!code ++]
  userState, // [!code ++]
})
```

You have now completed the basic game setup.
Continue by configuring [symbols](/docs/core/config/symbols),
[game modes](/docs/core/config/game-modes),and [state](/docs/core/config/custom-state).

At the heart of your game lies the actual [implementation](/docs/core/game-implementation).

Finally, [simulate](/docs/core/game-tasks/simulation) your game, tweak settings to improve the feel of it,
and [optimize](/docs/core/game-tasks/optimization) results to achieve your desired RTP.

## createSlotGame() Options [#options]

| Property             | Type                                     | Description                                                                                                                                                                                                                             | Required |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `id`                 | `string`                                 | A unique identifier for your game.                                                                                                                                                                                                      | yes      |
| `name`               | `string`                                 | The name of your game.                                                                                                                                                                                                                  | yes      |
| `maxWinX`            | `number`                                 | The maximum bet multiplier payout. Wins exceeding this number will be capped.                                                                                                                                                           | yes      |
| `gameModes`          | `Record<string, GameMode>`               | See: [Game Configuration: Game Modes](/docs/core/config/game-modes)                                                                                                                                                                     | yes      |
| `symbols`            | `Record<string, GameSymbol>`             | See: [Game Configuration: Symbols](/docs/core/config/symbols)                                                                                                                                                                           | yes      |
| `padSymbols`         | `number`                                 | Amount of padding symbol rows above and below the active board.<br />Used to display partially visible symbols in the frontend at the top and bottom of the board.<br /><br />Defaults to 1                                             | yes      |
| `scatterToFreespins` | `Record<string, Record<number, number>>` | A mapping from spin type to scatter counts to the number of free spins awarded.                                                                                                                                                         | yes      |
| `userState`          | `Record<string, any>`                    | See: [Game Configuration: User State](/docs/core/config/custom-state)                                                                                                                                                                   | yes      |
| `hooks`              | `Record<string, (ctx) => unknown>`       | See: [Game Configuration: Hooks](/docs/core/config/hooks)                                                                                                                                                                               | yes      |
| `rootDir`            | `string`                                 | Normally you would `cd` into the game directory and run it from there. If you run your game from a different file or `process.cwd()` is not where your game lies, specify this option and provide a path. `__dirname` should work fine. |          |


# Reel Sets (/docs/core/config/reel-sets)



***

## Introduction [#introduction]

A reel set is a list of reel strips, where each reel strip defines the symbols
that can land on the board for that specific reel.

Having a well-designed and balanced reel set is **crucial for achieving the desired gameplay experience**
and feel of your slot game. For example, the last reel could hold less valuable symbols to make it even
more exciting if you do hit a full line.

Designing a balanced reel set can be hard without mathematical background knowledge
and is usually done by professional mathematicians.

## Automatic Generation of Reel Sets [#automatic-generation-of-reel-sets]

Slot Engine simplifies reel set creation by providing a `GeneratedReelSet` class that builds a CSV file containing a reel set.
Developers simply need to define weights for the symbols that should appear on the reels,
and the generator will randomly distribute symbols according to those weights.

**This is not a replacement for professional mathematicians** and should be considered a starting point.
You will need to playtest your game to evaluate the gameplay experience and adjust your reel generator configuration accordingly
or edit the generated reels manually.

Add one or more reel sets to your game mode configuration. **Each game mode must specify at least one reel set**.

```ts lineNumbers
import { defineGameModes, GameMode, GeneratedReelSet } from "@slot-engine/core"

export const gameModes = defineGameModes({
  base: new GameMode({
    /* the rest of your configuration */
    reelSets: [
      new GeneratedReelSet({
        id: "base",
        overrideExisting: false,
        symbolWeights: {},
      }),
    ],
  }),
})
```

## GeneratedReelSet Options [#generatedreelset-options]

### General Options [#general-options]

| Property           | Type                     | Description                                            | Required |
| ------------------ | ------------------------ | ------------------------------------------------------ | -------- |
| `id`               | `string`                 | The unique identifier of the reel set / generator.     | yes      |
| `symbolWeights`    | `Record<string, number>` | Mapping of symbol ID's to weights.                     | yes      |
| `overrideExisting` | `boolean`                | If true, existing reels CSV files will be overwritten. |          |
| `rowsAmount`       | `number`                 | The number of rows in the reelset.<br />Default: 250   |          |
| `seed`             | `number`                 | Seed to change the RNG.                                |          |

### Advanced Options [#advanced-options]

All advanced options are optional.

#### spaceBetweenSameSymbols \[!toc] [#spacebetweensamesymbols-toc]

```ts
number | Record<string, number>
```

Prevent the same symbol from appearing directly above or below itself.\
This can be a single number to affect all symbols, or a mapping of symbol IDs to their respective spacing values.

Must be 1 or higher, if set.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  spaceBetweenSameSymbols: 4,
  // or
  spaceBetweenSameSymbols: {
    S: 5,
    W: 3,
  },
})
```

#### spaceBetweenSymbols \[!toc] [#spacebetweensymbols-toc]

```ts
Record<string, Record<string, number>>
```

Prevents specific symbols from appearing within a certain distance of each other.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  spaceBetweenSymbols: {
    S: { SS: 3, W: 1 },
    // ^ Scatter is at least 3 away from super scatter and 1 away from wild
  },
})
```

#### preferStackedSymbols \[!toc] [#preferstackedsymbols-toc]

```ts
number
```

A percentage value 0-100 that indicates the likelihood of a symbol being stacked.
A value of 0 means no stacked symbols, while 100 means all symbols are stacked.
This is only a preference. Symbols may still not be stacked if
other restrictions (like `spaceBetweenSameSymbols`) prevent it.

This setting is overridden by `symbolStacks`.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  preferStackedSymbols: 50,
})
```

#### symbolStacks \[!toc] [#symbolstacks-toc]

```ts
Record<
  string,
  {
    chance: number | Record<string, number>
    min?: number | Record<string, number>
    max?: number | Record<string, number>
  }
>
```

A mapping of symbols to their respective advanced stacking configuration.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  symbolStacks: {
    W: {
      chance: { "1": 20, "2": 20, "3": 20, "4": 20 }, // 20% chance to be stacked on reels 2-5
      min: 2, // At least 2 wilds in a stack
      max: 4, // At most 4 wilds in a stack
    },
  },
})
```

#### limitSymbolsToReels \[!toc] [#limitsymbolstoreels-toc]

```ts
Record<string, number[]>
```

Configures symbols to only appear on specific reels.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  limitSymbolsToReels: {
    S: [0, 2, 4], // Scatter only on reels 1, 3, 5.
  },
})
```

#### symbolQuotas \[!toc] [#symbolquotas-toc]

```ts
Record<string, number | Record<string, number>>
```

Defines minimum symbol quotas on reels.
The quota (1-100%) defines how often a symbol should appear in the reelset, or in a specific reel.
This is particularly useful for controlling the frequency of special symbols like scatters or wilds.

Reels not provided for a symbol will use the weights from `symbolWeights`.
*Any* small quota will ensure that the symbol appears at least once on the reel.

```ts
new GeneratedReelSet({
  id: "example",
  symbolWeights: {},
  symbolQuotas: {
    S: 3, // 3% of symbols on each reel will be scatters
    W: { "1": 10, "2": 5, "3": 3, "4": 1 }, // Wilds will appear with different quotas on selected reels
  },
})
```

## Manual Reel Set Creation [#manual-reel-set-creation]

You can define reel sets manually using the `StaticReelSet` class, where the reels are defined
either via a JSON array or via a CSV file.

### CSV File Reel Sets [#csv-file-reel-sets]

For a game mode with 5 reels, the content of a CSV reel set file must have a structure like below.

```csv
L4,L5,L1,L5,L4
L2,L4,L4,L3,L3
L4,H2,W,L4,L1
L3,L3,H4,H4,H1
H1,H4,H1,L5,H2
L5,L4,L3,S,S
...
```

Then add your reel set to a game mode like so:

```ts lineNumbers
import { defineGameModes, GameMode, StaticReelSet } from "@slot-engine/core"
import path from "path"

export const gameModes = defineGameModes({
  base: new GameMode({
    /* the rest of your configuration */
    reelSets: [
      new StaticReelSet({
        id: "base",
        csvPath: path.join(__dirname, "path-to-your", "reelset.csv"),
      }),
    ],
  }),
})
```

### JSON Reel Sets [#json-reel-sets]

You can also define your reel strips as a JSON array of symbol ID's like below.
Note that this configuration is read from left to right, top to bottom, and *not* top to bottom, left to right like in CSV reels.

```ts lineNumbers
import { defineGameModes, GameMode, StaticReelSet } from "@slot-engine/core"

export const gameModes = defineGameModes({
  base: new GameMode({
    /* the rest of your configuration */
    reelSets: [
      new StaticReelSet({
        id: "base",
        reels: [
          ["L4", "L2", "L4", "L3", "H1", "L5"],
          ["L5", "L4", "H2", "L3", "H4", "L4"],
          ["L1", "L4", "W", "H4", "H1", "L3"],
          ["L5", "L3", "L4", "H4", "L5", "S"],
          ["L4", "L3", "L1", "H1", "H2", "S"],
        ]
      }),
    ],
  }),
})
```

## FAQ / Common Issues [#faq--common-issues]

<Accordions>
  <Accordion title="The GeneratedReelSet fails to generate or throws an error">
    Setting a different seed may help with generating reels.
  </Accordion>
</Accordions>


# Result Sets (/docs/core/config/result-sets)



***

## Introduction [#introduction]

Slot games have thousands if not millions of possible outcomes—each spin is different.
A player shouldn't see the exact same outcome twice. With result sets you **ensure diverse simulation results**.
You want to ensure there are plenty of zero-win scenarios as well as many different max win simulations—
and everything in between.

Before a simulation run starts, each simulation is assigned one of the specified result sets
based on the total quota of all result sets for a game mode, and must fulfill its criteria.
Only when a **simulation meets the expected result set criteria** does the program proceed to the next simulation.

Result sets commonly cover the following scenarios:

* Zero-win spins
* Win spins
* Free spins
* Max wins

But developers can also specify very detailed and rare criteria:

* Free spins upgraded to super bonus resulting in max win

**Result sets are a crucial part** of simulating a game. Depending on the configuration and implementation of a game,
outcomes like max wins may be extremely rare and possibly don't occur naturally during, for example, 1,000,000 simulations.
With result sets, the program forces such outcomes and retries until the given criteria are met.

<Callout title="Keep this in mind">
  The more unlikely a scenario is to happen, the longer a simulation run may take.
</Callout>

## Defining Result Sets for a Game Mode [#defining-result-sets-for-a-game-mode]

The following example shows the definition of 4 common result sets.
This setup ensures that a large portion of all simulations are either zero-win spins or normal base game hits.
A smaller quota is dedicated to generating free spins simulations
and a very small portion ensures enough max win simulations.

```ts lineNumbers
export const gameModes = defineGameModes({
  base: new GameMode({
    name: "base",
    cost: 1,
    rtp: 0.96,
    /* the rest of the configuration */
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.4,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base1: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus1: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.4,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base1: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus1: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base1: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus1: 3, bonus2: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.005,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base1: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus1: 1, bonus2: 3 },
          evaluate: maxwinReelsEvaluation,
        },
      }),
    ],
  }),
})
```

<Callout title="Small quotas">
  Keep in mind that you'll simulate at least 100.000 spins. If you have a max win quota of
  0.005 and `(quota / totalQuota) * simsAmount` = `(0.005 / 1) * 100.000` = `500`, that's
  perfectly enough variety in max win simulations.
</Callout>

## ResultSet Options [#resultset-options]

### criteria \[!toc] [#criteria-toc]

| Property   | Type     | Required |
| ---------- | -------- | -------- |
| `criteria` | `string` | yes      |

A unique descriptive identifier for the result set.

### quota \[!toc] [#quota-toc]

| Property | Type     | Required |
| -------- | -------- | -------- |
| `quota`  | `number` | yes      |

The quota of simulations that should fall under this result set.

#### Example \[!toc] [#example-toc]

Let's say you have these 3 result sets:

* "basegame": 90 quota
* "freespins": 9 quota
* "maxwin": 1 quota

The total quota here is 100 (but can be any number, doesn't have to be 100).
This means that, for example, every 100th simulation will result in a max win.

**When using** [optimization](/docs/core/game-tasks/optimization), the quota **does not represent the actual frequency** of specific outcomes when playing,
because the optimizer will redistribute the weights of all simulations.

### multiplier \[!toc] [#multiplier-toc]

| Property     | Type                         | Required |
| ------------ | ---------------------------- | -------- |
| `multiplier` | `number \| [number, number]` |          |

The payout multiplier to be hit. Either an exact number, or a range.

### forceMaxWin \[!toc] [#forcemaxwin-toc]

| Property      | Type      | Required |
| ------------- | --------- | -------- |
| `forceMaxWin` | `boolean` |          |

Whether a max win should be simulated.

### forceFreespins \[!toc] [#forcefreespins-toc]

| Property         | Type      | Required |
| ---------------- | --------- | -------- |
| `forceFreespins` | `boolean` |          |

Whether free spins should be simulated.

<Callout title="Information">
  Setting `forceFreespins` alone won't do anything. It's up to you to include logic in
  your game implementation to check whether `ctx.state.currentResultSet.forceFreespins` is
  `true` and draw the board accordingly.
</Callout>

### userData \[!toc] [#userdata-toc]

| Property   | Type                  | Required |
| ---------- | --------------------- | -------- |
| `userData` | `Record<string, any>` |          |

Additional data that can be used in a custom evaluation function or in your game loop.

### evaluate \[!toc] [#evaluate-toc]

| Property   | Type                            | Required |
| ---------- | ------------------------------- | -------- |
| `evaluate` | `(ctx: GameContext) => boolean` |          |

Inject **custom checks** into the simulation evaluation logic.
Use this to check for free spins that upgraded to super free spins
or **any other arbitrary simulation criteria** not supported in the core.

For example, you can use the `userData` from the result set to handle different game behavior.
Then in your game implementation, set the state accordingly to ensure the simulation passes the criteria.

<CodeBlockTabs defaultValue="ResultSet">
  <CodeBlockTabsList>
    <CodeBlockTabsTrigger value="ResultSet">
      ResultSet
    </CodeBlockTabsTrigger>

    <CodeBlockTabsTrigger value="Evaluation Function">
      Evaluation Function
    </CodeBlockTabsTrigger>

    <CodeBlockTabsTrigger value="Game Implementation">
      Game Implementation
    </CodeBlockTabsTrigger>
  </CodeBlockTabsList>

  <CodeBlockTab value="ResultSet">
    ```ts lineNumbers 
    new ResultSet({
      criteria: "freespinsUpgradeToSuper",
      quota: 0.01,
      forceFreespins: true,
      reelWeights: { /* ... */ },
      userData: { upgradeFreespins: true }, // [!code highlight]
      evaluate: freeSpinsUpgradeEvaluation, // [!code highlight]
    }),
    ```
  </CodeBlockTab>

  <CodeBlockTab value="Evaluation Function">
    ```ts lineNumbers 
    export function freeSpinsUpgradeEvaluation(ctx: GameContext<any, any, UserStateType>) {
      if (ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) return false
      return ctx.state.userData.freespinsUpgradedToSuper
    }
    ```
  </CodeBlockTab>

  <CodeBlockTab value="Game Implementation">
    ```ts lineNumbers 
    // Somewhere in your game implementation...
    // ResultSet `userData` can be used to achieve desired outcome.
    if (
      ctx.state.currentSpinType == SPIN_TYPE.FREE_SPINS &&
      ctx.state.currentResultSet.userData?.upgradeFreespins &&
      !ctx.state.userData.freespinsUpgradedToSuper
    ) {
      // Upgrade FS here
      ctx.state.userData.freespinsUpgradedToSuper = true
    }
    ```
  </CodeBlockTab>
</CodeBlockTabs>

### reelWeights \[!toc] [#reelweights-toc]

| Property      | Type                    | Required |
| ------------- | ----------------------- | -------- |
| `reelWeights` | `Record<string, mixed>` | yes      |

Configure the weights of the reels in this ResultSet.

If you need to support dynamic / special reel weights based on the simulation context,
you can provide an `evaluate` function that returns the desired weights.

If the `evaluate` function returns a falsy value, the usual spin type based weights will be used.

#### Example 1 \[!toc] [#example-1-toc]

During the first spin of a "freespins" simulation (when scatters trigger FS),
the reels with the ID `base1` will always be used to draw the board.

During free spins, one of two possible reels will be picked by doing a weighted draw
(`bonus1`: 75%, `bonus2`: 25%).

```ts lineNumbers
new ResultSet({
  criteria: "freespins",
  quota: 1,
  forceFreespins: true,
  reelWeights: {
    [SPIN_TYPE.BASE_GAME]: { base1: 1 },
    [SPIN_TYPE.FREE_SPINS]: { bonus1: 3, bonus2: 1 },
  },
}),
```

#### Example 2 \[!toc] [#example-2-toc]

Similar to the first example, but the `evaluate` function runs first and tells the program to use the `superbonus` reels
after super free spins have been triggered.

```ts lineNumbers
new ResultSet<UserStateType>({ // Add your custom state as a type parameter ...
  criteria: "superFreespins",
  quota: 0.01,
  forceFreespins: true,
  reelWeights: {
    [SPIN_TYPE.BASE_GAME]: { base1: 1 },
    [SPIN_TYPE.FREE_SPINS]: { bonus1: 3, bonus2: 1 },
    evaluate: (ctx) => {
      if (ctx.state.userData.triggeredSuperFreespins) { // ... for type-safety!
        return { superbonus: 1 }
      }
    },
  },
  userData: { forceSuperFreespins: true },
}),
```


# Symbols (/docs/core/config/symbols)



***

## Defining Symbols for your Game [#defining-symbols-for-your-game]

Use the `defineSymbols` function to configure symbols. The function expects a configuration object
where each key serves as the unique identifier for a symbol. Symbols are constructed using the `GameSymbol` class.

You can define as many symbols as needed, provided each has a unique key and ID.

```ts lineNumbers
import { defineSymbols, GameSymbol } from "@slot-engine/core"

export const symbols = defineSymbols({
  S: new GameSymbol({
    id: "S",
    properties: {
      isScatter: true,
    },
  }),
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 10,
      4: 75,
      5: 250,
    },
  }),
})
```

## Paying Symbols [#paying-symbols]

To define payout amounts for symbols, set the `pays` property where the key is the number
of matching symbols and the value is the bet multiplier to be paid out.

```ts lineNumbers
export const symbols = defineSymbols({
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 10,
      4: 75,
      5: 250,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.2,
      4: 0.4,
      5: 0.8,
    },
  }),
})
```

<Callout title="Decimal places">
  Payouts with **two or more decimal places are not recommended**, as this could result in payouts less than a cent.<br />
  **E.g. 0.10 bet × 0.75 multiplier = 0.075 payout**<br />
  Ensure the minimum bet will be 0.2 €/$ if you want to go this route.
</Callout>

## Special Symbols [#special-symbols]

To define scatters, wilds, or other special symbols, set custom `properties` for your symbol.
Multiple symbols can share the same properties. This is useful when you need multiple types
of the same symbol category, such as different scatter variants.

Properties help identify and count specific symbols on the board during gameplay.

```ts lineNumbers
export const symbols = defineSymbols({
  S: new GameSymbol({
    id: "S",
    properties: {
      isScatter: true,
    },
  }),
  SS: new GameSymbol({
    id: "SS",
    properties: {
      isScatter: true,
      isSuperScatter: true,
    },
  }),
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
    },
  }),
  EW: new GameSymbol({
    id: "EW",
    properties: {
      isWild: true,
      isExpandingWild: true,
    },
  }),
})
```

## Multipliers [#multipliers]

Symbol properties can hold any value, not just booleans. For example, you could specify a multiplier for a symbol.

```ts lineNumbers
export const symbols = defineSymbols({
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
      multiplier: 10,
    },
  }),
})
```

However, in this case, the wild symbol will always have the specified multiplier when placed on the board.
It's better to set `multiplier: 0` or **omit it** entirely.
Symbol properties like multipliers **should be modified during game flow** for greater flexibility and clarity.

If your game only requires static multipliers (e.g., a consistent 2x wild multiplier),
the above approach is perfectly acceptable.

## Compare Symbols [#compare-symbols]

Sometimes you might need to compare two symbols.
Each `GameSymbol` instance has a `compare()` method for this purpose.

### Compare by Symbol [#compare-by-symbol]

When passing a `GameSymbol` to the `compare` function, only the symbol ID's are compared.

```ts
const wild = ctx.config.symbols.get("W")!
const scatter = ctx.config.symbols.get("S")!

console.log(scatter.compare(wild)) // false
```

### Compare by Symbol Properties [#compare-by-symbol-properties]

When comparing by properties, the result is `true` **when all properties and their values match**.

```ts
const result = someSymbol.compare({
  someProperty: true,
  anotherProperty: 10
})
```


# Board Service (/docs/core/game-context/board-service)



***

## Methods [#methods]

### getBoardReels() [#getboardreels]

| Method                               | Type          |
| ------------------------------------ | ------------- |
| `ctx.services.board.getBoardReels()` | `() => Reels` |

Returns the active board reels.

The reels will be arrays of `GameSymbol`. Each symbol has been auto-assigned the property `position`.
This is useful if you need to filter reel symbols to retrieve the positions of specific symbols (`symbol.properties.get("position")`).

### getPaddingTop() [#getpaddingtop]

| Method                               | Type          |
| ------------------------------------ | ------------- |
| `ctx.services.board.getPaddingTop()` | `() => Reels` |

Returns the top padding reels.

### getPaddingBottom() [#getpaddingbottom]

| Method                                  | Type          |
| --------------------------------------- | ------------- |
| `ctx.services.board.getPaddingBottom()` | `() => Reels` |

Returns the bottom padding reels.

### getSymbol() [#getsymbol]

| Method                           | Type                                  |
| -------------------------------- | ------------------------------------- |
| `ctx.services.board.getSymbol()` | `(reelIndex, rowIndex) => GameSymbol` |

#### Parameters \[!toc] [#parameters-toc]

| Parameter   | Type     |
| ----------- | -------- |
| `reelIndex` | `number` |
| `rowIndex`  | `number` |

Returns the symbol at the specified position.

### setSymbol() [#setsymbol]

| Method                           | Type                                    |
| -------------------------------- | --------------------------------------- |
| `ctx.services.board.setSymbol()` | `(reelIndex, rowIndex, symbol) => void` |

#### Parameters \[!toc] [#parameters-toc-1]

| Parameter   | Type         |
| ----------- | ------------ |
| `reelIndex` | `number`     |
| `rowIndex`  | `number`     |
| `symbol`    | `GameSymbol` |

Sets the symbol at the specified position.

### removeSymbol() [#removesymbol]

| Method                              | Type                               |
| ----------------------------------- | ---------------------------------- |
| `ctx.services.board.removeSymbol()` | `(reelIndex, rowIndex) => boolean` |

#### Parameters \[!toc] [#parameters-toc-2]

| Parameter   | Type     |
| ----------- | -------- |
| `reelIndex` | `number` |
| `rowIndex`  | `number` |

Removes the symbol from the board at the specified position. Returns a boolean, whether the symbol was removed.

### updateSymbol() [#updatesymbol]

| Method                              | Type                                        |
| ----------------------------------- | ------------------------------------------- |
| `ctx.services.board.updateSymbol()` | `(reelIndex, rowIndex, properties) => void` |

#### Parameters \[!toc] [#parameters-toc-3]

| Parameter    | Type                  |
| ------------ | --------------------- |
| `reelIndex`  | `number`              |
| `rowIndex`   | `number`              |
| `properties` | `Record<string, any>` |

Updates properties of the symbol at the specified reel and row index.

### setSymbolsPerReel() [#setsymbolsperreel]

| Method                                   | Type                       |
| ---------------------------------------- | -------------------------- |
| `ctx.services.board.setSymbolsPerReel()` | `(symbolsPerReel) => void` |

#### Parameters \[!toc] [#parameters-toc-4]

| Parameter        | Type       |
| ---------------- | ---------- |
| `symbolsPerReel` | `number[]` |

Sets a new temporary value for `symbolsPerReel`. The value will be persisted until changed by the user
or until the simulation is reset or the next simulation starts.

### setReelsAmount() [#setreelsamount]

| Method                                | Type                    |
| ------------------------------------- | ----------------------- |
| `ctx.services.board.setReelsAmount()` | `(reelsAmount) => void` |

#### Parameters \[!toc] [#parameters-toc-5]

| Parameter     | Type     |
| ------------- | -------- |
| `reelsAmount` | `number` |

Sets a new temporary value for `reelsAmount`. The value will be persisted until changed by the user
or until the simulation is reset or the next simulation starts.

### resetBoard() [#resetboard]

| Method                            | Type         |
| --------------------------------- | ------------ |
| `ctx.services.board.resetBoard()` | `() => void` |

Resets and clears the board.

### getAnticipation() [#getanticipation]

| Method                                 | Type              |
| -------------------------------------- | ----------------- |
| `ctx.services.board.getAnticipation()` | `() => boolean[]` |

Array of booleans representing anticipation for reels. Anticipation is a visual effect
that usually teases potential free spins when one more scatter is needed to trigger it.

For example, an anticipation array of `[false, false, false, true, true]` can instruct the client
to apply anticipation effects to reels 4 and 5.

### setAnticipationForReel() [#setanticipationforreel]

| Method                                        | Type                         |
| --------------------------------------------- | ---------------------------- |
| `ctx.services.board.setAnticipationForReel()` | `(reelIndex, value) => void` |

#### Parameters \[!toc] [#parameters-toc-6]

| Parameter   | Type      |
| ----------- | --------- |
| `reelIndex` | `number`  |
| `value`     | `boolean` |

Sets anticipation state for a board reel.

### getLockedReels() [#getlockedreels]

| Method                                | Type              |
| ------------------------------------- | ----------------- |
| `ctx.services.board.getLockedReels()` | `() => boolean[]` |

Array of booleans representing lock state for reels. If a reel is locked, its symbols
will not change when the board is drawn.

### setReelLocked() [#setreellocked]

| Method                               | Type                         |
| ------------------------------------ | ---------------------------- |
| `ctx.services.board.setReelLocked()` | `(reelIndex, value) => void` |

#### Parameters \[!toc] [#parameters-toc-7]

| Parameter   | Type      |
| ----------- | --------- |
| `reelIndex` | `number`  |
| `value`     | `boolean` |

Sets locked state for a board reel.

### countSymbolsOnReel() [#countsymbolsonreel]

| Method                                    | Type                                        |
| ----------------------------------------- | ------------------------------------------- |
| `ctx.services.board.countSymbolsOnReel()` | `(symbolOrProperties, reelIndex) => number` |

#### Parameters \[!toc] [#parameters-toc-8]

| Parameter            | Type                                |
| -------------------- | ----------------------------------- |
| `symbolOrProperties` | `GameSymbol \| Record<string, any>` |
| `reelIndex`          | `number`                            |

Counts the symbols on the specified reel.

### countSymbolsOnBoard() [#countsymbolsonboard]

| Method                                     | Type                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `ctx.services.board.countSymbolsOnBoard()` | `(symbolOrProperties) => [number, Record<number, number>]` |

#### Parameters \[!toc] [#parameters-toc-9]

| Parameter            | Type                                |
| -------------------- | ----------------------------------- |
| `symbolOrProperties` | `GameSymbol \| Record<string, any>` |

Counts how many symbols matching the criteria are on the board.

Returns a tuple where the first element is the total count, and the second element is a record of counts per reel index.

### isSymbolOnAnyReelMultipleTimes() [#issymbolonanyreelmultipletimes]

| Method                                                | Type                  |
| ----------------------------------------------------- | --------------------- |
| `ctx.services.board.isSymbolOnAnyReelMultipleTimes()` | `(symbol) => boolean` |

#### Parameters \[!toc] [#parameters-toc-10]

| Parameter | Type         |
| --------- | ------------ |
| `symbol`  | `GameSymbol` |

Checks if the given symbol occurrs multiple times on any reel.

### getReelStopsForSymbol() [#getreelstopsforsymbol]

| Method                                       | Type                            |
| -------------------------------------------- | ------------------------------- |
| `ctx.services.board.getReelStopsForSymbol()` | `(reels, symbol) => number[][]` |

#### Parameters \[!toc] [#parameters-toc-11]

| Parameter | Type         |
| --------- | ------------ |
| `reels`   | `Reels`      |
| `symbol`  | `GameSymbol` |

Returns all positions of a symbol in a reel set.
Useful to retrieve all possible scatter positions, for example.

### combineReelStops() [#combinereelstops]

| Method                                  | Type                           |
| --------------------------------------- | ------------------------------ |
| `ctx.services.board.combineReelStops()` | `(...reelStops) => number[][]` |

#### Parameters \[!toc] [#parameters-toc-12]

| Parameter   | Type           |
| ----------- | -------------- |
| `reelStops` | `number[][][]` |

Combines multiple arrays of reel stops into a single array of reel stops.
If you had multiple scatter variants, you could use this to get a single array
of all scatter positions in a reel set.

#### Usage \[!toc] [#usage-toc]

```ts
const reels = ctx.services.board.getRandomReelset()
const scatter = config.symbols.get("S")!
const superScatter = config.symbols.get("SS")!

const reelStops = ctx.services.board.combineReelStops(
  ctx.services.board.getReelStopsForSymbol(reels, scatter),
  ctx.services.board.getReelStopsForSymbol(reels, superScatter),
)
```

### getRandomReelStops() [#getrandomreelstops]

| Method                                    | Type                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| `ctx.services.board.getRandomReelStops()` | `(reels, reelStops, amount) => Record<string, number>` |

#### Parameters \[!toc] [#parameters-toc-13]

| Parameter   | Type         |
| ----------- | ------------ |
| `reels`     | `Reels`      |
| `reelStops` | `number[][]` |
| `amount`    | `number`     |

From a list of reel stops on reels, selects a random stop for `amount` number of reels.
This is mostly useful to forcibly place scatters on the board.

#### Usage \[!toc] [#usage-toc-1]

```ts
const reels = ctx.services.board.getRandomReelset()
const scatter = config.symbols.get("S")!

const reelStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
const scatterReelStops = ctx.services.board.getRandomReelStops(reels, reelStops, 3)

ctx.services.board.drawBoardWithForcedStops({
  reels,
  forcedStops: scatterReelStops,
})
```

### getRandomReelset() [#getrandomreelset]

| Method                                  | Type          |
| --------------------------------------- | ------------- |
| `ctx.services.board.getRandomReelset()` | `() => Reels` |

Selects a random reel set based on the configured weights of the current result set.

### drawBoardWithForcedStops() [#drawboardwithforcedstops]

| Method                                          | Type                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| `ctx.services.board.drawBoardWithForcedStops()` | `(opts: { reels, forcedStops, randomOffset }) => void` |

#### Parameters \[!toc] [#parameters-toc-14]

| Parameter           | Type                     | Description                                                                                                                                          | Required |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `opts.reels`        | `Reels`                  |                                                                                                                                                      | yes      |
| `opts.forcedStops`  | `Record<string, number>` |                                                                                                                                                      | yes      |
| `opts.randomOffset` | `boolean`                | Whether to apply a random offset to the stops. Adds a bit of randomization to where exactly your forced symbol lands on the reel.<br />Default: true |          |

Draws a board using specified reel stops.

#### Usage \[!toc] [#usage-toc-2]

```ts
const reels = ctx.services.board.getRandomReelset()
const scatter = config.symbols.get("S")!

const reelStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
const scatterReelStops = ctx.services.board.getRandomReelStops(reels, reelStops, 3)

ctx.services.board.drawBoardWithForcedStops({
  reels,
  forcedStops: scatterReelStops,
})
```

### drawBoardWithRandomStops() [#drawboardwithrandomstops]

| Method                                          | Type              |
| ----------------------------------------------- | ----------------- |
| `ctx.services.board.drawBoardWithRandomStops()` | `(reels) => void` |

#### Parameters \[!toc] [#parameters-toc-15]

| Parameter | Type    |
| --------- | ------- |
| `reels`   | `Reels` |

Draws a board using random reel stops.

### tumbleBoard() [#tumbleboard]

| Method                             | Type                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| `ctx.services.board.tumbleBoard()` | `(symbolsToDelete) => { newBoardSymbols, newPaddingTopSymbols }` |

#### Parameters \[!toc] [#parameters-toc-16]

| Parameter         | Type                                         |
| ----------------- | -------------------------------------------- |
| `symbolsToDelete` | `Array<{ reelIdx: number; rowIdx: number }>` |

#### Return Object \[!toc] [#return-object-toc]

| Parameter              | Type                           |
| ---------------------- | ------------------------------ |
| `newBoardSymbols`      | `Record<string, GameSymbol[]>` |
| `newPaddingTopSymbols` | `Record<string, GameSymbol[]>` |

Tumbles the board. All given symbols will be deleted and new symbols will fall from the top.

If you use the symbols from `winCombinations` returned by a win type, ensure symbols are deduped
to prevent bugs during tumbling. For example, the same Wild symbol may be associated with multiple
win combinations. To dedupe, use `ctx.services.game.dedupeWinSymbols()`.
The resulting symbol positions are safe to use for tumbling.

The function returns the new symbols that were added to each reel.
For example, `newBoardSymbols` will be an object where the keys are the reel indexes
and the values are the added symbols for that reel.

### tumbleBoardAndForget() - EXPERIMENTAL [#tumbleboardandforget---experimental]

<Callout type="warn">
  This method is experimental and may be changed or replaced in the future. If you plan to
  use this method, ensure `padSymbols` is set to `0` in the game config or you will most
  likely experience bugs or unexpected behavior.
</Callout>

| Method                                      | Type                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `ctx.services.board.tumbleBoardAndForget()` | `(opts) => { newBoardSymbols, newPaddingTopSymbols }` |

#### Parameters \[!toc] [#parameters-toc-17]

| Parameter              | Type                                         |
| ---------------------- | -------------------------------------------- |
| `opts.symbolsToDelete` | `Array<{ reelIdx: number; rowIdx: number }>` |
| `opts.reels`           | `Reels`                                      |
| `opts.forcedStops`     | `number[]`                                   |

#### Return Object \[!toc] [#return-object-toc-1]

| Parameter              | Type                           |
| ---------------------- | ------------------------------ |
| `newBoardSymbols`      | `Record<string, GameSymbol[]>` |
| `newPaddingTopSymbols` | `Record<string, GameSymbol[]>` |

Tumbles the board similar to `tumbleBoard()`.

While `tumbleBoard()` remembers the last tumble and can seamlessly tumble multiple times in a row,
`tumbleBoardAndForget()` will not remember what it did. &#x2A;*This is useful to do a single one-off tumble.**

While `tumbleBoard()` always uses the last used reel set that the board was drawn with,
`tumbleBoardAndForget()` can tumble symbols from an arbitrary reel set
and won't override any internal board state (besides the symbols on the reels).

This can be particularly useful if you need to fill a part of the board with some blocker symbols
(think of the game Templar Tumble, or Temple Tumble).

<Callout type="warn">
  If you plan to use this method, ensure `padSymbols` is set to `0` in the game config or
  you will most likely experience bugs or unexpected behavior.
</Callout>


# Config (/docs/core/game-context/config)



***

## Introduction [#introduction]

The static game configuration object provides access to various game-specific properties
as defined in your `createSlotGame` function.

The game config **must not be modified** during runtime.

## Properties [#properties]

Only properties that are relevant for game implementation are listed here.

| Property               | Type                                     | Description                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anticipationTriggers` | `Record<string, number>`                 | A mapping of spin types to the number of scatter symbols required to trigger anticipation.                                                                                                  |
| `maxWinX`              | `number`                                 | The maximum bet multiplier payout. Wins exceeding this number will be capped.                                                                                                               |
| `padSymbols`           | `number`                                 | Amount of padding symbol rows above and below the active board.<br />Used to display partially visible symbols in the frontend at the top and bottom of the board.<br /><br />Defaults to 1 |
| `symbols`              | `Map<string, GameSymbol>`                | See: [Game Configuration: Symbols](/docs/core/config/symbols)                                                                                                                               |
| `scatterToFreespins`   | `Record<string, Record<number, number>>` | A mapping from spin type to scatter counts to the number of free spins awarded.                                                                                                             |

<Callout type="warn">
  Any other properties you might find under `ctx.config` shouldn't be used as they only
  serve internal purposes. They might be made inaccessible in a future update.
</Callout>


# Data Service (/docs/core/game-context/data-service)



***

## Introduction [#introduction]

Slot Engine has data layers that store JSON data required for
game optimization, statistical analysis and frontend visualization.

### Book [#book]

Each simulation produces a "book" that contains information about the simulation,
like simulation ID, payout values, and JSON data for frontend visualization.

The book stores **events** as an array of objects with an index, type and arbitrary data.
Events define, in chronological order, **what should be displayed to the player** on the frontend.

Common events include:

* Revealing the board symbols
* Displaying win lines
* Displaying win amount
* Trigger free spins screen

In short: (Almost) every visual change on the frontend for a single spin is defined inside a book.

For example:

```ts lineNumbers
ctx.services.data.addBookEvent({
  type: "show-winlines",
  data: {
    lines: [0, 3]
    wins: [
      [
        { reel: 0, row: 0 },
        { reel: 1, row: 0 },
        { reel: 2, row: 0 },
      ],
      [
        { reel: 0, row: 2 },
        { reel: 1, row: 2 },
        { reel: 2, row: 2 },
      ],
    ]
  }
})

ctx.services.data.addBookEvent({
  type: "add-update-balance",
  data: {
    value: 200,
  }
})
```

Each added event receives an auto-incremented index, allowing the frontend to process events in the correct chronological order.

### Tagging [#tagging]

Tagging allows grouping simulations by arbitrary criteria. If using [optimization](/docs/core/game-tasks/optimization),
this would allow you to target specific simulations to optimize.
It also enables capturing notable runs (e.g. max win simulations) so they can be replayed locally for debugging or demonstration.

Tags are written to the `__build__` directory as `tags_<gameMode>.json`. The JSON structure matches the Stake Math SDK format for interoperability.

Without having to configure anything, Slot Engine automatically tags simulations with their result set criteria.
You can add additional tags as needed using `tag()`.

Tags are also used to enable filtering books when browsing them with [Panel](/docs/panel).

## Methods [#methods]

### log() [#log]

| Method                    | Type                        |
| ------------------------- | --------------------------- |
| `ctx.services.data.log()` | `(message: string) => void` |

Write a log to the terminal UI. &#x2A;*This is more reliable than `console.log`.**

### addBookEvent() [#addbookevent]

| Method                             | Type              |
| ---------------------------------- | ----------------- |
| `ctx.services.data.addBookEvent()` | `(event) => void` |

#### Parameters \[!toc] [#parameters-toc]

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `event`   | `{ type: string, data: Record<string, any> }` |

Adds a new event to the current book.

### tag() [#tag]

| Method                    | Type             |
| ------------------------- | ---------------- |
| `ctx.services.data.tag()` | `(data) => void` |

#### Parameters \[!toc] [#parameters-toc-1]

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `data`    | `Record<string, string \| number \| boolean>` |

Tag the current simulation for statistical analysis and book filtering.

### tagSymbolOccurrence() [#tagsymboloccurrence]

| Method                                    | Type             |
| ----------------------------------------- | ---------------- |
| `ctx.services.data.tagSymbolOccurrence()` | `(data) => void` |

#### Parameters \[!toc] [#parameters-toc-2]

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `data`    | `{ kind: number; symbolId: string; [key: string]: any; }` |

A wrapper around `ctx.services.data.tag()` to tag symbol occurrences.
Win types already call this under the hood to document symbol hits.


# Game Service (/docs/core/game-context/game-service)



***

## Methods [#methods]

### getReelsetById() [#getreelsetbyid]

| Method                               | Type                      |
| ------------------------------------ | ------------------------- |
| `ctx.services.game.getReelsetById()` | `(gameMode, id) => Reels` |

#### Parameters \[!toc] [#parameters-toc]

| Parameter  | Type     |
| ---------- | -------- |
| `gameMode` | `string` |
| `id`       | `string` |

Retrieves a reel set by its ID within a specific game mode.

### getFreeSpinsForScatters() [#getfreespinsforscatters]

| Method                                        | Type                                 |
| --------------------------------------------- | ------------------------------------ |
| `ctx.services.game.getFreeSpinsForScatters()` | `(spinType, scatterCount) => number` |

#### Parameters \[!toc] [#parameters-toc-1]

| Parameter      | Type       |
| -------------- | ---------- |
| `spinType`     | `SpinType` |
| `scatterCount` | `number`   |

Retrieves the number of free spins awarded for a given spin type and scatter count
based on the `scatterToFreespins` configuration.

### getResultSetByCriteria() [#getresultsetbycriteria]

| Method                                       | Type                            |
| -------------------------------------------- | ------------------------------- |
| `ctx.services.game.getResultSetByCriteria()` | `(mode, criteria) => ResultSet` |

#### Parameters \[!toc] [#parameters-toc-2]

| Parameter  | Type     |
| ---------- | -------- |
| `mode`     | `string` |
| `criteria` | `string` |

Retrieves a result set by its criteria within a specific game mode.

### getSymbolArray() [#getsymbolarray]

| Method                               | Type                 |
| ------------------------------------ | -------------------- |
| `ctx.services.game.getSymbolArray()` | `() => GameSymbol[]` |

Returns all symbols as an array.

### getCurrentGameMode() [#getcurrentgamemode]

| Method                                   | Type             |
| ---------------------------------------- | ---------------- |
| `ctx.services.game.getCurrentGameMode()` | `() => GameMode` |

Gets the configuration for the current [game mode](/docs/core/config/game-modes).

### verifyScatterCount() [#verifyscattercount]

| Method                                   | Type                      |
| ---------------------------------------- | ------------------------- |
| `ctx.services.game.verifyScatterCount()` | `(numScatters) => number` |

#### Parameters \[!toc] [#parameters-toc-3]

| Parameter     | Type     |
| ------------- | -------- |
| `numScatters` | `number` |

Ensures the requested number of scatters is valid based on the game configuration.
Returns a valid number of scatters.

### awardFreespins() [#awardfreespins]

| Method                               | Type               |
| ------------------------------------ | ------------------ |
| `ctx.services.game.awardFreespins()` | `(amount) => void` |

#### Parameters \[!toc] [#parameters-toc-4]

| Parameter | Type     |
| --------- | -------- |
| `amount`  | `number` |

Adds the given number of free spins to the state.

### dedupeWinSymbols() [#dedupewinsymbols]

| Method                                 | Type                                       |
| -------------------------------------- | ------------------------------------------ |
| `ctx.services.game.dedupeWinSymbols()` | `(winCombinations) => { reelIdx, rowIdx }` |

#### Parameters \[!toc] [#parameters-toc-5]

| Parameter         | Type               |
| ----------------- | ------------------ |
| `winCombinations` | `WinCombination[]` |

#### Return Object \[!toc] [#return-object-toc]

| Parameter | Type     |
| --------- | -------- |
| `reelIdx` | `number` |
| `rowIdx`  | `number` |

When working with `winCombinations` returned from any win type, make sure you dedupe winning symbols.
It may be possible for the same symbol (e.g. Wild) to be included in multiple win combinations.
If you then wanted to tumble the board based on the winning symbols, that Wild symbol would be tumbled multiple times,
which might lead to errors.

Another example is games like "Sugar Rush", where winning combinations increase a multiplier on the board.
You wouldn't want the same symbol to trigger a multiplier increase multiple times.


# Context (/docs/core/game-context)



***

## Introduction [#introduction]

The context (or game context) provides access to the underlying state.
It also provides many utility functions that ease game implementation.
The context is typically accessed via the `ctx` parameter in [hooks](/docs/core/config/hooks).

```ts lineNumbers
type Context = GameContext<GameModesType, SymbolsType, UserStateType>

export function onHandleGameFlow(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  ctx.services.board.drawBoardWithRandomStops(reels)
  //                           type safe! ⤵
  const scatter = ctx.config.symbols.get("S")!
  const [count] = ctx.services.board.countSymbolsOnBoard(scatter)
}
```

## Properties [#properties]

### config [#config]

You can access the complete game configuration through the context.
Keep in mind that you **shouldn't do any modifications to your game config** inside your game implementation.

```ts
const config = ctx.config
```

[Further reading](/docs/core/game-context/config)

### services [#services]

Services are cohesive function groups that encapsulate and manage specific parts of the game state.
You will use them often when implementing your game.

* [Game Service](/docs/core/game-context/game-service)
* [Data Service](/docs/core/game-context/data-service)
* [Board Service](/docs/core/game-context/board-service)
* [Wallet Service](/docs/core/game-context/wallet-service)
* [RNG Service](/docs/core/game-context/rng-service)

### state [#state]

The core game state exposes some underlying state and information about the current simulation.

[Further reading](/docs/core/game-context/state)


# RNG Service (/docs/core/game-context/rng-service)



***

## Introduction [#introduction]

The RNG service is connected to the underlying program. If you ever need a random outcome
in your game implementation, use this seeded RNG service for reproducible results.

## Methods [#methods]

### weightedRandom() [#weightedrandom]

| Method                              | Type                  |
| ----------------------------------- | --------------------- |
| `ctx.services.rng.weightedRandom()` | `(weights) => string` |

#### Parameters \[!toc] [#parameters-toc]

| Parameter | Type                     |
| --------- | ------------------------ |
| `weights` | `Record<string, number>` |

Weighted draw of key from a mapping of keys to weights.

### randomItem() [#randomitem]

| Method                          | Type           |
| ------------------------------- | -------------- |
| `ctx.services.rng.randomItem()` | `(array) => T` |

#### Parameters \[!toc] [#parameters-toc-1]

| Parameter | Type       |
| --------- | ---------- |
| `array`   | `Array<T>` |

Gets a random item from an array.

### shuffle() [#shuffle]

| Method                       | Type               |
| ---------------------------- | ------------------ |
| `ctx.services.rng.shuffle()` | `(array) => Array` |

#### Parameters \[!toc] [#parameters-toc-2]

| Parameter | Type    |
| --------- | ------- |
| `array`   | `Array` |

Shuffles an array.

### randomFloat() [#randomfloat]

| Method                           | Type                    |
| -------------------------------- | ----------------------- |
| `ctx.services.rng.randomFloat()` | `(low, high) => number` |

#### Parameters \[!toc] [#parameters-toc-3]

| Parameter | Type     |
| --------- | -------- |
| `low`     | `number` |
| `high`    | `number` |

Gets a random float between two numbers.


# State (/docs/core/game-context/state)



***

## Introduction [#introduction]

The core game state holds useful information about the current simulation.

<Callout type="warn">
  Most of the state is handled automatically during simulation, or when calling service
  methods. You won't need to touch most of it. Defined [custom additional
  state](/docs/core/config/custom-state) is available under `ctx.state.userData`
</Callout>

Wrong usage can break simulations!

## Properties [#properties]

| Property                | Type                  | Description                                                                                                                                        |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentGameMode`       | `string`              | The name of the currently simulated game mode.<br />&#x2A;*Serves internal purposes only. Do not modify!**                                         |
| `currentSpinType`       | `string`              | As defined under `SPIN_TYPE`.                                                                                                                      |
| `currentResultSet`      | `ResultSet`           | The current result set. Useful to conditionally do things to achieve certain outcomes.<br />&#x2A;*Serves internal purposes only. Do not modify!** |
| `isCriteriaMet`         | `boolean`             | **Serves internal purposes only. Do not modify!**                                                                                                  |
| `currentFreespinAmount` | `number`              | Stores the number of remaining free spins. Increased using `awardFreespins()` from game service. Reduce manually.                                  |
| `totalFreespinAmount`   | `number`              | Stores the number of total awarded free spins. Increased using `awardFreespins()` from game service. Don't reduce.                                 |
| `triggeredFreespins`    | `boolean`             | Whether free spins were triggered. Set using `awardFreespins()` from game service.                                                                 |
| `triggeredMaxWin`       | `boolean`             | Whether a max win was triggered. Set automatically at the end of a simulation.                                                                     |
| `userData`              | `Record<string, any>` | Custom user state as defined in the game config. Do with it what you want.                                                                         |
| `skipAttempt`           | `boolean`             | Can be set to `true` to skip a simulation attempt.                                                                                                 |


# Wallet Service (/docs/core/game-context/wallet-service)



***

## Introduction [#introduction]

The underlying wallet state holds information on **several types of win data**.
You should **understand the intentions and use cases** of the wallet state
to ensure correct usage of this service.

Each win saving state holds a number representing the bet multiplier payout.

### Win \[!toc] [#win-toc]

Internally called `currentWin`, this state saves the total wins of a single simulation.
This value must be updated by the user by calling `confirmSpinWin()`, after wins have been added with `addSpinWin()`.

**This value is read by the program to determine the final payout of a simulation.**

### Spin Win \[!toc] [#spin-win-toc]

The spin win (`currentSpinWin`) holds information about the win of a single spin.
During free spins logic, the spin win must be confirmed/reset before each new free spin.

### Tumble Win \[!toc] [#tumble-win-toc]

A tumble win (`currentTumbleWin`) is accumulated by calling `addTumbleWin()`.

Effectively, this state isn't too different from the spin win. It serves the purpose of having a separate
state to store tumble wins in - specifically for event recording / frontend display purposes.

## Methods [#methods]

### addSpinWin() [#addspinwin]

| Method                             | Type               |
| ---------------------------------- | ------------------ |
| `ctx.services.wallet.addSpinWin()` | `(amount) => void` |

#### Parameters \[!toc] [#parameters-toc]

| Parameter | Type     |
| --------- | -------- |
| `amount`  | `number` |

This method adds the given amount to the wallet state.

After calculating the win for a board, call this method to update the wallet state.
If your game has tumbling mechanics, you should call this method again after every new
tumble and win calculation.

### addTumbleWin() [#addtumblewin]

| Method                               | Type               |
| ------------------------------------ | ------------------ |
| `ctx.services.wallet.addTumbleWin()` | `(amount) => void` |

#### Parameters \[!toc] [#parameters-toc-1]

| Parameter | Type     |
| --------- | -------- |
| `amount`  | `number` |

Helps to add tumble wins to the wallet state.

This also calls `addSpinWin()` internally, to add the tumble win to the overall spin win.

### confirmSpinWin() [#confirmspinwin]

| Method                                 | Type         |
| -------------------------------------- | ------------ |
| `ctx.services.wallet.confirmSpinWin()` | `() => void` |

Confirms the wins of the current spin.

Should be called after `addSpinWin()`, and after your tumble events are played out,
and after a (free) spin is played out to finalize the win.

### getCurrentWin() [#getcurrentwin]

| Method                                | Type           |
| ------------------------------------- | -------------- |
| `ctx.services.wallet.getCurrentWin()` | `() => number` |

Gets the current total win of the simulation.

### getCurrentSpinWin() [#getcurrentspinwin]

| Method                                    | Type           |
| ----------------------------------------- | -------------- |
| `ctx.services.wallet.getCurrentSpinWin()` | `() => number` |

Gets the total win of the current spin or simulation.

### getCurrentTumbleWin() [#getcurrenttumblewin]

| Method                                      | Type           |
| ------------------------------------------- | -------------- |
| `ctx.services.wallet.getCurrentTumbleWin()` | `() => number` |

Gets the current total tumble win.


# Implementing your Game (/docs/core/game-implementation)





***

## Quick Start [#quick-start]

The entire game flow will live inside a single hook that is passed to the game configuration.

```ts lineNumbers
export const game = createSlotGame({
  /* the rest of your configuration */
  hooks: {
    onHandleGameFlow(ctx) {
      // implement your game here
    },
  },
})
```

As a game implementation might be a couple hundred lines long, you could **write your implementation in a different file**.

```ts lineNumbers
import { GameContext } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from "./your-main-file"

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

export function onHandleGameFlow(ctx: Context) {
  // ...
}
```

<Callout title="Example Implementation">
  Check out a complete game flow example [on our
  GitHub](https://github.com/slot-engine/slot-engine/blob/main/examples/cluster_example/src/onHandleGameFlow.ts).
</Callout>

## Dos and Don'ts [#dos-and-donts]

### ✅ Do \[!toc] [#-do-toc]

#### Pass game context around \[!toc] [#pass-game-context-around-toc]

If you want to separate your game implementation into multiple functions to avoid code duplication,
you can safely pass the context between functions.

```ts lineNumbers
export function onHandleGameFlow(ctx: Context) {
  drawBoard(ctx)
}

function drawBoard(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  // ...
}
```

### ❌ Don't \[!toc] [#-dont-toc]

#### Destroy reference to the context object \[!toc] [#destroy-reference-to-the-context-object-toc]

Your simulations will not work as intended if you do this.

```ts lineNumbers
export function onHandleGameFlow(ctx: Context) {
  const nope = { ...ctx }
  const yesButWhy = ctx
}
```

## Game Flow Visualization [#game-flow-visualization]

To help you understand slot game flows, here is a graphic showing a general game flow.

<img alt="Game Flow Graphic" src="__img0" />

## Next Steps [#next-steps]

Learn about the [context object](/docs/core/game-context) and what role it plays when implementing your game.


# Win Calculation (/docs/core/game-implementation/win-calculation)



***

## Introduction [#introduction]

There are multiple approaches for calculating wins, depending of the type of game you're going for.

### Context \[!toc] [#context-toc]

Each win type operates disconnected from the game context, that's why you have to explicitly
pass the game context to the win type class constructor.

### Configuration \[!toc] [#configuration-toc]

The configuration options depend on the win type.

### Wild Symbol \[!toc] [#wild-symbol-toc]

To ensure wild symbols are recognized and handled correctly during calculation,
you must pass one of the following to the win type constructor:

A complete game symbol ...

```ts lineNumbers
const wildSymbol = ctx.config.symbols.get("W")

const lines = new LinesWinType({
  wildSymbol,
  // ...
})
```

... or a property that identifies one or more symbols.

```ts lineNumbers
const lines = new LinesWinType({
  wildSymbol: { isWild: true },
  // ...
})
```

### Post-Processing \[!toc] [#post-processing-toc]

After calculating wins you have the option to process them further, e.g. multiply by a global multiplier.

```ts lineNumbers
const { payout, winCombinations } = lines
  .evaluateWins(ctx.services.board.getBoardReels())
  .postProcess((wins, ctx) => {
    // Example: Apply 2x multiplier during free spins

    let multiplier = 1
    if (ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS) {
      multiplier = 2
    }

    return {
      winCombinations: wins.map((w) => ({
        ...w,
        payout: w.payout * multiplier,
      })),
    }
  })
  .getWins()
```

`postProcess` should return the modified win combinations. The resulting total `payout` from `getWins()`
will be recalculated based on your modifications to the win combinations.

While you're not forced to use `postProcess()` to modify the win data,
it provides an opinionated way of writing cohesive win evaluation logic.

## Paylines Wins [#paylines-wins]

Calculation of classic line-based wins.

```ts lineNumbers
import { LinesWinType } from "@slot-engine/core"

export function onHandleGameFlow(ctx: Context) {
  const wildSymbol = ctx.config.symbols.get("W")

  const lines = new LinesWinType({
    ctx,
    lines: {
      1: [0, 0, 0, 0, 0],
      2: [1, 1, 1, 1, 1],
      3: [2, 2, 2, 2, 2],
      // ...
    },
    wildSymbol,
  })

  const { payout, winCombinations } = lines
    .evaluateWins(ctx.services.board.getBoardReels())
    .getWins()
}
```

## Cluster Wins [#cluster-wins]

Cluster-based win calculation.

```ts lineNumbers
import { ClusterWinType } from "@slot-engine/core"

export function onHandleGameFlow(ctx: Context) {
  const wildSymbol = ctx.config.symbols.get("W")

  const cluster = new ClusterWinType({
    ctx,
    wildSymbol,
  })

  const { payout, winCombinations } = cluster
    .evaluateWins(ctx.services.board.getBoardReels())
    .getWins()
}
```

## Manyways Wins [#manyways-wins]

Megaways or 243-ways -esque calculations.

```ts lineNumbers
import { ManywaysWinType } from "@slot-engine/core"

export function onHandleGameFlow(ctx: Context) {
  const wildSymbol = ctx.config.symbols.get("W")

  const ways = new ManywaysWinType({
    ctx,
    wildSymbol,
  })

  const { payout, winCombinations } = ways
    .evaluateWins(ctx.services.board.getBoardReels())
    .getWins()
}
```

### Jumping gaps \[!toc] [#jumping-gaps-toc]

This win type has a unique option, in that it's able to jump gaps when calculating wins.
That means it's possible for wins to start at any reel from left to right, and gap reels
(a reel without the winning symbol) will not interrupt the win ways.

```ts lineNumbers
const boardReels = ctx.services.board.getBoardReels()

const { payout, winCombinations } = ways
  .evaluateWins(boardReels, { jumpGaps: true })
  .getWins()

// |A|A|C|C|A|
// |B|A|C|A|C|
// |B|A|B|A|C|
// A: 6-way win, 4 of a kind
// B: no win
// C: 4-way win, 3 of a kind
```


# Analyzing your Game (/docs/core/game-tasks/analysis)



***

## Introduction [#introduction]

Configure analysis to get useful statistics about your game.

Analyzing your game is quite simple:

<Steps>
  <Step>
    Simply adjust your `runTasks()` configuration to include analysis:

    ```ts lineNumbers=11
    game.runTasks({
      // ...
      doAnalysis: true,
      analysisOpts: {
        gameModes: ["base"],
        // Optionally analyze hit rates of tagged simulations
        tagStats: [
          { groupBy: ["symbolId", "kind", "spinType"] }, // Hit rates of win combinations
          { groupBy: ["criteria"] }, // Hit rates of criteria
        ],
      },
    })
    ```
  </Step>
</Steps>

## Analyze Hit Rates [#analyze-hit-rates]

Using the option `tagStats`, you can generate the `stats_tags.json` file to get
a breakdown of hit rates for simulations with arbitrary tags.
Hit rates are calculated considering the weights in the lookup table.

`tagStats` is an array of configurations, where a config item is built like this:

```ts
interface TagStatsConfig {
  /**
   * Properties to group by from the tagged search entries.
   * E.g. `["symbolId", "kind", "spinType"]` for symbol hit rates.
   */
  groupBy: string[]
  /**
   * Optional filter to only include tags matching these values.
   */
  filter?: Record<string, string>
  /**
   * Optional custom name for this stats group in the output.
   */
  name?: string
}
```

The resulting file will look like this:

```json title="stats_tags.json"
[
  {
    "gameMode": "base",
    "groups": [
      {
        "name": "symbolId_kind_spinType",
        "groupBy": ["symbolId", "kind", "spinType"],
        "items": [
          {
            "key": "L3|5|basegame",
            "properties": {
              "symbolId": "L3",
              "kind": "5",
              "spinType": "basegame"
            },
            "count": 39979,
            "hitRateString": "1 in 12",
            "hitRate": 11.739591272077966
          }
          // ...
        ]
      }
      // ...
    ]
  }
]
```

## Output Files / Publish Files [#output-files--publish-files]

The output will be written to the `__build__` directory.

### stats\_payouts.json \[!toc] [#stats_payoutsjson-toc]

Contains a list of win ranges and how many simulations (from the final lookup table) fall into those ranges.

### stats\_summary.json \[!toc] [#stats_summaryjson-toc]

Contains various statistics about volatility, hit rates, etc.

### stats\_tags.json \[!toc] [#stats_tagsjson-toc]

Arbitrary hit rate analysis.


# Optimizing your Game (/docs/core/game-tasks/optimization)



***

## Introduction [#introduction]

After simulating and analyzing the outcomes of your game, you may notice that
your RTP may be too high or too low and that the game may generally be unbalanced.
To achieve a desired target RTP, the optimizer can be used.

The optimizer is a **first-party, pure TypeScript** package: `@slot-engine/optimizer`.
It assigns new weights to your lookup tables so the game pays out **exactly** the configured RTP,
with the configured hit rates and payout distribution per criteria.

Under the hood, it solves a convex optimization problem: it finds the weight distribution
**closest to your simulated results** (minimum KL-divergence) that satisfies all hit rate
and RTP constraints exactly. The solution is deterministic and runs in seconds, even for
millions of simulations.

After optimization is done, you can observe that the weights in your lookup tables have been redistributed.

Before:

```csv
1,1,780
2,1,1000
3,1,0
...
```

After:

```csv
1,1816455674,780
2,58062661,1000
3,19165815565,0
...
```

## Configuration [#configuration]

<Steps>
  <Step>
    Ensure your simulations cover a wide range of outcomes. Otherwise the optimizer might
    struggle to work properly. You can configure [analysis](/docs/core/game-tasks/analysis)
    to get an overview of all payout ranges and how often certain outcomes appear. Ensure
    there are sufficient outcomes for each payout range.
  </Step>

  <Step>
    Call `configureOptimization()` on your game.
    The keys of the config object are your game mode names,
    each defining an optimization target per `ResultSet` criteria.

    ```ts lineNumbers
    const game = createSlotGame({
      /* ... */
    })

    game.configureOptimization({
      base: {
        targets: {
          // Losing books: no hitRate, so they absorb the remaining probability
          "0": {},
          // No rtp / avgWin, so this criteria gets the remaining RTP of the mode
          basegame: { hitRate: 4 },
          freespins: { hitRate: 150, rtp: 0.38 },
          // All maxwin books pay exactly 5000x, so the RTP
          // contribution is fixed at 5000 / 500000 = 0.01
          maxwin: { hitRate: 500_000 },
        },
      },
      bonus: {
        targets: {
          // Absorbs the remaining probability and gets the remaining RTP
          freespins: {},
          maxwin: { hitRate: 5000 },
        },
      },
    })
    ```
  </Step>

  <Step>
    Finally call `runTasks()` on your game

    ```ts lineNumbers
    game.runTasks({
      doSimulation: true,
      doOptimization: true,
    })
    ```
  </Step>
</Steps>

The target RTP of each game mode is taken from the `rtp` of your game mode configuration,
so you don't need to define it again.

### Optimization Targets [#optimization-targets]

By default, each `ResultSet` of a game mode must have a corresponding optimization target, named after its criteria.

But you can add more targets by defining `match` to target arbitrary books by tags, payout ranges and/or criteria instead — see [matching books](#matching-books).

A target defines **which books** it applies to, **how often** it occurs, and **how much** it pays out:

| Property  | Type          | Description                                                                                                                            |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `match`   | `TargetMatch` | Optionally restrict this target to books matching the given tags, payout range and/or criteria. See [matching books](#matching-books). |
| `hitRate` | `number`      | The target hit rate as "1 in N spins", e.g. `150` to hit once every 150 spins.                                                         |
| `rtp`     | `number`      | The target RTP contribution as a fraction of the bet cost, e.g. `0.38`. All contributions must sum to the game mode RTP.               |
| `avgWin`  | `number`      | The target average payout multiplier per hit, e.g. `5000`. Alternative to `rtp` (don't define both).                                   |
| `scale`   | `ScaleRule[]` | Optional rules to reshape the payout distribution within this criteria. See [scaling](#scaling).                                       |

**All properties are optional**, with the following rules:

* `hitRate` may be omitted for **at most one** target per game mode.
  That target then **absorbs the remaining probability**. This is typically used for
  the losing criteria (`"0"`) or the most frequent criteria of a bonus mode.
* Targets without `rtp` / `avgWin` automatically **share the remaining RTP** of the game mode.
  At least one multi-payout target should leave its RTP open, so the optimizer has room
  to hit the game mode RTP exactly.
* If all results of a criteria pay the same amount (e.g. max wins), its RTP contribution
  is already fixed by `hitRate` alone — don't define `rtp` / `avgWin` for it.

If your targets are contradictory or mathematically impossible to satisfy with the simulated
results, the optimizer throws a **descriptive error** telling you which target is infeasible
and what range would be achievable.

### Matching Books [#matching-books]

By default, a target's key must equal a `ResultSet` criteria name and the target applies to
**all books of that criteria**. Define `match` to instead select books by **payout range**,
**tags** and/or **criteria** — the target's key then becomes just a label.

```ts lineNumbers
game.configureOptimization({
  base: {
    targets: {
      "0": {},
      basegame: { hitRate: 4 },
      // claims all books paying 500x or more, regardless of criteria
      bigwins: { match: { winRange: [500, 5000] }, hitRate: 5000, rtp: 0.1 },
      freespins: { hitRate: 150 },
    },
  },
})
```

| Property   | Type                                          | Description                                                                                                      |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `criteria` | `string \| string[]`                          | Match books belonging to one or more `ResultSet` criteria.                                                       |
| `tags`     | `Record<string, string \| number \| boolean>` | Match books tagged with **all** of the given properties via [`tag()`](/docs/core/game-context/data-service#tag). |
| `winRange` | `[number, number]`                            | Match books whose payout multiplier falls within the inclusive range `[min, max]`.                               |

If multiple `match` properties are defined, **all of them must match**. E.g. combining
`criteria` and `winRange` matches only books of that criteria that also fall within the payout range.

#### Matching by tags [#matching-by-tags]

Tag books during simulation with [`ctx.services.data.tag()`](/docs/core/game-context/data-service#tag),
then match them by that tag:

```ts lineNumbers
// in your game logic, e.g. when a retrigger occurs
ctx.services.data.tag({ retrigger: true })
```

```ts lineNumbers
game.configureOptimization({
  base: {
    targets: {
      "0": {},
      basegame: { hitRate: 4 },
      retriggers: { match: { tags: { retrigger: true } }, hitRate: 400, rtp: 0.15 },
      freespins: { hitRate: 150, rtp: 0.3 },
      maxwin: { hitRate: 500_000 },
    },
  },
})
```

#### Matching order [#matching-order]

* Targets with `match` claim their books **before** plain criteria targets, **in the order they
  are defined** — the first matching target wins.
* Books not claimed by any `match` target fall back to the target whose key equals their
  `ResultSet` criteria.
* Every book must end up covered by **exactly one** target. The optimizer throws if any books
  remain unmatched, or if a target (matcher or criteria) doesn't match any books.

<Callout type="warn" title="Order matters">
  Because matchers claim books before criteria fallbacks, a `match` target can "steal" books from a
  criteria target declared elsewhere. In the example above, books from `basegame` paying 500x or
  more are assigned to `bigwins`, not `basegame` — even though `basegame` is also a target. This
  shrinks `basegame`'s payout range, which can change how aggressively its remaining books need to
  be tilted to hit its configured hit rate / RTP.
</Callout>

### Scaling [#scaling]

With scaling you can artificially increase (or decrease) the chances of certain win ranges being hit,
reshaping the payout distribution of a criteria. The configured hit rates and RTP still hold exactly —
scaling only changes the **shape** of the distribution.

```ts lineNumbers
game.configureOptimization({
  base: {
    targets: {
      "0": {},
      basegame: { hitRate: 4 },
      freespins: {
        hitRate: 150,
        rtp: 0.38,
        // Make 50x-150x freespin wins 1.2x more likely
        scale: [{ winRange: [50, 150], factor: 1.2 }],
      },
      maxwin: { hitRate: 500_000 },
    },
  },
})
```

| Property   | Type               | Description                                                           |
| ---------- | ------------------ | --------------------------------------------------------------------- |
| `winRange` | `[number, number]` | The inclusive payout multiplier range the rule applies to.            |
| `factor`   | `number`           | The factor the weights in the range are multiplied by. Must be `> 0`. |

## Using the optimizer manually [#using-the-optimizer-manually]

The optimizer is a standalone package. If you need full control, you can call `optimize()` yourself:

```ts lineNumbers
import { optimize } from "@slot-engine/optimizer"

await optimize({
  input: {
    lookupTable: "path_to_lookup_table",
    lookupTableSegmented: "path_to_lookup_table_segmented",
  },
  output: {
    lookupTable: "output_path_to_optimized_lookup_table"
  },
  cost: 1, // game mode cost
  rtp: 0.96, // target RTP
  targets: {
    /* ... */
  },
})
```

`optimize()` reads the unoptimized lookup table, solves the optimization problem, and writes
the optimized lookup table. Book ids, order and payouts stay identical — only the weights change.
It returns a result object with the achieved RTP, hit rates and average wins per criteria.

<Callout title="Migrating from the Rust optimizer?">
  Earlier versions of Slot Engine used Stake's Rust-based optimization program.
  The new TypeScript optimizer replaces it entirely:

  * `OptimizationConditions` → plain `targets` objects (see above). `searchConditions` and
    `priority` are no longer needed, since targets are matched by result set criteria and
    solved simultaneously instead of greedily.
  * `OptimizationParameters` → removed. The solver is exact and needs no tuning knobs.
  * `OptimizationScaling` → the optional `scale` array on each target.
  * Rust and cargo are no longer required.
</Callout>


# Simulating your Game (/docs/core/game-tasks/simulation)



***

## Introduction [#introduction]

Configuring a game alone isn't enough - it also has to be simulated to ensure correct functionality.

Simulating your game is quite simple:

<Steps>
  <Step>
    ### Call `configureSimulation()` on your game [#call-configuresimulation-on-your-game]

    ```ts lineNumbers
    const game = createSlotGame({
      /* ... */
    })

    game.configureSimulation({
      simRunsAmount: {
        base: 100_000,
        bonus: 100_000,
      },
      concurrency: 16,
    })
    ```

    * `simRunsAmount` defines the amount of simulations for each game mode. For quick and dirty testing
      you can do 10\_000 simulations, but for production a minimum of 500\_000 is recommended. If you do not wish
      to simulate certain game modes, just exclude them from `simRunsAmount`.
    * `concurrency` controls the amount of threads (Node workers) used for simulation.

    [See all options](#options)
  </Step>

  <Step>
    ### Call `runTasks()` on your game [#call-runtasks-on-your-game]

    ```ts lineNumbers=11
    game.runTasks({
      doSimulation: true,
    })
    ```
  </Step>

  <Step>
    ### Run simulations [#run-simulations]

    Running simulations will generate JSONL and CSV files containing the results of your simulated spins.
    The easiest way to do this is by using the [`tsx` library](https://tsx.hirok.io/).

    ```sh
    cd ./path-to/your-game
    pnpm tsx ./index.ts --slot-engine-run
    ```

    <Callout title="Important">
      For technical reasons, the flag `--slot-engine-run` is required when running your game
    </Callout>
  </Step>
</Steps>

Simulation time can range from a few seconds to several minutes, depending on game modes,
simulation count, thread concurrency, and your hardware.

<Callout type="warn" title="Note">
  **Ensure sufficient disk space** for large and complex games with many events. Slot
  Engine offloads in-memory data to temporary files which grow in size as your game is
  simulating. &#x2A;*Large games with 5+ million simulations can temporarily take up 10-20 GB
  of disk space.**
</Callout>

### configureSimulation() options [#options]

| Property                | Type                     | Description                                                                                                                                                                 | Required |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `simRunsAmount`         | `Record<string, number>` | List of game modes and their simulation count.                                                                                                                              | yes      |
| `concurrency`           | `number`                 | Number of threads (Node worker threads) to use. More threads = faster simulation, but higher CPU usage.<br />Default: 6                                                     |          |
| `maxPendingSims`        | `number`                 | The maximum number of simulation results to keep pending in memory before writing to disk. Basically batch update size. Variable performance / RAM impact.<br />Default: 25 |          |
| `maxDiskBuffer`         | `number`                 | The maximum data buffer in MB for writing simulation results to disk. Variable performance / RAM impact.<br />Default: 150                                                  |          |
| `makeUncompressedBooks` | `boolean`                | Whether uncompressed book files should be created. &#x2A;*Warning: This may use a lot of disk space depending on your game!**                                               |          |

## Output Files / Publish Files [#output-files--publish-files]

The output will be written to the `__build__/publish_files` directory. Those are the **final files**
that can be uploaded to Stake Engine as the "math" part.

### books\_\<gameMode>.jsonl.zst \[!toc] [#books_gamemodejsonlzst-toc]

For each game mode a books file is generated which contains a list of all books (simulations).
That file is compressed using Zstandard compression, because book files tend to get quite large the more events you have.

```jsonl
{"id":1,"payoutMultiplier":780,"events":[{"index":1,"type":"test","data":{"test":123}}]}
{"id":2,"payoutMultiplier":1000,"events":[{"index":1,"type":"test","data":{"test":123}}]}
{"id":3,"payoutMultiplier":0,"events":[{"index":1,"type":"test","data":{"test":123}}]}
...
```

### index.json \[!toc] [#indexjson-toc]

An overview of all simulated game modes and their corresponding file names.

### lookUpTable\_\<gameMode>\_0.csv \[!toc] [#lookuptable_gamemode_0csv-toc]

The lookup table contains a list of all book IDs, a weight, and the payout multiplier (scaled by 100).

A book's weight determines the probability of that outcome being selected by the Stake RGS when resolving a bet.

**By default**, all results have an **equal probability** of being selected.

```csv
ID, weight, payout
1,1,780
2,1,1000
3,1,0
...
```

Since every outcome has the same weight, initial game RTP will likely be too high or too low - this is completely normal.
You will use [optimization](/docs/core/game-tasks/optimization) to automatically redistribute weights
to achieve a specific target RTP with high precision.

## FAQ / Common Issues [#faq--common-issues]

<Accordions>
  <Accordion title="My simulation is very slow or stuck">
    The most common reason for why your simulation might be stuck or progress very slowly is that
    certain **outcomes are very rare** or might **never occur** naturally, for example max wins.

    If you're noticing that simulating max wins or other rare criteria slows down your simulation,
    there's a few things you can do:

    * Make it easier for the program to simulate rare outcomes, for example by using a dedicated
      reel set with more wilds and generally higher symbols.
    * Programmatically force the desired outcome (board setup, multipliers, etc.)
  </Accordion>

  <Accordion title="I'm getting 'Module not found' errors when running the game">
    Ensure you `cd`'ed into the game directory where your game file is.

    If you're running the game from a different directory, add `rootDir: __dirname` to your game configuration.
  </Accordion>

  <Accordion title="JavaScript heap out of memory">
    If Node runs out of memory, you have a few options to consider:

    * Reduce the amount of simulations for a game mode. You generally don't need more than 1-2 million simulations per game mode
    * Increase memory limit in Node
    * Tune the simulation options, specifically `maxPendingSims` and/or `maxDiskBuffer`
  </Accordion>
</Accordions>


# Migration Guides (/docs/core/other/migration-guides)



## Upgrade from 0.2.x to 0.3.x [#upgrade-from-02x-to-03x]

### Replace `record` API with `tag` API [#replace-record-api-with-tag-api]

For clarity, the old "force record" system was renamed to "tagging".
You will need to **replace method calls** and **re-run simulations, because output file names have changed**.
The functionality remains the same.

```ts
ctx.services.data.record({}) // [!code --]
ctx.services.data.tag({}) // [!code ++]

ctx.services.data.recordSymbolOccurrence() // [!code --]
ctx.services.data.tagSymbolOccurrence() // [!code ++]

game.runTasks({
  // ...
  analysisOpts: {
    recordStats: [], // [!code --]
    tagStats: [], // [!code ++]
  },
})
```

### Update optimization configuration [#update-optimization-configuration]

The old and slow Rust optimizer was replaced with a Typescript optimizer, resulting in noticably faster optimization.
The API has also changed. [Learn how to use the new optimizer](/docs/core/game-tasks/optimization)

## Upgrade from 0.1.x to 0.2.x [#upgrade-from-01x-to-02x]

### Adjust npm scripts or commands \[!toc] [#adjust-npm-scripts-or-commands-toc]

Due to technical changes and Panel compatibility, tasks (simulation, optimization, analysis) are only run
when explicitly passing a command line argument. The required argument is `--slot-engine-run`.

For example, when you're using `tsx` to run your games, this is how you must adjust your command:

<CodeBlockTabs defaultValue="Before">
  <CodeBlockTabsList>
    <CodeBlockTabsTrigger value="Before">
      Before
    </CodeBlockTabsTrigger>

    <CodeBlockTabsTrigger value="After">
      After
    </CodeBlockTabsTrigger>
  </CodeBlockTabsList>

  <CodeBlockTab value="Before">
    ```bash
      pnpm tsx ./index.ts
    ```
  </CodeBlockTab>

  <CodeBlockTab value="After">
    ```bash
      pnpm tsx ./index.ts --slot-engine-run
    ```
  </CodeBlockTab>
</CodeBlockTabs>

### Note introduction of new generated files \[!toc] [#note-introduction-of-new-generated-files-toc]

The Core library now produces additional files which contain metadata or other information.
When you're using the new Panel package these files are mandatory for flawless Panel functionality.
Re-run simulations to generate those files.

* `books_chunks/*` (new)
* `books_<name>.index.meta.json` (new)
* `force_keys_<mode>.json` (new)
* `lookUpTable_<mode>.index` (new)
* `lookUpTableSegmented_<mode>.index` (new)
* `simulation_summary.json` (new)
* `stats_payouts.json` (modified structure)

### Note new book files generation \[!toc] [#note-new-book-files-generation-toc]

Uncompressed book files are no longer generated. This saves a lot of hard drive space.
If you need to inspect your book files, you can use the new Panel package.

### Recommendations \[!toc] [#recommendations-toc]

#### Replace your `console.log()` calls \[!toc] [#replace-your-consolelog-calls-toc]

Logging to the console from worker threads is not reliable. A more robust approach to logging
during simulations was added. Access the `log()` method from the data service in your game implementation:
`ctx.services.data.log()`

#### Prefix static reels files with `reels_` \[!toc] [#prefix-static-reels-files-with-reels_-toc]

If you want to use the reel set editor included in Panel, you must rename your
reels CSV files to something like `reels_your-reelset-name.csv`.
Panel scans your game directory for CSV files starting with `reels_` - only those are editable in the reel set editor.


# Overview (/docs/panel/config)



***

## Setting up Panel [#setting-up-panel]

Create a Panel by calling `createPanel()` and passing a configuration object.

```ts lineNumbers title="index.ts"
import { createPanel } from "@slot-engine/panel"
import { game as MyGame } from "../../path-to/my-game"

const panel = createPanel({
  games: [MyGame],
})

panel.start()
```

## createPanel() Options [#options]

| Property | Type         | Description                | Required |
| -------- | ------------ | -------------------------- | -------- |
| `games`  | `SlotGame[]` | A list of connected games. | yes      |


# Bet Simulation (/docs/panel/modules/bet-simulation)



***

## Overview [#overview]

The bet simulation (or crowd simulation) module simulates game behavior with multiple players betting on the game under equal circumstances.
For each "spin" a virtual player does, a random weighted result from the lookup table is chosen, similar to real Stake RGS functionality.

There can be multiple simulation configurations and each can be run independently and simultaneously.

## Configuration [#configuration]

### Virtual Players [#virtual-players]

| Name             | Description                                      |
| ---------------- | ------------------------------------------------ |
| Player Count     | How many players are betting on the game.        |
| Starting Balance | Number of balance units each player starts with. |

### Bet Groups [#bet-groups]

Bet groups allow simulating complex betting sessions. Bet groups are played sequentially.

| Name           | Description                      |
| -------------- | -------------------------------- |
| Mode           | Which mode to bet on.            |
| Number of Bets | How many bets to place.          |
| Bet            | Number of balance units per bet. |


# Explorer (/docs/panel/modules/explorer)



***

## Overview [#overview]

The explorer module lets you browse through the lookup table aswell as the book files.
It provides a convenient way to display book events to help identify correctness of your game's event data.

## Filters [#filters]

Filters let you narrow down the displayed data to your liking.

The available filters depend on your [tags](/docs/core/game-context/data-service#tagging) and how your simulations are tagged.


# Game Information (/docs/panel/modules/information)



***

## Overview [#overview]

The game information module shows insights into game and payout statistics, respectively.

### Game Statistics [#game-statistics]

| Name                   | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Total LUT Weight       | The combined weight of all lookup table entries.                                         |
| Average Win            | The average payout multiplier across all results in the lookup table.                    |
| RTP                    | The theoretical RTP of your game, influenced by weights and payouts in the lookup table. |
| Minimum Win            | Minimum payout multiplier in the lookup table.                                           |
| Maximum Win            | Maximum payout multiplier in the lookup table                                            |
| Standard Deviation     | Standard deviation of payouts in the lookup table.                                       |
| Variance               | Variance of payouts in the lookup table.                                                 |
| Non-zero Hit Rate      | Hit rate of payout > 0.                                                                  |
| Null Hit Rate          | Hit rate of payout == 0.                                                                 |
| Max Win Hit Rate       | Hit rate of max wins.                                                                    |
| Payout \< Bet Hit Rate | Hit Rate of payout smaller than bet.                                                     |
| Unique Payouts         | Number of unique payouts in the lookup table.                                            |

### Payout Statistics [#payout-statistics]

This section, divided into game modes, displays information about payout occurrences and unique payout counts.
This can be used to check the diversity of your payouts.


# Reel Set Designer (/docs/panel/modules/reelset-designer)



***

## Overview [#overview]

The reel set designer module allows editing reel set CSV files via a drag and drop editor.

## Usage [#usage]

### Make Reel Set editable in editor [#make-reel-set-editable-in-editor]

Panel scans your game directory for any CSV files with the naming schema `reels_*.csv`.
Those files will be available for editing in the UI.

### Add new Reel Sets [#add-new-reel-sets]

Currently you can not create new CSV files via the UI. This feature will be added in a future update.

For now, create a new CSV file named `reels_<some-name>.csv` somewhere in your game directory.


# Game Simulation (/docs/panel/modules/simulation)



***

## Overview [#overview]

The simulation module mirrors the behavior of the `game.configureSimulation()` method.

Simulations can be configured, started and stopped from here. You will get visual feedback on
the simulation progress. The terminal UI will still function normally and may contain further logs
which are not viewable in Panel (yet).

### Simulation Summary [#simulation-summary]

After simulation, a detailed breakdown of the simulation is displayed.
This information is also logged to the console.