use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use rand::SeedableRng;
use rayon::prelude::*;
use serde::Serialize;
use sokoforge_core::{
    Board, DifficultyMode, SolveMode, SolveOptions, generate_candidate, mutate_geometry,
    score_result,
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
        #[arg(long, default_value_t = 15_000)]
        finalist_time_limit_ms: u64,
        #[arg(long, default_value_t = 4_000_000)]
        finalist_node_limit: usize,
        #[arg(long, default_value_t = 0)]
        evolution_rounds: usize,
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
            finalist_time_limit_ms,
            finalist_node_limit,
            evolution_rounds,
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
                            time_limit_ms: 1_000,
                            node_limit: 500_000,
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
            sorted.truncate(top.saturating_mul(6).max(top));
            let mut sorted: Vec<Level> = sorted
                .into_par_iter()
                .enumerate()
                .filter_map(|(finalist_index, candidate)| {
                    let mut board = Board::parse_xsb(&candidate.xsb).ok()?;
                    let initial_result = sokoforge_core::solve(
                        &board,
                        &SolveOptions {
                            mode: SolveMode::Quick,
                            time_limit_ms: 1_000,
                            node_limit: 500_000,
                        },
                    );
                    let mut best_score = score_result(&initial_result, &board, mode_core).score;
                    let mut rng = rand::rngs::StdRng::seed_from_u64(
                        seed.wrapping_add(1_000_000 + finalist_index as u64),
                    );
                    for _ in 0..evolution_rounds {
                        let Some(mutated) = mutate_geometry(&board, &mut rng) else {
                            continue;
                        };
                        let result = sokoforge_core::solve(
                            &mutated,
                            &SolveOptions {
                                mode: SolveMode::Quick,
                                time_limit_ms: 750,
                                node_limit: 500_000,
                            },
                        );
                        if result.status != sokoforge_core::SolveStatus::Solved {
                            continue;
                        }
                        let score = score_result(&result, &mutated, mode_core).score;
                        if score > best_score {
                            board = mutated;
                            best_score = score;
                        }
                    }
                    let result = sokoforge_core::solve(
                        &board,
                        &SolveOptions {
                            mode: SolveMode::Optimal,
                            time_limit_ms: finalist_time_limit_ms,
                            node_limit: finalist_node_limit,
                        },
                    );
                    if result.status != sokoforge_core::SolveStatus::Solved || !result.optimal {
                        return None;
                    }
                    Some(Level {
                        id: candidate.id,
                        name: candidate.name,
                        xsb: board.to_xsb(),
                        difficulty: score_result(&result, &board, mode_core),
                        solution: result.moves,
                    })
                })
                .collect();
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
