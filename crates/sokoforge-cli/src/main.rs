use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use rand::SeedableRng;
use rayon::prelude::*;
use serde::Serialize;
use sokoforge_core::{
    Board, DifficultyMode, SolveMode, SolveOptions, generate_candidate, score_result,
};
use std::fs;

#[derive(Parser)]
#[command(
    name = "sokoforge",
    version,
    about = "Generate and solve Sokoban levels"
)]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Solve {
        input: String,
        #[arg(long, default_value_t = 30_000)]
        time_limit_ms: u64,
    },
    Generate {
        #[arg(long, default_value_t = 1000)]
        count: usize,
        #[arg(long, default_value_t = 10)]
        width: usize,
        #[arg(long, default_value_t = 10)]
        height: usize,
        #[arg(long, default_value_t = 4)]
        boxes: usize,
        #[arg(long, default_value_t = 50)]
        top: usize,
        #[arg(long, default_value_t = 42)]
        seed: u64,
        #[arg(long, value_enum, default_value_t=ModeArg::Composite)]
        mode: ModeArg,
        #[arg(long, default_value = "pack.json")]
        output: String,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum ModeArg {
    LongSolution,
    DeepTrap,
    Dependency,
    Composite,
}
impl From<ModeArg> for DifficultyMode {
    fn from(m: ModeArg) -> Self {
        match m {
            ModeArg::LongSolution => Self::LongSolution,
            ModeArg::DeepTrap => Self::DeepTrap,
            ModeArg::Dependency => Self::Dependency,
            ModeArg::Composite => Self::Composite,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Pack {
    schema_version: u8,
    kind: &'static str,
    seed: u64,
    mode: String,
    levels: Vec<Level>,
}
#[derive(Serialize)]
struct Level {
    id: String,
    name: String,
    xsb: String,
    difficulty: sokoforge_core::DifficultyMetrics,
    solution: String,
}

fn main() -> Result<()> {
    match Args::parse().command {
        Command::Solve {
            input,
            time_limit_ms,
        } => {
            let text = fs::read_to_string(&input).with_context(|| format!("read {input}"))?;
            let board = Board::parse_xsb(&text)?;
            let result = sokoforge_core::solve(
                &board,
                &SolveOptions {
                    mode: SolveMode::Optimal,
                    time_limit_ms,
                    node_limit: 10_000_000,
                },
            );
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        Command::Generate {
            count,
            width,
            height,
            boxes,
            top,
            seed,
            mode,
            output,
        } => {
            let mode_core: DifficultyMode = mode.into();
            let candidates: Vec<Level> = (0..count)
                .into_par_iter()
                .filter_map(|i| {
                    let mut rng = rand::rngs::StdRng::seed_from_u64(seed.wrapping_add(i as u64));
                    let board = generate_candidate(width, height, boxes, &mut rng)?;
                    let result = sokoforge_core::solve(
                        &board,
                        &SolveOptions {
                            mode: SolveMode::Quick,
                            time_limit_ms: 500,
                            node_limit: 250_000,
                        },
                    );
                    if result.status != sokoforge_core::SolveStatus::Solved {
                        return None;
                    }
                    let difficulty = score_result(&result, &board, mode_core);
                    Some(Level {
                        id: format!("generated-{i:05}"),
                        name: format!("Generated {i}"),
                        xsb: board.to_xsb(),
                        difficulty,
                        solution: result.moves,
                    })
                })
                .collect();
            let mut sorted = candidates;
            sorted.sort_by(|a, b| b.difficulty.score.total_cmp(&a.difficulty.score));
            sorted.truncate(top);
            let pack = Pack {
                schema_version: 1,
                kind: "sokoforge-level-pack",
                seed,
                mode: format!("{mode:?}"),
                levels: sorted,
            };
            fs::write(&output, serde_json::to_string_pretty(&pack)?)?;
            println!("Wrote {} levels to {}", pack.levels.len(), output);
        }
    }
    Ok(())
}
