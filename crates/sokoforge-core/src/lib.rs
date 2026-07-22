use rand::prelude::*;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum LevelError {
    #[error("level is empty")]
    Empty,
    #[error("level has no player")]
    NoPlayer,
    #[error("level has more than one player")]
    MultiplePlayers,
    #[error("level has no goals")]
    NoGoals,
    #[error("boxes ({boxes}) and goals ({goals}) must match")]
    MismatchedCounts { boxes: usize, goals: usize },
    #[error("level contains an invalid character: {0}")]
    InvalidCharacter(char),
    #[error("level is too large")]
    TooLarge,
    #[error("level rows have inconsistent widths")]
    Ragged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Tile {
    Wall,
    Floor,
    Goal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub width: usize,
    pub height: usize,
    pub tiles: Vec<Tile>,
    pub boxes: Vec<usize>,
    pub player: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Direction {
    Up,
    Right,
    Down,
    Left,
}

impl Direction {
    pub const ALL: [Direction; 4] = [
        Direction::Up,
        Direction::Right,
        Direction::Down,
        Direction::Left,
    ];
    pub fn delta(self) -> (isize, isize) {
        match self {
            Self::Up => (0, -1),
            Self::Right => (1, 0),
            Self::Down => (0, 1),
            Self::Left => (-1, 0),
        }
    }
    pub fn as_char(self) -> char {
        match self {
            Self::Up => 'U',
            Self::Right => 'R',
            Self::Down => 'D',
            Self::Left => 'L',
        }
    }
    pub fn opposite(self) -> Self {
        match self {
            Self::Up => Self::Down,
            Self::Right => Self::Left,
            Self::Down => Self::Up,
            Self::Left => Self::Right,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveOptions {
    pub mode: SolveMode,
    pub time_limit_ms: u64,
    pub node_limit: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SolveMode {
    Quick,
    Optimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveResult {
    pub status: SolveStatus,
    pub moves: String,
    pub pushes: usize,
    pub explored_nodes: usize,
    pub elapsed_ms: u64,
    pub optimal: bool,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SolveStatus {
    Solved,
    Unsolved,
    Timeout,
    Invalid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DifficultyMode {
    LongSolution,
    DeepTrap,
    Dependency,
    Composite,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DifficultyMetrics {
    pub score: f64,
    pub pushes: usize,
    pub moves: usize,
    pub dependency: f64,
    pub trap: f64,
    pub away_pushes: usize,
    pub box_switches: usize,
    pub unique_optimal: Option<bool>,
}

impl Board {
    pub fn parse_xsb(input: &str) -> Result<Self, LevelError> {
        let rows: Vec<Vec<char>> = input
            .lines()
            .map(|line| line.chars().collect())
            .filter(|row: &Vec<char>| !row.is_empty())
            .collect();
        if rows.is_empty() {
            return Err(LevelError::Empty);
        }
        let width = rows[0].len();
        if width == 0 || rows.iter().any(|r| r.len() != width) {
            return Err(LevelError::Ragged);
        }
        if width > 20 || rows.len() > 20 {
            return Err(LevelError::TooLarge);
        }
        let mut tiles = vec![Tile::Floor; width * rows.len()];
        let mut boxes = Vec::new();
        let mut player = None;
        let mut goals = 0;
        for (y, row) in rows.iter().enumerate() {
            for (x, c) in row.iter().enumerate() {
                let i = y * width + x;
                match c {
                    '#' => tiles[i] = Tile::Wall,
                    ' ' | '-' => tiles[i] = Tile::Floor,
                    '.' => {
                        tiles[i] = Tile::Goal;
                        goals += 1;
                    }
                    '$' => boxes.push(i),
                    '@' => {
                        if player.replace(i).is_some() {
                            return Err(LevelError::MultiplePlayers);
                        }
                    }
                    '*' => {
                        tiles[i] = Tile::Goal;
                        boxes.push(i);
                        goals += 1;
                    }
                    '+' => {
                        tiles[i] = Tile::Goal;
                        goals += 1;
                        player = Some(i);
                    }
                    _ => return Err(LevelError::InvalidCharacter(*c)),
                }
            }
        }
        let player = player.ok_or(LevelError::NoPlayer)?;
        if goals == 0 {
            return Err(LevelError::NoGoals);
        }
        if boxes.len() != goals {
            return Err(LevelError::MismatchedCounts {
                boxes: boxes.len(),
                goals,
            });
        }
        Ok(Self {
            width,
            height: rows.len(),
            tiles,
            boxes,
            player,
        })
    }

    pub fn to_xsb(&self) -> String {
        let boxes: HashSet<usize> = self.boxes.iter().copied().collect();
        let mut out = String::new();
        for y in 0..self.height {
            for x in 0..self.width {
                let i = y * self.width + x;
                let goal = self.tiles[i] == Tile::Goal;
                let c = if self.tiles[i] == Tile::Wall {
                    '#'
                } else if boxes.contains(&i) && self.player == i {
                    '+'
                } else if boxes.contains(&i) && goal {
                    '*'
                } else if boxes.contains(&i) {
                    '$'
                } else if self.player == i && goal {
                    '+'
                } else if self.player == i {
                    '@'
                } else if goal {
                    '.'
                } else {
                    ' '
                };
                out.push(c);
            }
            if y + 1 < self.height {
                out.push('\n');
            }
        }
        out
    }

    pub fn validate(&self) -> Result<(), LevelError> {
        if self.width == 0 || self.height == 0 {
            return Err(LevelError::Empty);
        }
        if self.boxes.len() != self.goals().len() {
            return Err(LevelError::MismatchedCounts {
                boxes: self.boxes.len(),
                goals: self.goals().len(),
            });
        }
        Ok(())
    }

    pub fn goals(&self) -> Vec<usize> {
        self.tiles
            .iter()
            .enumerate()
            .filter_map(|(i, t)| (*t == Tile::Goal).then_some(i))
            .collect()
    }
    pub fn is_solved(&self) -> bool {
        self.boxes.iter().all(|b| self.tiles[*b] == Tile::Goal)
    }
    pub fn index(&self, x: isize, y: isize) -> Option<usize> {
        if x >= 0 && y >= 0 && x < self.width as isize && y < self.height as isize {
            Some(y as usize * self.width + x as usize)
        } else {
            None
        }
    }
    pub fn xy(&self, i: usize) -> (isize, isize) {
        ((i % self.width) as isize, (i / self.width) as isize)
    }
    pub fn step(&self, i: usize, d: Direction) -> Option<usize> {
        let (x, y) = self.xy(i);
        let (dx, dy) = d.delta();
        self.index(x + dx, y + dy)
    }
    pub fn is_free_floor(&self, i: usize) -> bool {
        self.tiles.get(i).is_some_and(|t| *t != Tile::Wall)
    }

    pub fn apply_move(&self, d: Direction) -> Option<(Self, bool)> {
        let next = self.step(self.player, d)?;
        if !self.is_free_floor(next) {
            return None;
        }
        let mut next_board = self.clone();
        if let Some(box_i) = self.boxes.iter().position(|b| *b == next) {
            let beyond = self.step(next, d)?;
            if !self.is_free_floor(beyond) || self.boxes.contains(&beyond) {
                return None;
            }
            next_board.boxes[box_i] = beyond;
            next_board.boxes.sort_unstable();
            next_board.player = next;
            Some((next_board, true))
        } else {
            next_board.player = next;
            Some((next_board, false))
        }
    }
}

#[derive(Clone, Eq, PartialEq, Hash)]
struct StateKey {
    boxes: Vec<usize>,
    region: usize,
}

#[derive(Clone)]
struct SearchNode {
    board: Board,
    path: String,
    pushes: usize,
    moves: usize,
    priority: usize,
}

impl Eq for SearchNode {}
impl PartialEq for SearchNode {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}
impl Ord for SearchNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.priority.cmp(&self.priority)
    }
}
impl PartialOrd for SearchNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn reachable_paths(board: &Board) -> HashMap<usize, String> {
    let mut seen = HashMap::new();
    seen.insert(board.player, String::new());
    let mut queue = VecDeque::from([board.player]);
    let boxes: HashSet<usize> = board.boxes.iter().copied().collect();
    while let Some(i) = queue.pop_front() {
        let path = seen.get(&i).cloned().unwrap_or_default();
        for d in Direction::ALL {
            if let Some(n) = board.step(i, d)
                && board.is_free_floor(n)
                && !boxes.contains(&n)
                && !seen.contains_key(&n)
            {
                let mut next_path = path.clone();
                next_path.push(d.as_char());
                seen.insert(n, next_path);
                queue.push_back(n);
            }
        }
    }
    seen
}

fn canonical_key(board: &Board) -> StateKey {
    let mut boxes = board.boxes.clone();
    boxes.sort_unstable();
    let region = reachable_paths(board)
        .into_keys()
        .min()
        .unwrap_or(board.player);
    StateKey { boxes, region }
}

fn manhattan_matching(board: &Board) -> usize {
    let goals = board.goals();
    if board.boxes.len() > 12 {
        return board
            .boxes
            .iter()
            .map(|b| {
                let (bx, by) = board.xy(*b);
                goals
                    .iter()
                    .map(|g| {
                        let (gx, gy) = board.xy(*g);
                        (bx - gx).unsigned_abs() + (by - gy).unsigned_abs()
                    })
                    .min()
                    .unwrap_or(0)
            })
            .sum();
    }
    let distances: Vec<Vec<usize>> = board
        .boxes
        .iter()
        .map(|b| {
            let (bx, by) = board.xy(*b);
            goals
                .iter()
                .map(|g| {
                    let (gx, gy) = board.xy(*g);
                    (bx - gx).unsigned_abs() + (by - gy).unsigned_abs()
                })
                .collect()
        })
        .collect();
    let mut dp = vec![usize::MAX; 1usize << goals.len()];
    dp[0] = 0;
    for mask in 0..dp.len() {
        let box_index = mask.count_ones() as usize;
        if box_index >= board.boxes.len() || dp[mask] == usize::MAX {
            continue;
        }
        for (goal_index, distance) in distances[box_index].iter().enumerate() {
            if mask & (1 << goal_index) == 0 {
                let next = mask | (1 << goal_index);
                dp[next] = dp[next].min(dp[mask].saturating_add(*distance));
            }
        }
    }
    dp.last().copied().unwrap_or(0)
}

fn now_ms() -> u128 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now() as u128
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }
}

pub fn solve(board: &Board, options: &SolveOptions) -> SolveResult {
    if let Err(e) = board.validate() {
        return SolveResult {
            status: SolveStatus::Invalid,
            moves: String::new(),
            pushes: 0,
            explored_nodes: 0,
            elapsed_ms: 0,
            optimal: false,
            message: e.to_string(),
        };
    }
    let started = now_ms();
    let start_key = canonical_key(board);
    let mut open = BinaryHeap::new();
    let h = manhattan_matching(board);
    let weight = if options.mode == SolveMode::Quick {
        2
    } else {
        1
    };
    open.push(SearchNode {
        board: board.clone(),
        path: String::new(),
        pushes: 0,
        moves: 0,
        priority: h * weight,
    });
    let mut visited: HashMap<StateKey, (usize, usize)> = HashMap::new();
    visited.insert(start_key, (0, 0));
    let mut explored = 0usize;
    while let Some(node) = open.pop() {
        explored += 1;
        let elapsed = (now_ms() - started) as u64;
        if elapsed >= options.time_limit_ms || explored >= options.node_limit {
            return SolveResult {
                status: SolveStatus::Timeout,
                moves: node.path,
                pushes: node.pushes,
                explored_nodes: explored,
                elapsed_ms: elapsed,
                optimal: false,
                message: "Search timed out before optimality was proven.".into(),
            };
        }
        if node.board.is_solved() {
            return SolveResult {
                status: SolveStatus::Solved,
                moves: node.path,
                pushes: node.pushes,
                explored_nodes: explored,
                elapsed_ms: elapsed,
                optimal: options.mode == SolveMode::Optimal,
                message: if options.mode == SolveMode::Optimal {
                    "Optimal solution proven."
                } else {
                    "A solution was found; optimality was not required."
                }
                .into(),
            };
        }
        let walks = reachable_paths(&node.board);
        for (box_index, box_position) in node.board.boxes.iter().copied().enumerate() {
            for d in Direction::ALL {
                let Some(stand) = node.board.step(box_position, d.opposite()) else {
                    continue;
                };
                let Some(destination) = node.board.step(box_position, d) else {
                    continue;
                };
                let Some(walk) = walks.get(&stand) else {
                    continue;
                };
                if !node.board.is_free_floor(destination) || node.board.boxes.contains(&destination)
                {
                    continue;
                }
                let mut next = node.board.clone();
                next.boxes[box_index] = destination;
                next.boxes.sort_unstable();
                next.player = box_position;
                let next_key = canonical_key(&next);
                let next_pushes = node.pushes + 1;
                let next_moves = node.moves + walk.len() + 1;
                if visited
                    .get(&next_key)
                    .is_some_and(|old| *old <= (next_pushes, next_moves))
                {
                    continue;
                }
                visited.insert(next_key, (next_pushes, next_moves));
                let heuristic = manhattan_matching(&next);
                let priority = (next_pushes + heuristic * weight) * 1_000_000 + next_moves;
                open.push(SearchNode {
                    board: next,
                    path: format!("{}{}{}", node.path, walk, d.as_char()),
                    pushes: next_pushes,
                    moves: next_moves,
                    priority,
                });
            }
        }
    }
    SolveResult {
        status: SolveStatus::Unsolved,
        moves: String::new(),
        pushes: 0,
        explored_nodes: explored,
        elapsed_ms: (now_ms() - started) as u64,
        optimal: false,
        message: "No solution exists within the search limits.".into(),
    }
}

pub fn score_result(
    result: &SolveResult,
    board: &Board,
    mode: DifficultyMode,
) -> DifficultyMetrics {
    if result.status == SolveStatus::Invalid || result.status == SolveStatus::Unsolved {
        return DifficultyMetrics::default();
    }
    let mut box_switches = 0;
    let mut away_pushes = 0;
    let mut last_box = None;
    let mut pushed = 0;
    let mut current = board.clone();
    let mut identities: HashMap<usize, usize> = current
        .boxes
        .iter()
        .enumerate()
        .map(|(id, position)| (*position, id))
        .collect();
    for c in result.moves.chars() {
        if let Some(d) = Direction::ALL.iter().copied().find(|d| d.as_char() == c)
            && let Some((next, did_push)) = current.apply_move(d)
        {
            if did_push {
                pushed += 1;
                let old_position = current.step(current.player, d).unwrap_or(current.player);
                let moved = next
                    .boxes
                    .iter()
                    .find(|b| !current.boxes.contains(b))
                    .copied();
                let identity = identities.remove(&old_position);
                if identity != last_box {
                    box_switches += 1;
                }
                last_box = identity;
                if let (Some(id), Some(after_position)) = (identity, moved) {
                    identities.insert(after_position, id);
                    let before = board.xy(old_position);
                    let nearest_before = board
                        .goals()
                        .iter()
                        .map(|g| {
                            let p = board.xy(*g);
                            (before.0 - p.0).unsigned_abs() + (before.1 - p.1).unsigned_abs()
                        })
                        .min()
                        .unwrap_or(0);
                    let after = next.xy(after_position);
                    let nearest_after = board
                        .goals()
                        .iter()
                        .map(|g| {
                            let p = board.xy(*g);
                            (after.0 - p.0).unsigned_abs() + (after.1 - p.1).unsigned_abs()
                        })
                        .min()
                        .unwrap_or(0);
                    if nearest_after > nearest_before {
                        away_pushes += 1;
                    }
                }
            }
            current = next;
        }
    }
    let dependency =
        (box_switches as f64 * 2.0 + away_pushes as f64 * 3.0 + pushed as f64).min(100.0);
    let length = (result.pushes as f64 / (board.tiles.len() as f64).sqrt() * 20.0).min(100.0);
    let trap = (result.explored_nodes as f64).log10().max(0.0) * 12.0;
    let score = match mode {
        DifficultyMode::LongSolution => length,
        DifficultyMode::Dependency => dependency,
        DifficultyMode::DeepTrap => trap.min(100.0),
        DifficultyMode::Composite => {
            (length * 0.4 + dependency * 0.3 + trap.min(100.0) * 0.3).min(100.0)
        }
    };
    DifficultyMetrics {
        score,
        pushes: result.pushes,
        moves: result.moves.len(),
        dependency,
        trap: trap.min(100.0),
        away_pushes,
        box_switches,
        unique_optimal: None,
    }
}

pub fn generate_candidate<R: Rng>(
    width: usize,
    height: usize,
    boxes: usize,
    rng: &mut R,
) -> Option<Board> {
    if width < 5 || height < 5 || boxes == 0 || boxes > 8 {
        return None;
    }
    let mut tiles = vec![Tile::Wall; width * height];
    for y in 1..height - 1 {
        for x in 1..width - 1 {
            if rng.random_bool(0.72) {
                tiles[y * width + x] = Tile::Floor;
            }
        }
    }
    for x in 1..width - 1 {
        tiles[width + x] = Tile::Floor;
        tiles[(height - 2) * width + x] = Tile::Floor;
    }
    for y in 1..height - 1 {
        tiles[y * width + 1] = Tile::Floor;
        tiles[y * width + width - 2] = Tile::Floor;
    }
    let floor: Vec<usize> = tiles
        .iter()
        .enumerate()
        .filter_map(|(i, t)| (*t == Tile::Floor).then_some(i))
        .collect();
    if floor.len() < boxes * 3 + 1 {
        return None;
    }
    let mut picks = floor
        .choose_multiple(rng, boxes + 1)
        .copied()
        .collect::<Vec<_>>();
    let player = picks.pop()?;
    let goals = picks;
    for g in &goals {
        tiles[*g] = Tile::Goal;
    }
    let mut board = Board {
        width,
        height,
        tiles,
        boxes: goals,
        player,
    };
    let pulls = rng.random_range(boxes * 8..=boxes * 22);
    let mut completed = 0;
    for _ in 0..pulls {
        let reachable_cells = reachable_paths(&board);
        let mut actions = Vec::new();
        for &box_position in &board.boxes {
            for direction in Direction::ALL {
                let stand = board.step(box_position, direction.opposite());
                let destination = stand.and_then(|p| board.step(p, direction.opposite()));
                if let (Some(stand), Some(destination)) = (stand, destination)
                    && reachable_cells.contains_key(&stand)
                    && board.is_free_floor(destination)
                    && !board.boxes.contains(&destination)
                {
                    actions.push((box_position, stand, destination));
                }
            }
        }
        let Some((box_position, stand, destination)) = actions.choose(rng).copied() else {
            break;
        };
        let box_i = board.boxes.iter().position(|b| *b == box_position)?;
        board.boxes[box_i] = stand;
        board.boxes.sort_unstable();
        board.player = destination;
        completed += 1;
    }
    (completed >= boxes * 3 && !board.is_solved()).then_some(board)
}

#[cfg(test)]
mod tests {
    use super::*;
    const TINY: &str = "#####\n# @ #\n# $ #\n# . #\n#####";
    #[test]
    fn parses_and_serializes() {
        let b = Board::parse_xsb(TINY).unwrap();
        assert_eq!(b.width, 5);
        assert_eq!(Board::parse_xsb(&b.to_xsb()).unwrap().boxes.len(), 1);
    }
    #[test]
    fn moves_and_solves() {
        let b = Board::parse_xsb(TINY).unwrap();
        let r = solve(
            &b,
            &SolveOptions {
                mode: SolveMode::Optimal,
                time_limit_ms: 1000,
                node_limit: 100_000,
            },
        );
        assert_eq!(r.status, SolveStatus::Solved);
        assert!(r.pushes > 0);
    }
    #[test]
    fn rejects_bad_counts() {
        assert!(matches!(
            Board::parse_xsb("###\n#@#\n###"),
            Err(LevelError::NoGoals)
        ));
    }
    #[test]
    fn reverse_generated_levels_are_solvable() {
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let board = (0..30)
            .find_map(|_| generate_candidate(8, 8, 2, &mut rng))
            .expect("candidate");
        let result = solve(
            &board,
            &SolveOptions {
                mode: SolveMode::Quick,
                time_limit_ms: 2_000,
                node_limit: 500_000,
            },
        );
        assert_eq!(result.status, SolveStatus::Solved);
    }
}
