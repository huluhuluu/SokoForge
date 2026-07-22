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
    #[serde(default)]
    pub pdb: f64,
    #[serde(default)]
    pub delayed_lures: usize,
    #[serde(default)]
    pub reopened_goals: usize,
    #[serde(default)]
    pub tunnel_commitments: usize,
    #[serde(default)]
    pub role_swaps: usize,
    #[serde(default)]
    pub box_revisits: usize,
    #[serde(default)]
    pub false_goal_lures: usize,
    #[serde(default)]
    pub deadlock_lures: usize,
    #[serde(default)]
    pub novelty: f64,
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

const UNREACHABLE: usize = usize::MAX / 4;

struct StaticAnalysis {
    goals: Vec<usize>,
    push_distances: Vec<Vec<usize>>,
    dead_squares: Vec<bool>,
    pair_pdb: Option<Vec<usize>>,
}

impl StaticAnalysis {
    fn new(board: &Board) -> Self {
        let goals = board.goals();
        let push_distances = goals
            .iter()
            .map(|goal| {
                let mut distances = vec![UNREACHABLE; board.tiles.len()];
                distances[*goal] = 0;
                let mut queue = VecDeque::from([*goal]);
                while let Some(current) = queue.pop_front() {
                    for direction in Direction::ALL {
                        let Some(previous) = board.step(current, direction.opposite()) else {
                            continue;
                        };
                        let Some(player_stand) = board.step(previous, direction.opposite()) else {
                            continue;
                        };
                        if board.is_free_floor(previous)
                            && board.is_free_floor(player_stand)
                            && distances[previous] == UNREACHABLE
                        {
                            distances[previous] = distances[current] + 1;
                            queue.push_back(previous);
                        }
                    }
                }
                distances
            })
            .collect::<Vec<_>>();
        let dead_squares = (0..board.tiles.len())
            .map(|position| {
                board.is_free_floor(position)
                    && !goals.contains(&position)
                    && push_distances
                        .iter()
                        .all(|distances| distances[position] == UNREACHABLE)
            })
            .collect();
        let pair_pdb = build_pair_pdb(board, &goals);
        Self {
            goals,
            push_distances,
            dead_squares,
            pair_pdb,
        }
    }
}

fn build_pair_pdb(board: &Board, goals: &[usize]) -> Option<Vec<usize>> {
    if goals.len() < 2 || board.tiles.len() > 144 {
        return None;
    }
    let width = board.tiles.len();
    let mut distances = vec![UNREACHABLE; width * width];
    let mut queue = VecDeque::new();
    for &first in goals {
        for &second in goals {
            if first == second {
                continue;
            }
            let index = first * width + second;
            distances[index] = 0;
            queue.push_back((first, second));
        }
    }
    while let Some((first, second)) = queue.pop_front() {
        let current_distance = distances[first * width + second];
        for moving_first in [true, false] {
            let (moving, other) = if moving_first {
                (first, second)
            } else {
                (second, first)
            };
            for direction in Direction::ALL {
                let Some(previous) = board.step(moving, direction.opposite()) else {
                    continue;
                };
                let Some(player_stand) = board.step(previous, direction.opposite()) else {
                    continue;
                };
                if !board.is_free_floor(previous)
                    || !board.is_free_floor(player_stand)
                    || previous == other
                    || player_stand == other
                {
                    continue;
                }
                let next = if moving_first {
                    (previous, second)
                } else {
                    (first, previous)
                };
                let index = next.0 * width + next.1;
                if distances[index] == UNREACHABLE {
                    distances[index] = current_distance + 1;
                    queue.push_back(next);
                }
            }
        }
    }
    Some(distances)
}

