# SokoForge / 推箱工坊

> 面向推箱子关卡设计、自动求解和高难度关卡筛选的中英文工作台。

[English README](README.md) · [MIT 许可证](LICENSE)

SokoForge 使用 React 构建静态网页界面，使用 Rust 实现规则、求解和生成核心，并编译为 WebAssembly 在浏览器 Worker 中运行。可以在网页编辑地图、自动求解、播放解法、筛选候选；也可以通过原生 Rust CLI 离线生成数千张关卡，再导入网页浏览。

## 功能

- 中文/英文切换，首次访问自动读取浏览器语言。
- 墙、地板、目标、箱子和玩家的可视化编辑器。
- 自定义 `5×5` 到 `12×12` 标准地图；高级编辑最大 `20×20`，会显示性能提示。
- XSB 导入导出、本地保存、撤销重做、方向键/WASD 操作和解法播放。
- 快速求解与最少推动数证明模式。
- 长解、深层陷阱、箱子依赖、综合难度四种筛选方式。
- 浏览器小批量探索；原生 Rust CLI 高效处理 `1000–5000+` 候选。
- 纯静态部署，无账号、数据库或 API Key。

## 本地运行

需要 Node.js 24+ 和 Rust stable：

```bash
npm install
rustup target add wasm32-unknown-unknown
npm run wasm:build
npm run dev
```

生产构建：

```bash
npm run build
```

## 离线批量生成

```bash
cargo run -p sokoforge-cli -- generate \
  --count 5000 --width 10 --height 10 --boxes 4 \
  --mode composite --seed 42 --top 50 --output pack.json
```

在网页“关卡库”中导入 `pack.json`。它是版本化的 `sokoforge-level-pack` JSON，包含 XSB 地图、难度指标、随机种子和可选解法。

求解单个 XSB 文件：

```bash
cargo run -p sokoforge-cli -- solve level.xsb --time-limit-ms 30000
```

## 求解与生成思路

求解器以“推动一次箱子”为搜索边，而不是逐格枚举玩家走路。每个状态保存箱子位置和玩家可达区域；通过 flood fill 找到所有可推动位置后，A* 直接扩展推动动作。最优模式使用箱子到目标的最小匹配下界，完成时能证明最少推动数。

推箱子的搜索空间会指数增长。超时不等于无解：它可能是尚未找到解，也可能找到可行解但未证明最优。网页会明确标记状态，不会将可行解伪称为最优解。

生成器从“所有箱子都在目标上”的完成状态出发，执行合法的反向拉箱，再反转该过程得到保证存在一条正向解的候选地图。CLI 会对候选求解、评分并保留前 N 名。

- **长解**：按地图面积归一化的最少推动数。
- **深层陷阱**：以求解器搜索量近似评估具有迷惑性的分支。
- **箱子依赖**：箱子切换、暂时远离目标和相互让路。
- **综合难度**：长解 40%、依赖 30%、陷阱 30%。

这些是机器难度指标，不等同于所有玩家的体感难度。后续可通过真实玩家完成率、撤销次数和提示使用位置校准模型。

## 算法参考

- Richard E. Korf，*Depth-first Iterative-Deepening: An Optimal Admissible Tree Search*。
- Junghanns 与 Schaeffer，*Sokoban: Enhancing General Single-Agent Search Methods Using Domain Knowledge*，Artificial Intelligence，2001。
- [Sokoban Wiki：Solver](http://www.sokobano.de/wiki/index.php?title=Solver)。
- [Festival solver 概览](http://www.sokobano.de/wiki/index.php?title=Solver:Festival)。

本项目采用 clean-room 实现。其他项目的代码、关卡包、美术和音效只有在许可证明确允许时才能复用。

## 检查与部署

```bash
cargo test --workspace
npm --workspace web run typecheck
npm --workspace web run test
npm run build
```

将 GitHub 仓库导入 Vercel 即可部署。`vercel.json` 会构建 `web/dist` 并按静态单页应用托管。仓库包含经过验证的 WASM 产物，因此 Vercel 不需要预装 Rust；GitHub CI 仍会从 Rust 源码重新构建并验证产物链路。
