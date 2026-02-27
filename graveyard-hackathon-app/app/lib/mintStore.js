/**
 * Persistent mint store — uses Upstash Redis on Vercel,
 * falls back to local JSON file for dev.
 */

import { Redis } from '@upstash/redis'
import fs from 'fs'
import path from 'path'

// --- Redis (production / Vercel) ---

let redis = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

// --- Local file fallback (dev without Redis) ---

const STORE_PATH = path.resolve('.mint-store.json')

function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return { mintCount: 0, mintedWallets: [] }
  }
}

function writeLocal(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2))
}

// --- Exports (all async) ---

export async function getMintCount() {
  if (redis) {
    const count = await redis.get('mintCount')
    return count ?? 0
  }
  return readLocal().mintCount
}

export async function incrementMintCount() {
  if (redis) {
    return await redis.incr('mintCount')
  }
  const store = readLocal()
  store.mintCount += 1
  writeLocal(store)
  return store.mintCount
}

export async function hasMinted(wallet) {
  if (redis) {
    return await redis.sismember('mintedWallets', wallet)
  }
  return readLocal().mintedWallets.includes(wallet)
}

export async function addMintedWallet(wallet) {
  if (redis) {
    await redis.sadd('mintedWallets', wallet)
    return
  }
  const store = readLocal()
  if (!store.mintedWallets.includes(wallet)) {
    store.mintedWallets.push(wallet)
    writeLocal(store)
  }
}

export async function resetStore() {
  if (redis) {
    await redis.set('mintCount', 0)
    await redis.del('mintedWallets')
    return
  }
  writeLocal({ mintCount: 0, mintedWallets: [] })
}
