# SokoForge / 推箱工坊

> 面向推箱子关卡设计、自动求解和高难度关卡筛选的中英文工作台。

[English README](README.md) · [MIT 许可证](LICENSE)

SokoForge 使用 React 构建静态网页界面，使用 Rust 实现规则、求解和生成核心，并编译为 WebAssembly 在浏览器 Worker 中运行。可以在网页编辑地图、自动求解、播放解法、筛选候选；也可以通过原生 Rust CLI 离线生成数千张关卡，再导入网页浏览。

## 功能

- 中文/英文切换，首次访问自动读取浏览器语言。
- 墙、地板、目标、箱子和玩家的可视化编辑器。
- 自定义 `5×5` 到 `12×12` 标准地图；高级编辑最大 `20×20`，会显示性能提示。
- XSB 导入导出、本地保存、移动回退、重新开始以及键盘/触屏操作。
- 解法可前后单步、暂停，并支持 `0.5×–4×` 倍速播放。
- 快速解与较慢但保证最少推动数的最短解模式。
- 简单、中等、困难三档生成模式，并由求解器指标执行分档。
- 浏览器小批量探索；原生 Rust CLI 高效处理 `1000–5000+` 候选。
- 可下载完整生成包、批量导入 JSON/XSB，并在 Chromium 中记住本地关卡目录。
- 除入门关卡外，内置 200 个紧凑且已证明最少推动数的专家关卡。
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
  --mode composite --tier hard --seed 42 --top 50 --evolution-rounds 100 \
  --finalist-time-limit-ms 60000 --output pack.json
```

在网页“关卡库”中导入 `pack.json`。它是版本化的 `sokoforge-level-pack` JSON，包含 XSB 地图、难度指标、随机种子和可选解法。

## 保存与重新识别关卡包

浏览器批量生成结束后，点击“下载关卡包”会把当前排名结果保存为一个 JSON 文件。关卡库支持一次选择多个 `.json` 关卡包和独立 `.xsb` 地图。

Chromium 浏览器还可以使用“选择关卡目录”。由于浏览器安全限制，第一次必须由用户主动选择；SokoForge 会把目录句柄保存在 IndexedDB 中，后续访问在权限仍有效时自动扫描。生成页的“保存到目录”会直接写入该目录。Firefox 和 Safari 暂不提供相同的目录 API，因此使用普通下载与多文件导入作为回退。

求解单个 XSB 文件：

```bash
cargo run -p sokoforge-cli -- solve level.xsb --time-limit-ms 30000
```

## 发布静态关卡

官方发布关卡不需要数据库。少量关卡可以将 XSB 文件添加到 `web/public/levels/`，再向 `web/public/levels/index.json` 增加元数据。大型关卡集使用 `sokoforge-published-pack` JSON，并在索引的 `packs` 数组中引用，避免启动时产生数百个请求。两种形式都包含稳定 ID、中英文标题、难度、箱子数和已验证的最少推动数。

提交 Pull Request 前应先验证关卡：

```bash
cargo run -p sokoforge-cli -- solve web/public/levels/my-level.xsb --time-limit-ms 30000
```

这种方式可以直接使用 GitHub 审核和 Vercel 静态缓存，不需要账号或数据库。玩家私人关卡仍保存在浏览器中，也可以导出为 XSB 或 JSON 关卡包。

## 求解与生成思路

求解器以“推动一次箱子”为搜索边，而不是逐格枚举玩家走路。每个状态保存箱子位置和玩家可达区域；通过 flood fill 找到所有可推动位置后，A* 直接扩展推动动作。反向推动表会标记静态死方格并计算考虑墙体的箱子-目标距离；最优启发式取最小匹配与二箱模式数据库的最大值，两者都是可采纳下界，因此完成时能证明最少推动数。

推箱子的搜索空间会指数增长。超时不等于无解：它可能是尚未找到解，也可能找到可行解但未证明最优。网页会明确标记状态，不会将可行解伪称为最优解。

生成器先雕刻连通仓库，再从“所有箱子都在目标上”的完成状态出发，执行合法的反向拉箱。拉箱选择会主动偏好暂时远离目标、回访箱子、重开目标、狭窄转向格和改变箱子顺序。CLI 对决赛地图进行墙体进化，并用 Novelty 同时保持墙形和解法行为多样性，最后只保留已由最优求解器证明最少推动数的结果。

- **简单**：最少推动不超过 10。
- **中等**：最少推动为 8–18。
- **困难**：至少 16 次推动，并同时具有深层诱饵和顺序/依赖陷阱。

对已证明最优的候选，生成器会反事实分析前四次关键推动。错误推动会产生延迟代价、假目标和可证明死锁指标；其他指标包括远离目标、重开已完成目标、箱子回访、角色交换和通道承诺。新内置 200 关全部唯一，尺寸为 `9×9–11×11`、包含 4–5 个箱子、最少推动为 16–35，并已通过最终 WebAssembly 求解器逐关复算。

这些是机器难度指标，不等同于所有玩家的体感难度。后续可通过真实玩家完成率、撤销次数和提示使用位置校准模型。

## 算法参考

- Richard E. Korf，*Depth-first Iterative-Deepening: An Optimal Admissible Tree Search*。
- Junghanns 与 Schaeffer，*Sokoban: Enhancing General Single-Agent Search Methods Using Domain Knowledge*，Artificial Intelligence，2001。
- Bento、Pereira 与 Lelis，[*Procedural Generation of Initial States of Sokoban*](https://www.ijcai.org/proceedings/2019/646)，IJCAI 2019。
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

将 GitHub 仓库导入 Vercel 后，把 **Root Directory** 设置为 `web`。Vercel 会从 `web/package.json` 自动识别 Vite，执行 `npm run build` 并托管 `dist`；不需要覆盖构建命令、环境变量或 `vercel.json`。已验证的 WASM 产物位于 `web/public/wasm`，因此 Vercel 不需要预装 Rust 或 wasm-pack；CI 会重新构建并拒绝源码与产物不一致的提交。
