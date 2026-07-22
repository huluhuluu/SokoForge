# SokoForge

> A bilingual Sokoban workbench for creating, solving, and forging compact high-difficulty levels.

[中文文档](README.zh-CN.md) · [MIT License](LICENSE)

SokoForge is a static React workbench backed by a Rust solver compiled to WebAssembly. Build levels in the browser, prove the fewest pushes for small and medium boards, explore generated candidates, or use the native Rust CLI to generate thousands of candidates offline and import the best pack.

## Features

- English and Chinese UI with browser-language detection and manual switching.
- Visual editor for walls, floor, goals, boxes, and player positions.
- Standard XSB import/export, local level library, undo/redo, keyboard play, and solution playback.
- Quick weighted search and push-optimal A* search with transparent timeout status.
- Four ranking modes: long solution, deep trap, box dependency, and composite.
- Browser batch exploration plus a native parallel Rust CLI for 1,000–5,000+ candidates.
- Generated-pack download, JSON/XSB multi-file import, and remembered local level folders on Chromium.
- 200 bundled compact expert levels in addition to the introductory published set.
- Static Vite output suitable for Vercel. No account, database, or API key is required.

## Quick Start

Prerequisites: Node.js 24+, Rust stable, and the `wasm32-unknown-unknown` target.

```bash
npm install
rustup target add wasm32-unknown-unknown
npm run wasm:build
npm run dev
```

Open the local URL printed by Vite. A production build is created with:

```bash
npm run build
```

## Offline Generator

Use the native CLI when a browser batch would be too expensive:

```bash
cargo run -p sokoforge-cli -- generate \
  --count 5000 --width 10 --height 10 --boxes 4 \
  --mode composite --seed 42 --top 50 --evolution-rounds 100 \
  --finalist-time-limit-ms 60000 --output pack.json
```

Import `pack.json` from the Library tab. The pack uses a versioned `sokoforge-level-pack` JSON format containing XSB, score metrics, generator metadata, and an optional solution replay.

## Saving And Reopening Packs

After a browser batch finishes, use **Download pack** to save every ranked result in one JSON file. The Library accepts multiple `.json` packs and standalone `.xsb` files at once.

Chromium browsers also expose **Choose level folder**. The first selection is always a user action required by the browser security model. SokoForge stores that directory handle in IndexedDB and scans it automatically on later visits while permission remains granted. **Save to folder** writes generated packs there. Firefox and Safari fall back to normal downloads and multi-file import because they do not currently expose the same directory API.

To solve an XSB file from the command line:

```bash
cargo run -p sokoforge-cli -- solve level.xsb --time-limit-ms 30000
```

## Publishing Static Levels

Published levels are intentionally serverless. Small additions can use an XSB file under `web/public/levels/` plus one metadata entry in `web/public/levels/index.json`. Large collections use a `sokoforge-published-pack` JSON file referenced by the index's `packs` array, avoiding hundreds of startup requests. Both forms include stable IDs, bilingual titles, difficulty, box count, and verified optimal push counts.

Before opening a pull request, verify the level:

```bash
cargo run -p sokoforge-cli -- solve web/public/levels/my-level.xsb --time-limit-ms 30000
```

This model works with GitHub review and Vercel caching without accounts or a database. User-created private levels remain in browser storage or can be exported as XSB/JSON packs.

## Solver and Generator

The solver searches **push states**, not ordinary walking states. Each state stores box positions and the player's reachable region. A flood fill finds every legal pushing position, then A* expands pushes directly. The optimal mode uses an admissible box-goal assignment lower bound, so a completed result proves the smallest number of pushes within its search limits.

Sokoban search grows exponentially. A timeout means the tool either found no result yet or found a feasible result without proving optimality; it never labels that result as optimal.

Generation carves a connected warehouse, starts with every box on a goal, and makes legal **reverse pulls**. Reversing those pulls produces a valid forward solution. The native generator ranks a broad candidate pool, optionally evolves the finalists by adding or removing non-critical walls, then keeps only levels whose minimum push count is proven by the optimal solver. Current scoring exposes four selectable views:

- **Long solution**: high push count relative to walkable area.
- **Deep trap**: high solver search effort as a first approximation of deceptive choices.
- **Box dependency**: box switching and temporary movement away from goals.
- **Composite**: 45% long solution, 35% dependency, 20% trap.

These are algorithmic signals, not a claim that every player will perceive identical difficulty. Player telemetry can calibrate them in a future hosted edition.

## Algorithms and References

- A* and IDA* foundations: Richard E. Korf, *Depth-first Iterative-Deepening: An Optimal Admissible Tree Search*.
- Sokoban domain search: Junghanns and Schaeffer, *Sokoban: Enhancing General Single-Agent Search Methods Using Domain Knowledge* (Artificial Intelligence, 2001).
- Solver concepts and deadlock terminology: [Sokoban Wiki](http://www.sokobano.de/wiki/index.php?title=Solver).
- Production solver inspiration: [Festival solver overview](http://www.sokobano.de/wiki/index.php?title=Solver:Festival).

SokoForge is a clean-room implementation. Do not copy level packs, art, or code from other Sokoban projects unless their licenses permit it.

## Development Checks

```bash
cargo test --workspace
npm --workspace web run typecheck
npm --workspace web run test
npm run build
```

GitHub Actions runs formatting, Clippy, Rust tests, TypeScript checks, browser-unit tests, and a Vercel-compatible production build.

## Deployment

Import the GitHub repository into Vercel. `vercel.json` installs dependencies, builds the frontend, and serves `web/dist` as a static single-page application. A reviewed WASM artifact is tracked for hosts without Rust; GitHub CI still rebuilds it from source before every production check.
