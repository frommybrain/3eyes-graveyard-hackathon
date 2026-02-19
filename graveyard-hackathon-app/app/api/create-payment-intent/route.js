import { NextResponse } from 'next/server'
import { getStripe } from '../../lib/stripe'
import { gameConfig } from '../../config/gameConfig'

export async function POST(request) {
  try {
    const { wallet, type } = await request.json()

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    }
    if (!['vision', 'reroll'].includes(type)) {
      return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 })
    }

    const stripe = getStripe()

    let amountPence, description
    if (type === 'vision') {
      amountPence = Math.round(gameConfig.fiatPricing.visionPriceGBP * 100)
      description = '3EYES Final Vision'
    } else {
      amountPence = Math.round(gameConfig.fiatPricing.auraRerollPriceGBP * 100)
      description = '3EYES Aura Re-roll'
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPence,
      currency: gameConfig.fiatPricing.currency,
      metadata: { wallet, type },
      description,
      automatic_payment_methods: { enabled: true },
    })

    return NextResponse.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (err) {
    console.error('Create payment intent error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
