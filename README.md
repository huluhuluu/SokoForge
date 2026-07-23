# SokoForge

> A bilingual Sokoban workbench for creating, solving, and forging compact high-difficulty levels.

[中文文档](README.zh-CN.md) · [MIT License](LICENSE)

SokoForge is a static React workbench backed by a Rust solver compiled to WebAssembly. Build levels in the browser, prove the fewest pushes for small and medium boards, explore generated candidates, or use the native Rust CLI to generate thousands of candidates offline and import the best pack.

## Features

- English and Chinese UI with browser-language detection and manual switching.
- Visual editor for walls, floor, goals, boxes, and player positions.
- Standard XSB import/export, local level library, manual-move undo, restart, and keyboard/touch play.
- Steppable solution replay with pause and 0.5x-4x playback speed.
- Fast solution search and a slower shortest-push mode with transparent timeout status.
- Simple, medium, and hard generation tiers backed by solver-certified difficulty gates.
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
  --mode composite --tier hard --seed 42 --top 50 --evolution-rounds 100 \
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

The solver searches **push states**, not ordinary walking states. Each state stores box positions and the player's reachable region. A flood fill finds every legal pushing position, then A* expands pushes directly. Reverse-push tables mark static dead squares and provide wall-aware box-goal distances. The optimal heuristic takes the maximum of minimum box-goal matching and a two-box pattern database, both admissible lower bounds, so a completed result proves the smallest number of pushes within its search limits.

Sokoban search grows exponentially. A timeout means the tool either found no result yet or found a feasible result without proving optimality; it never labels that result as optimal.

Generation carves a connected warehouse, starts with every box on a goal, and makes legal **reverse pulls**. Reversing those pulls produces a valid forward solution. Pull selection favors temporary movement away from goals, box revisits, goal reopening, narrow turning squares, and box-order changes. The native generator evolves finalist geometry, applies novelty selection to avoid near-duplicate structures and behaviors, then keeps only levels whose minimum push count is proven by the optimal solver.

- **Simple**: at most 10 optimal pushes.
- **Medium**: 8-18 optimal pushes.
- **Hard**: at least 16 optimal pushes plus both a deep-lure signal and an ordering/dependency signal.

For optimally certified finalists, the first four critical pushes are counterfactually analyzed. Alternative pushes contribute delayed-regret, false-goal, and proven-deadlock signals. Other metrics include boxes moved away from goals, reopened goals, box revisits, role swaps, and tunnel commitments. The bundled 200-level replacement contains unique 9x9-11x11 maps with 4-5 boxes and 16-35 optimal pushes; all 200 were independently re-solved through the production WebAssembly build.

These are algorithmic signals, not a claim that every player will perceive identical difficulty. Player telemetry can calibrate them in a future hosted edition.

## Algorithms and References

- A* and IDA* foundations: Richard E. Korf, *Depth-first Iterative-Deepening: An Optimal Admissible Tree Search*.
- Sokoban domain search: Junghanns and Schaeffer, *Sokoban: Enhancing General Single-Agent Search Methods Using Domain Knowledge* (Artificial Intelligence, 2001).
- Hard-state generation: Bento, Pereira, and Lelis, [*Procedural Generation of Initial States of Sokoban*](https://www.ijcai.org/proceedings/2019/646) (IJCAI 2019).
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

Import the GitHub repository into Vercel and set **Root Directory** to `web`. Vercel detects Vite from `web/package.json`, runs `npm run build`, and serves `dist`; no build override, environment variables, or `vercel.json` are required. A reviewed WASM artifact is tracked under `web/public/wasm`, so Vercel does not need Rust or wasm-pack. CI rebuilds that artifact and rejects source/artifact drift.
