export type Language = 'en' | 'zh'
export type Tool = 'wall' | 'floor' | 'goal' | 'box' | 'player' | 'eraser'
export type SolveMode = 'quick' | 'optimal'
export type DifficultyMode = 'long_solution' | 'deep_trap' | 'dependency' | 'composite'

export interface SolveResult {
  status: 'solved' | 'unsolved' | 'timeout' | 'invalid'
  moves: string
  pushes: number
  explored_nodes: number
  elapsed_ms: number
  optimal: boolean
  message: string
}

export interface DifficultyMetrics {
  score: number
  pushes: number
  moves: number
  dependency: number
  trap: number
  away_pushes: number
  box_switches: number
  unique_optimal?: boolean | null
}

export interface PackLevel {
  id: string
  name: string
  xsb: string
  difficulty: DifficultyMetrics
  solution?: string
}

export interface LevelPack {
  schemaVersion: number
  kind: 'sokoforge-level-pack'
  seed?: number
  mode?: DifficultyMode | string
  levels: PackLevel[]
}

export interface PublishedLevelMeta {
  id: string
  title: Record<Language, string>
  file: string
  difficulty: 'starter' | 'easy' | 'medium' | 'hard'
  boxes: number
  optimalPushes: number
}

export interface PublishedLevel extends PublishedLevelMeta { xsb: string }
