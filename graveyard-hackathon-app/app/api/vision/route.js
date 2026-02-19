import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { deriveSeed, seedToOutcome } from '../../lib/seed'
import { gameConfig } from '../../config/gameConfig'
import { verifyPayment } from '../../lib/verifyPayment'
import { getStripe } from '../../lib/stripe'

// In-memory stores — replace with DB for production
const sessions = new Map()
const walletVisions = new Map()
const mintedWallets = new Set()
let mintCount = 0

export async function POST(request) {
  try {
    const { wallet, visionNumber, txSig, stripeSessionId, paymentIntentId } = await request.json()

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

    // Vision 3 requires payment — $3EYES on-chain, Stripe PaymentIntent, or legacy Checkout
    if (visionNumber > 2) {
      if (paymentIntentId) {
        // Inline Stripe Elements payment
        const stripe = getStripe()
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
        if (pi.status !== 'succeeded') {
          return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
        }
        if (pi.metadata?.wallet !== wallet || pi.metadata?.type !== 'vision') {
          return NextResponse.json({ error: 'Payment metadata mismatch' }, { status: 403 })
        }
      } else if (stripeSessionId) {
        // Legacy: Fiat payment via Stripe Checkout session
        const stripe = getStripe()
        const stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId)
        if (stripeSession.payment_status !== 'paid') {
          return NextResponse.json({ error: 'Fiat payment not completed' }, { status: 402 })
        }
        if (stripeSession.metadata?.wallet !== wallet) {
          return NextResponse.json({ error: 'Wallet mismatch in payment' }, { status: 403 })
        }
      } else if (txSig) {
        // Crypto payment — verify on-chain $3EYES transfer
        const rpcUrl = gameConfig.economy.rpcUrl
        const expectedMint = gameConfig.economy.mint
        const treasuryPubkey = gameConfig.economy.treasury
        await verifyPayment(txSig, wallet, rpcUrl, expectedMint, treasuryPubkey)
      } else {
        return NextResponse.json({ error: 'Payment required for 3rd vision' }, { status: 402 })
      }
    }

    // Derive seed — use payment proof + wallet for entropy
    const entropy = txSig || paymentIntentId || stripeSessionId || `${wallet}-${visionNumber}-${Date.now()}`
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
