import { describe, it, expect } from 'vitest'
import { AURA_TIERS, pickAura } from '../../app/lib/aura'

describe('AURA_TIERS', () => {
  it('has 5 tiers', () => {
    expect(AURA_TIERS).toHaveLength(5)
  })

  it('tiers are in ascending order', () => {
    for (let i = 1; i < AURA_TIERS.length; i++) {
      expect(AURA_TIERS[i].tier).toBeGreaterThan(AURA_TIERS[i - 1].tier)
    }
  })

  it('weights sum to 100', () => {
    const total = AURA_TIERS.reduce((s, a) => s + a.weight, 0)
    expect(total).toBe(100)
  })

  it('each tier has required fields', () => {
    for (const tier of AURA_TIERS) {
      expect(tier).toHaveProperty('id')
      expect(tier).toHaveProperty('name')
      expect(tier).toHaveProperty('tier')
      expect(tier).toHaveProperty('weight')
      expect(tier).toHaveProperty('color')
      expect(tier).toHaveProperty('description')
    }
  })
})

describe('pickAura', () => {
  it('returns an aura object', () => {
    const aura = pickAura(0)
    expect(aura).toHaveProperty('id')
    expect(aura).toHaveProperty('name')
  })

  it('seed byte 0 returns Faded (most common)', () => {
    const aura = pickAura(0)
    expect(aura.id).toBe('faded')
  })

  it('seed byte at boundary (65) returns Marked', () => {
    // Faded weight = 65, so byte 65 % 100 = 65 falls into Marked
    const aura = pickAura(65)
    expect(aura.id).toBe('marked')
  })

  it('seed byte at high end returns rarer tiers', () => {
    // 65+20+10+4 = 99 → Black Sun at byte 99
    const aura = pickAura(99)
    expect(aura.id).toBe('black_sun')
  })

  it('never returns undefined for any byte value 0-255', () => {
    for (let i = 0; i < 256; i++) {
      const aura = pickAura(i)
      expect(aura).toBeDefined()
      expect(aura.id).toBeTruthy()
    }
  })

  it('distribution roughly matches weights over many samples', () => {
    const counts = {}
    AURA_TIERS.forEach((t) => { counts[t.id] = 0 })
    // Use all 256 possible byte values
    for (let i = 0; i < 256; i++) {
      const aura = pickAura(i)
      counts[aura.id]++
    }
    // Faded (65%) should be the most common
    expect(counts.faded).toBeGreaterThan(counts.marked)
    expect(counts.marked).toBeGreaterThan(counts.chosen)
    expect(counts.chosen).toBeGreaterThan(counts.blessed)
    // Black Sun should be rare but present
    expect(counts.black_sun).toBeGreaterThan(0)
    expect(counts.black_sun).toBeLessThan(10)
  })
})
