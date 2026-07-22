import { applyTool, move, parseLevel, SAMPLE, toXsb } from './level'
import { describe, expect, it } from 'vitest'

describe('level editor helpers', () => {
  it('round trips XSB', () => expect(parseLevel(toXsb(parseLevel(SAMPLE))).boxes.length).toBe(2))
  it('places a goal', () => { const level = parseLevel(SAMPLE); expect(applyTool(level, 9, 'goal').goals).toContain(9) })
  it('moves the player on free floor', () => { const level = parseLevel(SAMPLE); expect(move(level, 'L')).not.toBeNull() })
})
