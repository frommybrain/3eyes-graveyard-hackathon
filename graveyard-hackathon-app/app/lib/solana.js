import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { createTransferInstruction, getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { gameConfig } from '../config/gameConfig'

export function getConnection() {
  return new Connection(gameConfig.economy.rpcUrl, 'confirmed')
}

/**
 * Check if economy config has valid public keys set
 */
export function isEconomyConfigured() {
  const { mint, treasury } = gameConfig.economy
  if (!mint || !treasury) return false
  try {
    new PublicKey(mint)
    new PublicKey(treasury)
    return true
  } catch {
    return false
  }
}

/**
 * Get the user's $3EYES token balance
 * @returns {number} Display balance (human-readable, not raw)
 */
export async function getTokenBalance(connection, userPubkey) {
  const mint = new PublicKey(gameConfig.economy.mint)
  const user = typeof userPubkey === 'string' ? new PublicKey(userPubkey) : userPubkey
  try {
    const ata = await getAssociatedTokenAddress(mint, user)
    const account = await getAccount(connection, ata)
    const raw = Number(account.amount)
    return Math.floor(raw / Math.pow(10, gameConfig.economy.decimals))
  } catch {
    return 0
  }
}

export async function buildPaymentTx(userPubkey, priceDisplay = gameConfig.economy.thirdVisionPrice) {
  if (!isEconomyConfigured()) {
    throw new Error('Economy not configured: mint or treasury public key is missing. Check your .env.local')
  }

  const connection = getConnection()
  const mint = new PublicKey(gameConfig.economy.mint)
  const treasury = new PublicKey(gameConfig.economy.treasury)
  const user = new PublicKey(userPubkey)

  const userAta = await getAssociatedTokenAddress(mint, user)
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury)

  const priceRaw = BigInt(priceDisplay) * BigInt(10 ** gameConfig.economy.decimals)

  const tx = new Transaction().add(
    createTransferInstruction(userAta, treasuryAta, user, priceRaw)
  )

  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = user

  return tx
}
