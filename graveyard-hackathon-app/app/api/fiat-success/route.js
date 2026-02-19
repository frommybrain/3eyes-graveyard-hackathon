import { NextResponse } from 'next/server'
import { getStripe } from '../../lib/stripe'
import { pendingFiatSessions } from '../fiat-checkout/route'

// Verify a completed Stripe Checkout session and return the session data
// Called by the client after returning from Stripe Checkout success URL
export async function POST(request) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    const { wallet, visionNumber, type } = session.metadata || {}

    if (type !== 'vision') {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    }

    // Clean up pending session
    pendingFiatSessions.delete(sessionId)

    return NextResponse.json({
      ok: true,
      wallet,
      visionNumber: parseInt(visionNumber, 10),
      stripeSessionId: sessionId,
    })
  } catch (err) {
    console.error('Fiat success verification error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
