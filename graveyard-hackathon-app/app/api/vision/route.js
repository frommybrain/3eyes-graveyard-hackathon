import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { deriveSeed, seedToOutcome } from '../../lib/seed'
import { gameConfig } from '../../config/gameConfig'
import { verifyPayment } from '../../lib/verifyPayment'
import { getStripe } from '../../lib/stripe'
import { sessions, walletVisions } from '../../lib/sessionStore'
import { hasMinted } from '../../lib/mintStore'

export async function POST(request) {
  try {
    const { wallet, visionNumber, txSig, stripeSessionId, paymentIntentId, lastSessionId } = await request.json()

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    }

    const isDev = (gameConfig.economy.devWallets || []).includes(wallet)
    if (!isDev && await hasMinted(wallet)) {
      return NextResponse.json({ error: 'Wallet already minted' }, { status: 409 })
    }

    const walletData = walletVisions.get(wallet) || { count: 0, sessions: [], batchStartedAt: null }

    // Cooldown: reset batch if cooldown has expired (or dev wallet)
    const maxSelfies = gameConfig.economy.maxSelfies || 3
    const cooldownMs = (gameConfig.economy.selfieCooldownHours || 3) * 60 * 60 * 1000
    const now = Date.now()
    if (walletData.count >= maxSelfies) {
      if (isDev) {
        // Dev wallets auto-reset on each batch completion
        walletData.count = 0
        walletData.sessions = []
        walletData.batchStartedAt = null
      } else if (walletData.batchStartedAt) {
        const elapsed = now - walletData.batchStartedAt
        if (elapsed >= cooldownMs) {
          walletData.count = 0
          walletData.sessions = []
          walletData.batchStartedAt = null
        }
      }
    }

    if (walletData.count >= maxSelfies) {
      const remaining = cooldownMs - (now - walletData.batchStartedAt)
      const hours = Math.ceil(remaining / (60 * 60 * 1000))
      return NextResponse.json({
        error: `Cooldown active — try again in ~${hours}h`,
        cooldownEndsAt: walletData.batchStartedAt + cooldownMs,
      }, { status: 429 })
    }

    // Payment check uses server-side count (not client-sent visionNumber)
    const nextSelfieNumber = walletData.count + 1
    if (nextSelfieNumber > gameConfig.economy.maxFreeVisions) {
      if (gameConfig.fiatEnabled && paymentIntentId) {
        // Inline Stripe Elements payment (disabled for hackathon)
        const stripe = getStripe()
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
        if (pi.status !== 'succeeded') {
          return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
        }
        if (pi.metadata?.wallet !== wallet || pi.metadata?.type !== 'vision') {
          return NextResponse.json({ error: 'Payment metadata mismatch' }, { status: 403 })
        }
      } else if (gameConfig.fiatEnabled && stripeSessionId) {
        // Fiat payment via Stripe Checkout session (disabled for hackathon)
        const stripe = getStripe()
        const stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId)
        if (stripeSession.payment_status !== 'paid') {
          return NextResponse.json({ error: 'Fiat payment not completed' }, { status: 402 })
        }
        if (stripeSession.metadata?.wallet !== wallet) {
          return NextResponse.json({ error: 'Wallet mismatch in payment' }, { status: 403 })
        }
      } else if (txSig) {
        // Crypto payment — verify on-chain SOL transfer
        const rpcUrl = gameConfig.economy.rpcUrl
        const treasuryPubkey = gameConfig.economy.treasury
        await verifyPayment(txSig, wallet, rpcUrl, treasuryPubkey)
      } else {
        return NextResponse.json({ error: 'Payment required for 3rd selfie' }, { status: 402 })
      }
    }

    // Derive seed — use payment proof + wallet for entropy
    const entropy = txSig || paymentIntentId || stripeSessionId || `${wallet}-${visionNumber}-${Date.now()}`
    const seed = deriveSeed(entropy, String(Date.now()), wallet, process.env.SERVER_SALT || 'graveyard')
    const outcome = seedToOutcome(seed, gameConfig)

    // Aura persists within a page session — carry from last session if provided
    // On page refresh, client has no lastSessionId → fresh aura
    if (lastSessionId) {
      const lastSession = sessions.get(lastSessionId)
      if (lastSession && lastSession.wallet === wallet) {
        outcome.aura = lastSession.outcome.aura
      }
    }

    const sessionId = crypto.randomUUID()

    // Track per-wallet — start cooldown timer on first selfie of batch
    if (walletData.count === 0) {
      walletData.batchStartedAt = now
    }
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
      visionsRemaining: maxSelfies - walletData.count,
    })
  } catch (err) {
    console.error('Vision error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

