use rand::SeedableRng;
use sokoforge_core::{
    Board, DifficultyMetrics, DifficultyMode, GenerationTier, SolveOptions, SolveResult,
    SolveStatus, score_result, tier_accepts,
};
use wasm_bindgen::prelude::*;

fn invalid_result(message: String) -> SolveResult {
    SolveResult {
        status: SolveStatus::Invalid,
        moves: String::new(),
        pushes: 0,
        explored_nodes: 0,
        elapsed_ms: 0,
        optimal: false,
        message,
    }
}

#[wasm_bindgen]
pub fn solve_xsb(xsb: &str, mode: &str, time_limit_ms: u64, node_limit: usize) -> String {
    let board = match Board::parse_xsb(xsb) {
        Ok(board) => board,
        Err(error) => {
            return serde_json::to_string(&invalid_result(error.to_string())).unwrap_or_default();
        }
    };
    let solve_mode = if mode == "optimal" {
        sokoforge_core::SolveMode::Optimal
    } else {
        sokoforge_core::SolveMode::Quick
    };
    serde_json::to_string(&sokoforge_core::solve(
        &board,
        &SolveOptions {
            mode: solve_mode,
            time_limit_ms,
            node_limit,
        },
    ))
    .unwrap_or_else(|error| {
        serde_json::json!({"status":"invalid","message":error.to_string()}).to_string()
    })
}

#[wasm_bindgen]
pub fn analyze_xsb(xsb: &str, tier: &str, time_limit_ms: u64, node_limit: usize) -> String {
    let board = match Board::parse_xsb(xsb) {
        Ok(board) => board,
        Err(error) => {
            return serde_json::json!({
                "result": invalid_result(error.to_string()),
                "difficulty": DifficultyMetrics::default(),
                "accepted": false,
            })
            .to_string();
        }
    };
    let tier = match tier {
        "simple" => GenerationTier::Simple,
        "medium" => GenerationTier::Medium,
        _ => GenerationTier::Hard,
    };
    let result = sokoforge_core::solve(
        &board,
        &SolveOptions {
            mode: sokoforge_core::SolveMode::Optimal,
            time_limit_ms,
            node_limit,
        },
    );
    let difficulty = score_result(&result, &board, DifficultyMode::Composite);
    let accepted = result.status == SolveStatus::Solved
        && result.optimal
        && tier_accepts(tier, &difficulty, true);
    serde_json::json!({
        "result": result,
        "difficulty": difficulty,
        "accepted": accepted,
    })
    .to_string()
}

#[wasm_bindgen]
pub fn generate_xsb(width: usize, height: usize, boxes: usize, seed: u64) -> String {
    let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
    sokoforge_core::generate_candidate(width, height, boxes, &mut rng)
        .map(|board| board.to_xsb())
        .unwrap_or_default()
}
