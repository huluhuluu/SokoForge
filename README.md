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
  --mode composite --seed 42 --top 50 --output pack.json
```

Import `pack.json` from the Library tab. The pack uses a versioned `sokoforge-level-pack` JSON format containing XSB, score metrics, generator metadata, and an optional solution replay.

To solve an XSB file from the command line:

```bash
cargo run -p sokoforge-cli -- solve level.xsb --time-limit-ms 30000
```

## Publishing Static Levels

Published levels are intentionally serverless. Add an XSB file under `web/public/levels/`, then add one metadata entry to `web/public/levels/index.json` with its stable ID, bilingual title, file URL, difficulty, box count, and verified optimal push count. The browser loads this index at startup and fetches each map on demand from the same static deployment.

Before opening a pull request, verify the level:

```bash
cargo run -p sokoforge-cli -- solve web/public/levels/my-level.xsb --time-limit-ms 30000
```

This model works with GitHub review and Vercel caching without accounts or a database. User-created private levels remain in browser storage or can be exported as XSB/JSON packs.

## Solver and Generator

The solver searches **push states**, not ordinary walking states. Each state stores box positions and the player's reachable region. A flood fill finds every legal pushing position, then A* expands pushes directly. The optimal mode uses an admissible box-goal assignment lower bound, so a completed result proves the smallest number of pushes within its search limits.

Sokoban search grows exponentially. A timeout means the tool either found no result yet or found a feasible result without proving optimality; it never labels that result as optimal.

Generation starts from a solved board and makes legal **reverse pulls**. Reversing those pulls produces a valid forward solution. The native generator evaluates candidates, scores them, and retains only the top results. Current scoring exposes four selectable views:

- **Long solution**: high push count relative to board area.
- **Deep trap**: high solver search effort as a first approximation of deceptive choices.
- **Box dependency**: box switching and temporary movement away from goals.
- **Composite**: 40% long solution, 30% dependency, 30% trap.

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
