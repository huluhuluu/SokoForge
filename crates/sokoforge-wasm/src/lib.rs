use rand::SeedableRng;
use sokoforge_core::{Board, SolveOptions};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn solve_xsb(xsb: &str, mode: &str, time_limit_ms: u64, node_limit: usize) -> String {
    let board = match Board::parse_xsb(xsb) {
        Ok(board) => board,
        Err(error) => {
            return serde_json::json!({"status":"invalid","message":error.to_string()}).to_string();
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
pub fn generate_xsb(width: usize, height: usize, boxes: usize, seed: u64) -> String {
    let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
    sokoforge_core::generate_candidate(width, height, boxes, &mut rng)
        .map(|board| board.to_xsb())
        .unwrap_or_default()
}
