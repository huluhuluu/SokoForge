import { boardStatus, move, parseLevel } from './level'
import type { DifficultyMetrics, LevelPack, PackLevel } from './types'

const EMPTY_DIFFICULTY: DifficultyMetrics = {
  score: 0,
  pushes: 0,
  moves: 0,
  dependency: 0,
  trap: 0,
  away_pushes: 0,
  box_switches: 0,
}

function contentHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizedXsb(xsb: string): string {
  return xsb.replace(/\r/g, '').trimEnd()
}

export function levelProgressKey(level: Pick<PackLevel, 'id' | 'xsb'>): string {
  return `custom:${level.id}:${contentHash(normalizedXsb(level.xsb))}`
}

function validateXsb(xsb: string) {
  const normalized = xsb.replace(/\r/g, '')
  const rows = normalized.split('\n').filter(Boolean)
  const players = [...normalized].filter((character) => character === '@' || character === '+').length
  const level = parseLevel(xsb)
  if (players !== 1
    || rows.some((row) => !/^[# .+$@*-]+$/.test(row))
    || level.width < 3 || level.height < 3 || level.width > 20 || level.height > 20
    || level.boxes.length === 0 || boardStatus(level) === 'invalid') {
    throw new Error('Invalid XSB level')
  }
}

function hasValidDifficulty(value: unknown): value is DifficultyMetrics {
  if (!value || typeof value !== 'object') return false
  const metrics = value as Record<string, unknown>
  return ['score', 'pushes', 'moves', 'dependency', 'trap', 'away_pushes', 'box_switches']
    .every((key) => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]))
}

function hasValidSolution(xsb: string, solution: unknown): solution is string | undefined {
  if (solution === undefined) return true
  if (typeof solution !== 'string' || !/^[URDL]*$/.test(solution)) return false
  let level = parseLevel(xsb)
  for (const direction of solution) {
    const next = move(level, direction)
    if (!next) return false
    level = next
  }
  return boardStatus(level) === 'solved'
}

export function isPackLevel(value: unknown): value is PackLevel {
  if (!value || typeof value !== 'object') return false
  const level = value as Partial<PackLevel>
  if (typeof level.id !== 'string' || !level.id
    || typeof level.name !== 'string' || !level.name
    || typeof level.xsb !== 'string'
    || !hasValidDifficulty(level.difficulty)) return false
  try {
    validateXsb(level.xsb)
    return hasValidSolution(level.xsb, level.solution)
  } catch {
    return false
  }
}

export function parseLevelPack(text: string): LevelPack {
  const pack = JSON.parse(text) as Partial<LevelPack>
  if (pack.kind !== 'sokoforge-level-pack' || pack.schemaVersion !== 1 || !Array.isArray(pack.levels)) {
    throw new Error('Unsupported SokoForge pack')
  }
  if (!pack.levels.every(isPackLevel)) throw new Error('Invalid SokoForge pack')
  pack.levels.forEach((level) => validateXsb(level.xsb))
  return pack as LevelPack
}

export function parseImportedFile(name: string, text: string): PackLevel[] {
  if (name.toLowerCase().endsWith('.json')) return parseLevelPack(text).levels
  if (!name.toLowerCase().endsWith('.xsb')) return []
  validateXsb(text)
  const baseName = name.replace(/\.xsb$/i, '')
  return [{
    id: `file-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${contentHash(text)}`,
    name: baseName,
    xsb: text,
    difficulty: { ...EMPTY_DIFFICULTY },
  }]
}

export function createLevelPack(levels: PackLevel[], mode: string = 'composite'): LevelPack {
  return {
    schemaVersion: 1,
    kind: 'sokoforge-level-pack',
    mode,
    levels,
  }
}

export function mergeLevelLists(incoming: PackLevel[], current: PackLevel[]): PackLevel[] {
  const seenMaps = new Set<string>()
  const seenIds = new Set<string>()
  const merged: PackLevel[] = []
  for (const level of [...incoming, ...current]) {
    const key = normalizedXsb(level.xsb)
    if (seenMaps.has(key)) continue
    seenMaps.add(key)
    const id = seenIds.has(level.id) ? `${level.id}-${contentHash(key)}` : level.id
    seenIds.add(id)
    merged.push(id === level.id ? level : { ...level, id })
  }
  return merged
}

export function packFileName(now = new Date()): string {
  return `sokoforge-pack-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
}

export function downloadLevelPack(pack: LevelPack, name = packFileName()) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
