import crypto from 'crypto'
import { pickAura } from './aura'

export function deriveSeed(txSig, blockhash, userPubkey, salt) {
  const input = `${txSig}${blockhash}${userPubkey}${salt}`
  return crypto.createHash('sha256').update(input).digest('hex')
}

// Weighted random selection — same approach as pickAura
function pickWeighted(items, seedByte) {
  const totalWeight = items.reduce((sum, i) => sum + (i.weight || 1), 0)
  let roll = seedByte % totalWeight
  for (const item of items) {
    roll -= (item.weight || 1)
    if (roll < 0) return item
  }
  return items[0]
}

export function seedToOutcome(seedHex, config) {
  const buf = Buffer.from(seedHex, 'hex')

  // Weighted spot selection (rarity axis)
  const spot = pickWeighted(config.spots, buf.readUInt8(0))

  // Equal-weight for presets and poses (visual variety)
  const presetIndex = buf.readUInt8(4) % config.presets.length
  const poseIndex = buf.readUInt8(8) % config.poses.length

  // Aura is the other rarity axis
  const auraByte = buf.readUInt8(12)
  const aura = pickAura(auraByte)

  return {
    spot,
    preset: config.presets[presetIndex],
    pose: config.poses[poseIndex],
    aura,
  }
}
