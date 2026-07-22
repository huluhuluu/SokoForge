import { readFile, writeFile } from 'node:fs/promises'

const [output, ...inputs] = process.argv.slice(2)
const TARGET_COUNT = 200
const MIN_PUSHES = 16
const MIN_SCORE = 60

if (!output || inputs.length === 0) {
  throw new Error('Usage: node scripts/assemble-expert-pack.mjs <output> <pack...>')
}

const candidates = []
for (const input of inputs) {
  const pack = JSON.parse(await readFile(input, 'utf8'))
  if (pack.kind !== 'sokoforge-level-pack' || pack.schemaVersion !== 1 || !Array.isArray(pack.levels)) {
    throw new Error(`Unsupported pack: ${input}`)
  }
  candidates.push(...pack.levels)
}

const unique = new Map()
for (const level of candidates) {
  const xsb = level.xsb.replace(/\r/g, '').trimEnd()
  const metrics = level.difficulty
  const deepTrap = metrics.delayed_lures >= 2 || metrics.reopened_goals > 0 || metrics.tunnel_commitments >= 2 || metrics.false_goal_lures > 0 || metrics.deadlock_lures > 0
  const orderingTrap = metrics.away_pushes >= 2 || metrics.box_revisits >= 2 || metrics.role_swaps > 0
  if (metrics.pushes < MIN_PUSHES || metrics.score < MIN_SCORE || !deepTrap || !orderingTrap) continue
  const current = unique.get(xsb)
  if (!current || current.difficulty.score < level.difficulty.score) unique.set(xsb, { ...level, xsb })
}

function noveltyDistance(first, second) {
  const maxLength = Math.max(first.xsb.length, second.xsb.length, 1)
  let changed = Math.abs(first.xsb.length - second.xsb.length)
  for (let index = 0; index < Math.min(first.xsb.length, second.xsb.length); index += 1) changed += Number(first.xsb[index] !== second.xsb[index])
  const structure = changed / maxLength * 100
  const left = first.difficulty
  const right = second.difficulty
  const behavior = [
    Math.abs(left.pushes - right.pushes) / 40,
    Math.abs(left.away_pushes - right.away_pushes) / 12,
    Math.abs(left.box_switches - right.box_switches) / 18,
    Math.abs(left.pdb - right.pdb) / 30,
    Math.abs(left.reopened_goals - right.reopened_goals) / 5,
    Math.abs(left.delayed_lures - right.delayed_lures) / 40,
  ].reduce((sum, value) => sum + value, 0) / 6 * 100
  return Math.min(100, structure * 0.55 + Math.min(100, behavior) * 0.45)
}

function selectWithNovelty(levels, limit) {
  const remaining = [...levels]
  const selected = []
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0
    let bestValue = -Infinity
    let bestNovelty = 0
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      const novelty = selected.length ? Math.min(...selected.map((other) => noveltyDistance(candidate, other))) : 100
      const value = candidate.difficulty.score * 0.8 + novelty * 0.2
      if (value > bestValue) {
        bestIndex = index
        bestValue = value
        bestNovelty = novelty
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1)
    chosen.difficulty.novelty = bestNovelty
    selected.push(chosen)
  }
  return selected
}

const selected = selectWithNovelty([...unique.values()], TARGET_COUNT)
  .sort((a, b) => b.difficulty.score - a.difficulty.score || b.difficulty.pushes - a.difficulty.pushes)

if (selected.length < TARGET_COUNT) {
  throw new Error(`Only ${selected.length} qualifying unique levels; ${TARGET_COUNT} required`)
}

const levels = selected.map((level, index) => {
  const number = String(index + 1).padStart(3, '0')
  return {
    id: `expert-${number}`,
    title: { en: `Expert Forge ${number}`, zh: `专家熔炉 ${number}` },
    difficulty: 'expert',
    boxes: [...level.xsb].filter((cell) => cell === '$' || cell === '*').length,
    optimalPushes: level.difficulty.pushes,
    xsb: level.xsb,
    metrics: level.difficulty,
  }
})

await writeFile(output, `${JSON.stringify({ schemaVersion: 1, kind: 'sokoforge-published-pack', levels }, null, 2)}\n`)

const pushes = levels.map((level) => level.optimalPushes)
console.log(`Wrote ${levels.length} levels to ${output}`)
console.log(`Optimal pushes: ${Math.min(...pushes)}-${Math.max(...pushes)}`)
console.log(`Trap coverage: reopened=${levels.filter((level) => level.metrics.reopened_goals > 0).length}, delayed=${levels.filter((level) => level.metrics.delayed_lures >= 2).length}, false-goal=${levels.filter((level) => level.metrics.false_goal_lures > 0).length}, deadlock=${levels.filter((level) => level.metrics.deadlock_lures > 0).length}, tunnel=${levels.filter((level) => level.metrics.tunnel_commitments >= 2).length}`)
