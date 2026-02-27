import { NextResponse } from 'next/server'
import { verifyPayment } from '../../lib/verifyPayment'
import { deriveSeed } from '../../lib/seed'
import crypto from 'crypto'

// In-memory session store — replace with Redis/DB for production
const sessions = new Map()

export async function POST(request) {
  try {
    const { userPubkey, txSig } = await request.json()

    if (!userPubkey || !txSig) {
      return NextResponse.json({ error: 'Missing userPubkey or txSig' }, { status: 400 })
    }

    // Prevent tx replay
    if (sessions.has(txSig)) {
      return NextResponse.json({ error: 'Transaction already used' }, { status: 409 })
    }

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    const treasuryPubkey = process.env.NEXT_PUBLIC_TREASURY_PUBKEY

    // Verify SOL payment on-chain
    const { blockhash } = await verifyPayment(txSig, userPubkey, rpcUrl, treasuryPubkey)

    // Derive deterministic seed
    const seed = deriveSeed(txSig, blockhash, userPubkey, process.env.SERVER_SALT || '')
    const sessionId = crypto.randomUUID()

    // Store session (keyed by both txSig and sessionId)
    const sessionData = { sessionId, seed, userPubkey, txSig, minted: false, createdAt: Date.now() }
    sessions.set(txSig, sessionData)
    sessions.set(sessionId, sessionData)

    return NextResponse.json({ ok: true, sessionId, seed })
  } catch (err) {
    console.error('Commit error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Export sessions map so reveal/mint routes can access it
export { sessions }
