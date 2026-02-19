import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { pickAura } from '../../lib/aura'
import { getStripe } from '../../lib/stripe'
import { sessions } from '../vision/route'
import { verifyPayment } from '../../lib/verifyPayment'
import { gameConfig } from '../../config/gameConfig'

// Track consumed payment proofs to prevent reuse
const usedPaymentProofs = new Set()

export async function POST(request) {
  try {
    const { sessionId, wallet, txSig, paymentIntentId } = await request.json()

    if (!sessionId || !wallet) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.wallet !== wallet) {
      return NextResponse.json({ error: 'Wallet mismatch' }, { status: 403 })
    }
    if (session.minted) {
      return NextResponse.json({ error: 'Already minted — aura is locked' }, { status: 409 })
    }

    // Verify payment — one of txSig or paymentIntentId required
    const paymentProof = txSig || paymentIntentId
    if (!paymentProof) {
      return NextResponse.json({ error: 'Payment required for re-roll' }, { status: 402 })
    }

    // Prevent replay
    if (usedPaymentProofs.has(paymentProof)) {
      return NextResponse.json({ error: 'Payment already used' }, { status: 409 })
    }

    if (paymentIntentId) {
      const stripe = getStripe()
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.status !== 'succeeded') {
        return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
      }
      if (pi.metadata?.wallet !== wallet || pi.metadata?.type !== 'reroll') {
        return NextResponse.json({ error: 'Payment metadata mismatch' }, { status: 403 })
      }
    } else if (txSig) {
      const rpcUrl = gameConfig.economy.rpcUrl
      const expectedMint = gameConfig.economy.mint
      const treasuryPubkey = gameConfig.economy.treasury
      await verifyPayment(txSig, wallet, rpcUrl, expectedMint, treasuryPubkey)
    }

    // Mark payment as consumed
    usedPaymentProofs.add(paymentProof)

    // Generate new entropy for aura only
    const rerollEntropy = `${sessionId}-reroll-${paymentProof}-${Date.now()}`
    const rerollHash = crypto.createHash('sha256').update(rerollEntropy).digest()
    const newAuraByte = rerollHash.readUInt8(0)
    const newAura = pickAura(newAuraByte)

    // Update session — preserve spot/preset/pose, only swap aura
    session.outcome = { ...session.outcome, aura: newAura }
    session.rerollCount = (session.rerollCount || 0) + 1

    return NextResponse.json({
      ok: true,
      aura: newAura,
      rerollCount: session.rerollCount,
    })
  } catch (err) {
    console.error('Reroll error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export { usedPaymentProofs }
