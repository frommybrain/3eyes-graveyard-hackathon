import { NextResponse } from 'next/server'
import { walletVisions } from '../../lib/sessionStore'
import { hasMinted } from '../../lib/mintStore'
import { gameConfig } from '../../config/gameConfig'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
  }

  const walletData = walletVisions.get(wallet) || { count: 0, sessions: [], batchStartedAt: null }
  const maxSelfies = gameConfig.economy.maxSelfies || 3
  const cooldownMs = (gameConfig.economy.selfieCooldownHours || 3) * 60 * 60 * 1000
  const now = Date.now()

  // Check if cooldown has expired — reset if so
  const isDev = (gameConfig.economy.devWallets || []).includes(wallet)
  let selfieCount = walletData.count
  let cooldownEndsAt = null
  if (walletData.count >= maxSelfies) {
    if (isDev) {
      walletData.count = 0
      walletData.sessions = []
      walletData.batchStartedAt = null
      selfieCount = 0
    } else if (walletData.batchStartedAt) {
      const elapsed = now - walletData.batchStartedAt
      if (elapsed >= cooldownMs) {
        walletData.count = 0
        walletData.sessions = []
        walletData.batchStartedAt = null
        selfieCount = 0
      } else {
        cooldownEndsAt = walletData.batchStartedAt + cooldownMs
      }
    }
  }

  const minted = isDev ? false : await hasMinted(wallet)

  return NextResponse.json({
    selfieCount,
    maxSelfies,
    maxFreeVisions: gameConfig.economy.maxFreeVisions,
    hasMinted: minted,
    cooldownEndsAt,
  })
}
