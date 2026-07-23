use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use rand::SeedableRng;
use rayon::prelude::*;
use serde::Serialize;
use sokoforge_core::{
    Board, DifficultyMode, GenerationTier, SolveMode, SolveOptions, generate_candidate,
    mutate_geometry, score_result, tier_accepts,
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
        #[arg(long, value_enum, default_value_t = TierArg::Hard)]
        tier: TierArg,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum ModeArg {
    LongSolution,
    DeepTrap,
    Dependency,
    Composite,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum TierArg {
    Simple,
    Medium,
    Hard,
}

impl From<TierArg> for GenerationTier {
    fn from(tier: TierArg) -> Self {
        match tier {
            TierArg::Simple => Self::Simple,
            TierArg::Medium => Self::Medium,
            TierArg::Hard => Self::Hard,
        }
    }
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

fn novelty_distance(first: &Level, second: &Level) -> f64 {
    let max_length = first.xsb.len().max(second.xsb.len()).max(1);
    let changed = first
        .xsb
        .bytes()
        .zip(second.xsb.bytes())
        .filter(|(left, right)| left != right)
        .count()
        + first.xsb.len().abs_diff(second.xsb.len());
    let structure = changed as f64 / max_length as f64 * 100.0;
    let metrics = [
        first.difficulty.pushes.abs_diff(second.difficulty.pushes) as f64 / 40.0,
        first
            .difficulty
            .away_pushes
            .abs_diff(second.difficulty.away_pushes) as f64
            / 12.0,
        first
            .difficulty
            .box_switches
            .abs_diff(second.difficulty.box_switches) as f64
            / 18.0,
        (first.difficulty.pdb - second.difficulty.pdb).abs() / 30.0,
        first
            .difficulty
            .reopened_goals
            .abs_diff(second.difficulty.reopened_goals) as f64
            / 5.0,
        first
            .difficulty
            .role_swaps
            .abs_diff(second.difficulty.role_swaps) as f64
            / 6.0,
    ];
    let behavior = metrics.into_iter().sum::<f64>() / metrics.len() as f64 * 100.0;
    (structure * 0.55 + behavior.min(100.0) * 0.45).min(100.0)
}

fn select_with_novelty(mut remaining: Vec<Level>, limit: usize) -> Vec<Level> {
    let mut selected = Vec::with_capacity(limit.min(remaining.len()));
    while !remaining.is_empty() && selected.len() < limit {
        let (best_index, novelty) = remaining
            .iter()
            .enumerate()
            .map(|(index, candidate)| {
                let novelty = if selected.is_empty() {
                    100.0
                } else {
                    selected
                        .iter()
                        .map(|other| novelty_distance(candidate, other))
                        .fold(100.0, f64::min)
                };
                let value = candidate.difficulty.score * 0.75 + novelty * 0.25;
                (index, novelty, value)
            })
            .max_by(|left, right| left.2.total_cmp(&right.2))
            .map(|(index, novelty, _)| (index, novelty))
            .unwrap_or((0, 0.0));
        let mut candidate = remaining.swap_remove(best_index);
        candidate.difficulty.novelty = novelty;
        selected.push(candidate);
    }
    selected
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
            tier,
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
                    if !tier_accepts(tier.into(), &difficulty, false) {
                        return None;
                    }
                    Some(Level {
                        id: format!("generated-{i:05}"),
                        name: format!("Generated {i}"),
                        xsb: board.to_xsb(),
                        difficulty,
                        solution: result.moves,
                    })
                })
                .collect();
            let finalists = select_with_novelty(candidates, top.saturating_mul(6).max(top));
            let sorted: Vec<Level> = finalists
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
                    let difficulty = score_result(&result, &board, mode_core);
                    if !tier_accepts(tier.into(), &difficulty, true) {
                        return None;
                    }
                    Some(Level {
                        id: candidate.id,
                        name: candidate.name,
                        xsb: board.to_xsb(),
                        difficulty,
                        solution: result.moves,
                    })
                })
                .collect();
            let mut sorted = select_with_novelty(sorted, top);
            sorted.sort_by(|a, b| b.difficulty.score.total_cmp(&a.difficulty.score));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_tier_requires_multiple_trap_families_after_certification() {
        let mut metrics = sokoforge_core::DifficultyMetrics {
            pushes: 20,
            away_pushes: 3,
            ..Default::default()
        };
        assert!(!tier_accepts(TierArg::Hard.into(), &metrics, true));
        metrics.box_revisits = 2;
        assert!(!tier_accepts(TierArg::Hard.into(), &metrics, true));
        metrics.deadlock_lures = 1;
        assert!(tier_accepts(TierArg::Hard.into(), &metrics, true));
    }

    #[test]
    fn simple_and_medium_tiers_use_bounded_solution_lengths() {
        let mut metrics = sokoforge_core::DifficultyMetrics {
            pushes: 7,
            ..Default::default()
        };
        assert!(tier_accepts(TierArg::Simple.into(), &metrics, true));
        assert!(!tier_accepts(TierArg::Medium.into(), &metrics, true));
        metrics.pushes = 12;
        assert!(tier_accepts(TierArg::Medium.into(), &metrics, true));
        assert!(!tier_accepts(TierArg::Simple.into(), &metrics, true));
    }
}
