import crypto from 'crypto'
import { pickAura } from './aura'

export function deriveSeed(txSig, blockhash, userPubkey, salt) {
  const input = `${txSig}${blockhash}${userPubkey}${salt}`
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function seedToOutcome(seedHex, config) {
  const buf = Buffer.from(seedHex, 'hex')

  // Equal-weight spot selection (visual variety only)
  const spotIndex = buf.readUInt8(0) % config.spots.length
  const presetIndex = buf.readUInt8(4) % config.presets.length
  const poseIndex = buf.readUInt8(8) % config.poses.length

  // Aura is the rarity axis
  const auraByte = buf.readUInt8(12)
  const aura = pickAura(auraByte)

  return {
    spot: config.spots[spotIndex],
    preset: config.presets[presetIndex],
    pose: config.poses[poseIndex],
    aura,
  }
}
