import { NextResponse } from 'next/server'
import { getStripe } from '../../lib/stripe'
import { gameConfig } from '../../config/gameConfig'

// Pending fiat sessions — maps Stripe session ID → { wallet, visionNumber }
// Exported so fiat-success can look them up
export const pendingFiatSessions = new Map()

export async function POST(request) {
  try {
    const { wallet, visionNumber, type } = await request.json()

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    }
    if (type !== 'vision') {
      return NextResponse.json({ error: 'Invalid checkout type' }, { status: 400 })
    }

    const stripe = getStripe()
    const priceGBP = gameConfig.fiatPricing.visionPriceGBP

    // Determine base URL for redirects
    const origin = request.headers.get('origin') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: '3EYES Final Vision',
              description: 'Unlock the third and final selfie vision',
            },
            unit_amount: priceGBP * 100, // Stripe expects pence
          },
          quantity: 1,
        },
      ],
      metadata: {
        wallet,
        visionNumber: String(visionNumber),
        type: 'vision',
      },
      success_url: `${origin}/world?fiat_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/world?fiat_cancelled=1`,
    })

    // Track pending session
    pendingFiatSessions.set(session.id, { wallet, visionNumber })

    return NextResponse.json({ ok: true, checkoutUrl: session.url })
  } catch (err) {
    console.error('Fiat checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
