import { describe, expect, it } from 'vitest'
import { createLevelPack, mergeLevelLists, parseImportedFile, parseLevelPack } from './packFiles'
import { SAMPLE } from './level'

const level = {
  id: 'test',
  name: 'Test',
  xsb: SAMPLE,
  difficulty: { score: 1, pushes: 1, moves: 1, dependency: 0, trap: 0, away_pushes: 0, box_switches: 0 },
}

describe('level pack files', () => {
  it('round trips a generated pack', () => {
    const pack = createLevelPack([level], 'hard')
    expect(pack.mode).toBe('hard')
    expect(parseLevelPack(JSON.stringify(pack)).levels[0].xsb).toBe(SAMPLE)
  })

  it('imports a standalone XSB file', () => {
    expect(parseImportedFile('level.xsb', SAMPLE)[0].name).toBe('level')
  })

  it('deduplicates identical maps', () => {
    expect(mergeLevelLists([level], [{ ...level, id: 'other' }])).toHaveLength(1)
  })

  it('renames duplicate IDs from different packs', () => {
    const other = { ...level, xsb: level.xsb.replace('#  .', '# . '), name: 'Other' }
    const merged = mergeLevelLists([level, other], [])
    expect(new Set(merged.map((item) => item.id)).size).toBe(2)
  })
})
