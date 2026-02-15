import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { deriveSeed, seedToOutcome } from '../../lib/seed'
import { gameConfig } from '../../config/gameConfig'
import { verifyPayment } from '../../lib/verifyPayment'

// In-memory stores — replace with DB for production
const sessions = new Map()
const walletVisions = new Map()
const mintedWallets = new Set()
let mintCount = 0

export async function POST(request) {
  try {
    const { wallet, visionNumber, txSig } = await request.json()

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    }

    if (mintedWallets.has(wallet)) {
      return NextResponse.json({ error: 'Wallet already minted' }, { status: 409 })
    }

    const walletData = walletVisions.get(wallet) || { count: 0, sessions: [] }

    if (walletData.count >= 3) {
      return NextResponse.json({ error: 'Maximum visions reached' }, { status: 400 })
    }

    // Vision 3 requires $3EYES payment
    if (visionNumber > 2) {
      if (!txSig) {
        return NextResponse.json({ error: 'Payment required for 3rd vision' }, { status: 402 })
      }
      const rpcUrl = gameConfig.economy.rpcUrl
      const expectedMint = gameConfig.economy.mint
      const treasuryPubkey = gameConfig.economy.treasury
      await verifyPayment(txSig, wallet, rpcUrl, expectedMint, treasuryPubkey)
    }

    // Derive seed — use wallet + vision number + timestamp for entropy
    const entropy = txSig || `${wallet}-${visionNumber}-${Date.now()}`
    const seed = deriveSeed(entropy, String(Date.now()), wallet, process.env.SERVER_SALT || 'graveyard')
    const outcome = seedToOutcome(seed, gameConfig)

    const sessionId = crypto.randomUUID()

    // Track per-wallet
    walletData.count += 1
    walletData.sessions.push(sessionId)
    walletVisions.set(wallet, walletData)

    // Store session
    sessions.set(sessionId, {
      sessionId,
      seed,
      wallet,
      visionNumber: walletData.count,
      outcome,
      minted: false,
      createdAt: Date.now(),
    })

    return NextResponse.json({
      ok: true,
      sessionId,
      outcome,
      visionNumber: walletData.count,
      visionsRemaining: 3 - walletData.count,
    })
  } catch (err) {
    console.error('Vision error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export { sessions, walletVisions, mintedWallets, mintCount }
