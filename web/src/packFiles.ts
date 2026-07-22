import { boardStatus, parseLevel } from './level'
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

function validateXsb(xsb: string) {
  const level = parseLevel(xsb)
  if (level.width < 3 || level.height < 3 || level.boxes.length === 0 || boardStatus(level) === 'invalid') {
    throw new Error('Invalid XSB level')
  }
}

export function isPackLevel(value: unknown): value is PackLevel {
  if (!value || typeof value !== 'object') return false
  const level = value as Partial<PackLevel>
  return typeof level.id === 'string'
    && typeof level.name === 'string'
    && typeof level.xsb === 'string'
    && !!level.difficulty
    && typeof level.difficulty.pushes === 'number'
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
    const key = level.xsb.replace(/\r/g, '').trimEnd()
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