fn pair_pattern_distance(board: &Board, analysis: &StaticAnalysis) -> usize {
    let Some(distances) = &analysis.pair_pdb else {
        return 0;
    };
    let width = board.tiles.len();
    board
        .boxes
        .iter()
        .enumerate()
        .flat_map(|(first_index, first)| {
            board
                .boxes
                .iter()
                .skip(first_index + 1)
                .map(move |second| distances[*first * width + *second])
        })
        .filter(|distance| *distance != UNREACHABLE)
        .max()
        .unwrap_or(0)
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

fn reachable_cells(board: &Board) -> HashSet<usize> {
    let mut seen = HashSet::from([board.player]);
    let mut queue = VecDeque::from([board.player]);
    let boxes: HashSet<usize> = board.boxes.iter().copied().collect();
    while let Some(position) = queue.pop_front() {
        for direction in Direction::ALL {
            if let Some(next) = board.step(position, direction)
                && board.is_free_floor(next)
                && !boxes.contains(&next)
                && seen.insert(next)
            {
                queue.push_back(next);
            }
        }
    }
    seen
}

fn canonical_key(board: &Board) -> StateKey {
    let mut boxes = board.boxes.clone();
    boxes.sort_unstable();
    let region = reachable_cells(board)
        .into_iter()
        .min()
        .unwrap_or(board.player);
    StateKey { boxes, region }
}

fn wall_aware_matching(board: &Board, analysis: &StaticAnalysis) -> usize {
    if board.boxes.len() > 12 || analysis.goals.len() != board.boxes.len() {
        return UNREACHABLE;
    }
    let distances: Vec<Vec<usize>> = board
        .boxes
        .iter()
        .map(|position| {
            analysis
                .push_distances
                .iter()
                .map(|goal_distances| goal_distances[*position])
                .collect()
        })
        .collect();
    let mut dp = vec![UNREACHABLE; 1usize << analysis.goals.len()];
    dp[0] = 0;
    for mask in 0..dp.len() {
        let box_index = mask.count_ones() as usize;
        if box_index >= board.boxes.len() || dp[mask] == UNREACHABLE {
            continue;
        }
        for (goal_index, distance) in distances[box_index].iter().enumerate() {
            if mask & (1 << goal_index) == 0 && *distance != UNREACHABLE {
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
    let analysis = StaticAnalysis::new(board);
    if board
        .boxes
        .iter()
        .any(|position| analysis.dead_squares[*position])
    {
        return SolveResult {
            status: SolveStatus::Unsolved,
            moves: String::new(),
            pushes: 0,
            explored_nodes: 0,
            elapsed_ms: (now_ms() - started) as u64,
            optimal: false,
            message: "A box starts on a static dead square.".into(),
        };
    }
    let start_key = canonical_key(board);
    let mut open = BinaryHeap::new();
    let h = wall_aware_matching(board, &analysis).max(pair_pattern_distance(board, &analysis));
    if h == UNREACHABLE {
        return SolveResult {
            status: SolveStatus::Unsolved,
            moves: String::new(),
            pushes: 0,
            explored_nodes: 0,
            elapsed_ms: (now_ms() - started) as u64,
            optimal: false,
            message: "No wall-aware box-goal assignment exists.".into(),
        };
    }
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
                if analysis.dead_squares[destination] {
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
                let heuristic = wall_aware_matching(&next, &analysis)
                    .max(pair_pattern_distance(&next, &analysis));
                if heuristic == UNREACHABLE {
                    continue;
                }
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

fn floor_degree(board: &Board, position: usize) -> usize {
    Direction::ALL
        .iter()
        .filter(|direction| {
            board
                .step(position, **direction)
                .is_some_and(|next| board.is_free_floor(next))
        })
        .count()
}

fn is_turning_square(board: &Board, position: usize) -> bool {
    let open = Direction::ALL
        .iter()
        .copied()
        .filter(|direction| {
            board
                .step(position, *direction)
                .is_some_and(|next| board.is_free_floor(next))
        })
        .collect::<Vec<_>>();
    open.len() == 2 && open[0].opposite() != open[1]
}

fn legal_push_states(board: &Board, analysis: &StaticAnalysis) -> Vec<Board> {
    let reachable = reachable_cells(board);
    let mut states = Vec::new();
    for (box_index, box_position) in board.boxes.iter().copied().enumerate() {
        for direction in Direction::ALL {
            let Some(stand) = board.step(box_position, direction.opposite()) else {
                continue;
            };
            let Some(destination) = board.step(box_position, direction) else {
                continue;
            };
            if !reachable.contains(&stand)
                || !board.is_free_floor(destination)
                || board.boxes.contains(&destination)
                || analysis.dead_squares[destination]
            {
                continue;
            }
            let mut next = board.clone();
            next.boxes[box_index] = destination;
            next.boxes.sort_unstable();
            next.player = box_position;
            states.push(next);
        }
    }
    states
}

#[derive(Default)]
struct RouteAnalysis {
    delayed_lures: usize,
    false_goal_lures: usize,
    deadlock_lures: usize,
}

fn analyze_wrong_routes(result: &SolveResult, board: &Board) -> RouteAnalysis {
    if !result.optimal || result.pushes < 2 {
        return RouteAnalysis::default();
    };
    let static_analysis = StaticAnalysis::new(board);
    let mut analysis = RouteAnalysis::default();
    let mut current = board.clone();
    let mut pushes_seen = 0;
    for character in result.moves.chars() {
        let Some(direction) = Direction::ALL
            .iter()
            .copied()
            .find(|direction| direction.as_char() == character)
        else {
            break;
        };
        let Some((next, pushed)) = current.apply_move(direction) else {
            break;
        };
        if pushed && pushes_seen < 4 {
            let remaining_pushes = result.pushes.saturating_sub(pushes_seen);
            for alternative in legal_push_states(&current, &static_analysis)
                .into_iter()
                .filter(|alternative| alternative.boxes != next.boxes)
                .take(6)
            {
                let moved_to_goal = alternative
                    .boxes
                    .iter()
                    .find(|position| !current.boxes.contains(position))
                    .is_some_and(|position| board.tiles[*position] == Tile::Goal);
                let alternative_result = solve(
                    &alternative,
                    &SolveOptions {
                        mode: SolveMode::Optimal,
                        time_limit_ms: 60,
                        node_limit: 20_000,
                    },
                );
                match alternative_result.status {
                    SolveStatus::Solved => {
                        let regret = (alternative_result.pushes + 1)
                            .saturating_sub(remaining_pushes)
                            .min(10);
                        analysis.delayed_lures += regret;
                        analysis.false_goal_lures += usize::from(moved_to_goal && regret > 0);
                    }
                    SolveStatus::Unsolved => {
                        analysis.delayed_lures += 4;
                        analysis.deadlock_lures += 1;
                        analysis.false_goal_lures += usize::from(moved_to_goal);
                    }
                    SolveStatus::Timeout | SolveStatus::Invalid => {}
                }
            }
            pushes_seen += 1;
        }
        current = next;
        if pushes_seen >= 4 {
            break;
        }
    }
    analysis.delayed_lures = analysis.delayed_lures.min(40);
    analysis
}

pub fn score_result(
    result: &SolveResult,
    board: &Board,
    mode: DifficultyMode,
) -> DifficultyMetrics {
    if result.status != SolveStatus::Solved {
        return DifficultyMetrics::default();
    }
    let mut box_switches = 0;
    let mut away_pushes = 0;
    let mut reopened_goals = 0;
    let mut tunnel_commitments = 0;
    let mut box_revisits = 0;
    let mut last_box = None;
    let mut moved_identities = HashSet::new();
    let mut pushed = 0;
    let mut current = board.clone();
    let goals = board.goals();
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
                if last_box.is_some() && identity != last_box {
                    box_switches += 1;
                }
                if identity != last_box && identity.is_some_and(|id| moved_identities.contains(&id))
                {
                    box_revisits += 1;
                }
                last_box = identity;
                if let (Some(id), Some(after_position)) = (identity, moved) {
                    moved_identities.insert(id);
                    identities.insert(after_position, id);
                    if board.tiles[old_position] == Tile::Goal
                        && board.tiles[after_position] != Tile::Goal
                    {
                        reopened_goals += 1;
                    }
                    if floor_degree(board, after_position) <= 2
                        && board.tiles[after_position] != Tile::Goal
                    {
                        tunnel_commitments += 1;
                    }
                    let before = board.xy(old_position);
                    let nearest_before = goals
                        .iter()
                        .map(|g| {
                            let p = board.xy(*g);
                            (before.0 - p.0).unsigned_abs() + (before.1 - p.1).unsigned_abs()
                        })
                        .min()
                        .unwrap_or(0);
                    let after = next.xy(after_position);
                    let nearest_after = goals
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
    let walkable = board
        .tiles
        .iter()
        .filter(|tile| **tile != Tile::Wall)
        .count()
        .max(1);
    let mut final_positions = vec![0; board.boxes.len()];
    for (position, identity) in &identities {
        final_positions[*identity] = *position;
    }
    let role_swaps = (0..board.boxes.len())
        .flat_map(|first| (first + 1..board.boxes.len()).map(move |second| (first, second)))
        .filter(|(first, second)| {
            board.boxes[*first].cmp(&board.boxes[*second])
                != final_positions[*first].cmp(&final_positions[*second])
        })
        .count();
    let analysis = StaticAnalysis::new(board);
    let pdb = pair_pattern_distance(board, &analysis) as f64;
    let route_analysis = analyze_wrong_routes(result, board);
    let dependency = (box_switches as f64 * 3.0
        + away_pushes as f64 * 4.0
        + reopened_goals as f64 * 8.0
        + box_revisits as f64 * 6.0
        + role_swaps as f64 * 7.0
        + pushed as f64 * 0.5)
        .min(100.0);
    let length = (result.pushes as f64 / (walkable as f64).sqrt() * 25.0).min(100.0);
    let trap = ((result.explored_nodes.max(1) as f64).log10() * 8.0
        + route_analysis.delayed_lures as f64 * 4.0
        + route_analysis.false_goal_lures as f64 * 8.0
        + route_analysis.deadlock_lures as f64 * 6.0
        + reopened_goals as f64 * 6.0
        + tunnel_commitments as f64 * 1.5)
        .min(100.0);
    let pdb_score = (pdb / (walkable as f64).sqrt() * 25.0).min(100.0);
    let score = match mode {
        DifficultyMode::LongSolution => length,
        DifficultyMode::Dependency => dependency,
        DifficultyMode::DeepTrap => trap,
        DifficultyMode::Composite => {
            (length * 0.3 + dependency * 0.3 + trap * 0.25 + pdb_score * 0.15).min(100.0)
        }
    };
    DifficultyMetrics {
        score,
        pushes: result.pushes,
        moves: result.moves.len(),
        dependency,
        trap,
        away_pushes,
        box_switches,
        unique_optimal: None,
        pdb,
        delayed_lures: route_analysis.delayed_lures,
        reopened_goals,
        tunnel_commitments,
        role_swaps,
        box_revisits,
        false_goal_lures: route_analysis.false_goal_lures,
        deadlock_lures: route_analysis.deadlock_lures,
        novelty: 0.0,
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
    let internal = (width - 2) * (height - 2);
    let target_floor = rng
        .random_range(
            (internal * 58 / 100).max(boxes * 5 + 4)..=(internal * 78 / 100).max(boxes * 5 + 4),
        )
        .min(internal);
    let start = (height / 2) * width + width / 2;
    tiles[start] = Tile::Floor;
    let mut carved = vec![start];
    while carved.len() < target_floor {
        let from = *carved.choose(rng)?;
        let direction = *Direction::ALL.choose(rng)?;
        let (x, y) = ((from % width) as isize, (from / width) as isize);
        let (dx, dy) = direction.delta();
        let (nx, ny) = (x + dx, y + dy);
        if nx <= 0 || ny <= 0 || nx >= width as isize - 1 || ny >= height as isize - 1 {
            continue;
        }
        let next = ny as usize * width + nx as usize;
        if tiles[next] == Tile::Wall {
            tiles[next] = Tile::Floor;
            carved.push(next);
        }
    }
    let geometry = Board {
        width,
        height,
        tiles: tiles.clone(),
        boxes: Vec::new(),
        player: start,
    };
    let floor: Vec<usize> = tiles
        .iter()
        .enumerate()
        .filter_map(|(i, t)| (*t == Tile::Floor).then_some(i))
        .collect();
    if floor.len() < boxes * 3 + 1 {
        return None;
    }
    let goal_candidates: Vec<usize> = floor
        .iter()
        .copied()
        .filter(|position| {
            Direction::ALL.iter().any(|direction| {
                geometry
                    .step(*position, direction.opposite())
                    .and_then(|stand| geometry.step(stand, direction.opposite()))
                    .is_some_and(|destination| geometry.is_free_floor(destination))
            })
        })
        .collect();
    if goal_candidates.len() < boxes {
        return None;
    }
    let goals = goal_candidates
        .choose_multiple(rng, boxes)
        .copied()
        .collect::<Vec<_>>();
    let player = *floor
        .iter()
        .filter(|position| !goals.contains(position))
        .choose(rng)?;
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
    let goal_positions = board.goals();
    let pulls = rng.random_range(boxes * 20..=boxes * 60);
    let mut completed = 0;
    let mut visited = HashSet::new();
    visited.insert(board.boxes.clone());
    let mut identities: HashMap<usize, usize> = board
        .boxes
        .iter()
        .enumerate()
        .map(|(identity, position)| (*position, identity))
        .collect();
    let mut moved_identities = HashSet::new();
    let mut last_identity = None;
    for _ in 0..pulls {
        let reachable = reachable_cells(&board);
        let mut actions = Vec::new();
        for &box_position in &board.boxes {
            let identity = *identities.get(&box_position)?;
            for direction in Direction::ALL {
                let stand = board.step(box_position, direction.opposite());
                let destination = stand.and_then(|p| board.step(p, direction.opposite()));
                if let (Some(stand), Some(destination)) = (stand, destination)
                    && reachable.contains(&stand)
                    && board.is_free_floor(destination)
                    && !board.boxes.contains(&destination)
                {
                    let mut next_boxes = board.boxes.clone();
                    let box_i = next_boxes
                        .iter()
                        .position(|position| *position == box_position)?;
                    next_boxes[box_i] = stand;
                    next_boxes.sort_unstable();
                    if visited.contains(&next_boxes) {
                        continue;
                    }
                    let before_distance = goal_positions
                        .iter()
                        .map(|goal| {
                            let (bx, by) = board.xy(box_position);
                            let (gx, gy) = board.xy(*goal);
                            (bx - gx).unsigned_abs() + (by - gy).unsigned_abs()
                        })
                        .min()
                        .unwrap_or(0);
                    let after_distance = goal_positions
                        .iter()
                        .map(|goal| {
                            let (bx, by) = board.xy(stand);
                            let (gx, gy) = board.xy(*goal);
                            (bx - gx).unsigned_abs() + (by - gy).unsigned_abs()
                        })
                        .min()
                        .unwrap_or(0);
                    let open_neighbors = Direction::ALL
                        .iter()
                        .filter(|direction| {
                            board
                                .step(stand, **direction)
                                .is_some_and(|next| board.is_free_floor(next))
                        })
                        .count();
                    let weight = 1
                        + usize::from(after_distance > before_distance) * 6
                        + usize::from(last_identity != Some(identity)) * 3
                        + usize::from(
                            last_identity != Some(identity) && moved_identities.contains(&identity),
                        ) * 6
                        + usize::from(
                            board.tiles[stand] == Tile::Goal
                                && board.tiles[box_position] != Tile::Goal,
                        ) * 8
                        + usize::from(open_neighbors <= 2) * 3
                        + usize::from(is_turning_square(&board, stand)) * 5;
                    actions.push((
                        box_position,
                        stand,
                        destination,
                        next_boxes,
                        identity,
                        weight,
                    ));
                }
            }
        }
        let total_weight: usize = actions.iter().map(|action| action.5).sum();
        if total_weight == 0 {
            break;
        }
        let mut roll = rng.random_range(0..total_weight);
        let selected = actions.into_iter().find(|action| {
            if roll < action.5 {
                true
            } else {
                roll -= action.5;
                false
            }
        })?;
        let (box_position, stand, destination, next_boxes, identity, _) = selected;
        board.boxes = next_boxes.clone();
        board.player = destination;
        visited.insert(next_boxes.clone());
        identities.remove(&box_position);
        identities.insert(stand, identity);
        moved_identities.insert(identity);
        last_identity = Some(identity);
        completed += 1;
    }
    (completed >= boxes * 6 && !board.is_solved()).then_some(board)
}

pub fn mutate_geometry<R: Rng>(board: &Board, rng: &mut R) -> Option<Board> {
    let protected: HashSet<usize> = board
        .boxes
        .iter()
        .copied()
        .chain(board.goals())
        .chain(std::iter::once(board.player))
        .collect();
    let candidates: Vec<usize> = (1..board.height - 1)
        .flat_map(|y| (1..board.width - 1).map(move |x| y * board.width + x))
        .filter(|position| !protected.contains(position))
        .collect();
    let position = *candidates.choose(rng)?;
    let mut mutated = board.clone();
    mutated.tiles[position] = if mutated.tiles[position] == Tile::Wall {
        Tile::Floor
    } else {
        Tile::Wall
    };

    let first_floor = mutated.tiles.iter().position(|tile| *tile != Tile::Wall)?;
    let mut seen = HashSet::new();
    let mut queue = VecDeque::from([first_floor]);
    while let Some(current) = queue.pop_front() {
        if !seen.insert(current) {
            continue;
        }
        for direction in Direction::ALL {
            if let Some(next) = mutated.step(current, direction)
                && mutated.is_free_floor(next)
                && !seen.contains(&next)
            {
                queue.push_back(next);
            }
        }
    }
    let floor_count = mutated
        .tiles
        .iter()
        .filter(|tile| **tile != Tile::Wall)
        .count();
    (seen.len() == floor_count).then_some(mutated)
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
    fn reverse_push_table_respects_wall_detours() {
        let board = Board::parse_xsb(
            "########\n#@     #\n# $ # .#\n#   #  #\n#      #\n#      #\n########",
        )
        .unwrap();
        let analysis = StaticAnalysis::new(&board);
        assert_eq!(analysis.push_distances[0][board.boxes[0]], 8);
    }
    #[test]
    fn static_dead_square_is_pruned_before_search() {
        let board = Board::parse_xsb("#####\n#$@ #\n#   #\n# . #\n#####").unwrap();
        let analysis = StaticAnalysis::new(&board);
        assert!(analysis.dead_squares[board.boxes[0]]);
        let result = solve(
            &board,
            &SolveOptions {
                mode: SolveMode::Optimal,
                time_limit_ms: 1_000,
                node_limit: 100_000,
            },
        );
        assert_eq!(result.status, SolveStatus::Unsolved);
        assert_eq!(result.explored_nodes, 0);
    }
    #[test]
    fn pair_pattern_database_is_admissible() {
        let board = Board::parse_xsb("#######\n#@    #\n# $$  #\n# ..  #\n#######").unwrap();
        let analysis = StaticAnalysis::new(&board);
        let pattern = pair_pattern_distance(&board, &analysis);
        let result = solve(
            &board,
            &SolveOptions {
                mode: SolveMode::Optimal,
                time_limit_ms: 1_000,
                node_limit: 100_000,
            },
        );
        assert_eq!(result.status, SolveStatus::Solved);
        assert!(pattern > 0);
        assert!(pattern <= result.pushes);
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
    #[test]
    fn geometry_mutation_preserves_connected_floor() {
        let board = Board::parse_xsb(TINY).unwrap();
        let mut rng = rand::rngs::StdRng::seed_from_u64(11);
        if let Some(mutated) = mutate_geometry(&board, &mut rng) {
            assert_eq!(mutated.boxes, board.boxes);
            assert_eq!(mutated.goals(), board.goals());
        }
    }
    #[test]
    fn first_box_run_is_not_counted_as_a_switch() {
        let board = Board::parse_xsb(TINY).unwrap();
        let result = solve(
            &board,
            &SolveOptions {
                mode: SolveMode::Optimal,
                time_limit_ms: 1_000,
                node_limit: 100_000,
            },
        );
        let metrics = score_result(&result, &board, DifficultyMode::Dependency);
        assert_eq!(metrics.box_switches, 0);
    }
    #[test]
    fn timeout_result_has_no_difficulty_score() {
        let board = Board::parse_xsb(TINY).unwrap();
        let result = SolveResult {
            status: SolveStatus::Timeout,
            moves: "D".into(),
            pushes: 1,
            explored_nodes: 100,
            elapsed_ms: 10,
            optimal: false,
            message: String::new(),
        };
        let metrics = score_result(&result, &board, DifficultyMode::Composite);
        assert_eq!(metrics.score, 0.0);
        assert_eq!(metrics.pushes, 0);
        assert_eq!(metrics.box_switches, 0);
    }
}
