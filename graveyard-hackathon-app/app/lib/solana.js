import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { gameConfig } from '../config/gameConfig'

export function getConnection() {
  return new Connection(gameConfig.economy.rpcUrl, 'confirmed')
}

/**
 * Check if economy config has valid treasury public key set
 */
export function isEconomyConfigured() {
  const { treasury } = gameConfig.economy
  if (!treasury) return false
  try {
    new PublicKey(treasury)
    return true
  } catch {
    return false
  }
}

/**
 * Get the user's SOL balance
 * @returns {number} Balance in SOL (human-readable)
 */
export async function getSolBalance(connection, userPubkey) {
  const user = typeof userPubkey === 'string' ? new PublicKey(userPubkey) : userPubkey
  try {
    const lamports = await connection.getBalance(user)
    return lamports / LAMPORTS_PER_SOL
  } catch {
    return 0
  }
}

export async function buildPaymentTx(userPubkey, priceSOL = gameConfig.economy.thirdVisionPrice) {
  if (!isEconomyConfigured()) {
    throw new Error('Economy not configured: treasury public key is missing. Check your .env.local')
  }

  const connection = getConnection()
  const treasury = new PublicKey(gameConfig.economy.treasury)
  const user = new PublicKey(userPubkey)

  const lamports = Math.round(priceSOL * LAMPORTS_PER_SOL)

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: treasury,
      lamports,
    })
  )

  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = user

  return tx
}
