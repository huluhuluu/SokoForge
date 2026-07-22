import type { Tool } from './types'

export const SAMPLE = `########
#  .   #
# $$   #
#  @ . #
########`

export interface ParsedLevel { width: number; height: number; cells: string[]; player: number; boxes: number[]; goals: number[] }

export function parseLevel(xsb: string): ParsedLevel {
  const rows = xsb.replace(/\r/g, '').split('\n').filter(Boolean)
  const width = rows.reduce((max, row) => Math.max(max, [...row].length), 0)
  const cells: string[] = []
  let player = -1; const boxes: number[] = []; const goals: number[] = []
  for (let y = 0; y < rows.length; y += 1) {
    const chars = [...rows[y]]
    for (let x = 0; x < width; x += 1) {
      const c = chars[x] ?? ' '
      const i = y * width + x
      if (c === '#') cells[i] = '#'
      else if (c === '.' || c === '+' || c === '*') { cells[i] = '.'; goals.push(i) }
      else cells[i] = ' '
      if (c === '$' || c === '*') boxes.push(i)
      if (c === '@' || c === '+') player = i
    }
  }
  return { width, height: rows.length, cells, player, boxes, goals }
}

export function toXsb(level: ParsedLevel): string {
  const boxSet = new Set(level.boxes)
  const rows: string[] = []
  for (let y = 0; y < level.height; y += 1) {
    let row = ''
    for (let x = 0; x < level.width; x += 1) {
      const i = y * level.width + x
      const goal = level.goals.includes(i)
      if (level.cells[i] === '#') row += '#'
      else if (boxSet.has(i) && goal) row += '*'
      else if (boxSet.has(i)) row += '$'
      else if (level.player === i && goal) row += '+'
      else if (level.player === i) row += '@'
      else if (goal) row += '.'
      else row += ' '
    }
    rows.push(row)
  }
  return rows.join('\n')
}

export function applyTool(level: ParsedLevel, index: number, tool: Tool): ParsedLevel {
  const next: ParsedLevel = { ...level, cells: [...level.cells], boxes: [...level.boxes], goals: [...level.goals] }
  const isGoal = next.goals.includes(index)
  next.boxes = next.boxes.filter((i) => i !== index)
  next.goals = next.goals.filter((i) => i !== index)
  if (tool === 'wall') { next.cells[index] = '#'; if (next.player === index) next.player = -1 }
  if (tool === 'floor' || tool === 'eraser') next.cells[index] = ' '
  if (tool === 'goal') { next.cells[index] = ' '; next.goals.push(index) }
  if (tool === 'box') { next.cells[index] = ' '; next.boxes.push(index); if (isGoal) next.goals.push(index) }
  if (tool === 'player') { next.cells[index] = ' '; next.player = index; if (isGoal) next.goals.push(index) }
  return next
}

export function resizeLevel(level: ParsedLevel, width: number, height: number): ParsedLevel {
  const next: ParsedLevel = { width, height, cells: Array(width * height).fill(' '), player: -1, boxes: [], goals: [] }
  for (let y = 0; y < Math.min(height, level.height); y += 1) for (let x = 0; x < Math.min(width, level.width); x += 1) {
    const from = y * level.width + x; const to = y * width + x
    next.cells[to] = level.cells[from]
    if (level.player === from) next.player = to
    if (level.boxes.includes(from)) next.boxes.push(to)
    if (level.goals.includes(from)) next.goals.push(to)
  }
  return next
}

export function move(level: ParsedLevel, direction: string): ParsedLevel | null {
  const deltas: Record<string, [number, number]> = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] }
  const delta = deltas[direction]; if (!delta || level.player < 0) return null
  const x = level.player % level.width; const y = Math.floor(level.player / level.width)
  const nx = x + delta[0]; const ny = y + delta[1]; const next = ny * level.width + nx
  if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height || level.cells[next] === '#') return null
  const boxIndex = level.boxes.indexOf(next)
  if (boxIndex < 0) return { ...level, player: next }
  const bx = nx + delta[0]; const by = ny + delta[1]; const beyond = by * level.width + bx
  if (bx < 0 || by < 0 || bx >= level.width || by >= level.height || level.cells[beyond] === '#' || level.boxes.includes(beyond)) return null
  const boxes = [...level.boxes]; boxes[boxIndex] = beyond
  return { ...level, player: next, boxes }
}

export function boardStatus(level: ParsedLevel): string {
  if (level.player < 0) return 'invalid'
  if (level.boxes.length !== level.goals.length) return 'invalid'
  return level.boxes.every((box) => level.goals.includes(box)) ? 'solved' : 'ready'
}

