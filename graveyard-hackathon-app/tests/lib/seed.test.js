import { describe, it, expect } from 'vitest'
import { deriveSeed, seedToOutcome } from '../../app/lib/seed'
import { gameConfig } from '../../app/config/gameConfig'

describe('deriveSeed', () => {
  it('produces a 64-char hex string', () => {
    const seed = deriveSeed('tx123', 'blockhash456', 'userPubkey789', 'salt')
    expect(seed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same inputs produce same seed', () => {
    const a = deriveSeed('tx', 'bh', 'user', 'salt')
    const b = deriveSeed('tx', 'bh', 'user', 'salt')
    expect(a).toBe(b)
  })

  it('different inputs produce different seeds', () => {
    const a = deriveSeed('tx1', 'bh', 'user', 'salt')
    const b = deriveSeed('tx2', 'bh', 'user', 'salt')
    expect(a).not.toBe(b)
  })

  it('is sensitive to salt changes', () => {
    const a = deriveSeed('tx', 'bh', 'user', 'salt_a')
    const b = deriveSeed('tx', 'bh', 'user', 'salt_b')
    expect(a).not.toBe(b)
  })

  it('handles empty strings without crashing', () => {
    const seed = deriveSeed('', '', '', '')
    expect(seed).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('seedToOutcome', () => {
  it('returns an object with spot, preset, pose, and aura', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const outcome = seedToOutcome(seed, gameConfig)
    expect(outcome).toHaveProperty('spot')
    expect(outcome).toHaveProperty('preset')
    expect(outcome).toHaveProperty('pose')
    expect(outcome).toHaveProperty('aura')
  })

  it('spot is one of the configured spots', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const outcome = seedToOutcome(seed, gameConfig)
    expect(gameConfig.spots).toContainEqual(outcome.spot)
  })

  it('preset is one of the configured presets', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const outcome = seedToOutcome(seed, gameConfig)
    expect(gameConfig.presets).toContainEqual(outcome.preset)
  })

  it('pose is one of the configured poses', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const outcome = seedToOutcome(seed, gameConfig)
    expect(gameConfig.poses).toContainEqual(outcome.pose)
  })

  it('aura has expected shape', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const outcome = seedToOutcome(seed, gameConfig)
    expect(outcome.aura).toHaveProperty('id')
    expect(outcome.aura).toHaveProperty('name')
    expect(outcome.aura).toHaveProperty('tier')
    expect(outcome.aura).toHaveProperty('weight')
    expect(outcome.aura).toHaveProperty('color')
  })

  it('is deterministic for the same seed', () => {
    const seed = deriveSeed('tx', 'bh', 'user', 'salt')
    const a = seedToOutcome(seed, gameConfig)
    const b = seedToOutcome(seed, gameConfig)
    expect(a.spot.id).toBe(b.spot.id)
    expect(a.preset.id).toBe(b.preset.id)
    expect(a.pose.id).toBe(b.pose.id)
    expect(a.aura.id).toBe(b.aura.id)
  })

  it('covers all spots with enough entropy', () => {
    const spotsSeen = new Set()
    for (let i = 0; i < 1000; i++) {
      const seed = deriveSeed(`tx${i}`, 'bh', 'user', 'salt')
      const outcome = seedToOutcome(seed, gameConfig)
      spotsSeen.add(outcome.spot.id)
    }
    expect(spotsSeen.size).toBe(gameConfig.spots.length)
  })
})
