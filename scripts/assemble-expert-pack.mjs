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
  if (level.difficulty.pushes < MIN_PUSHES || level.difficulty.score < MIN_SCORE) continue
  const current = unique.get(xsb)
  if (!current || current.difficulty.score < level.difficulty.score) unique.set(xsb, { ...level, xsb })
}

const selected = [...unique.values()]
  .sort((a, b) => b.difficulty.score - a.difficulty.score || b.difficulty.pushes - a.difficulty.pushes)
  .slice(0, TARGET_COUNT)

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
  }
})

await writeFile(output, `${JSON.stringify({ schemaVersion: 1, kind: 'sokoforge-published-pack', levels }, null, 2)}\n`)

const pushes = levels.map((level) => level.optimalPushes)
console.log(`Wrote ${levels.length} levels to ${output}`)
console.log(`Optimal pushes: ${Math.min(...pushes)}-${Math.max(...pushes)}`)
