import { NextResponse } from 'next/server'
import { getStripe } from '../../lib/stripe'
import { gameConfig } from '../../config/gameConfig'

// In-memory print orders — replace with DB for production
export const printOrders = new Map()

export async function POST(request) {
  try {
    const { wallet, mintAddress, imageUrl, sessionId } = await request.json()

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    }

    const stripe = getStripe()
    const priceGBP = gameConfig.prints.priceGBP
    const origin = request.headers.get('origin') || 'http://localhost:3000'

    const sessionConfig = {
      mode: 'payment',
      payment_method_types: ['card'],
      shipping_address_collection: {
        allowed_countries: [
          'GB', 'US', 'CA', 'AU', 'NZ', 'IE', 'DE', 'FR', 'ES', 'IT',
          'NL', 'BE', 'AT', 'PT', 'SE', 'DK', 'NO', 'FI', 'JP', 'SG',
        ],
      },
      metadata: {
        wallet,
        mintAddress: mintAddress || '',
        sessionId: sessionId || '',
        type: 'print',
      },
      success_url: `${origin}/world?print_ordered=1`,
      cancel_url: `${origin}/world?print_cancelled=1`,
    }

    if (priceGBP > 0) {
      // Paid prints
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: '3EYES Pilgrim Physical Print',
              description: 'A physical print of your Pilgrim selfie NFT',
              ...(imageUrl ? { images: [imageUrl] } : {}),
            },
            unit_amount: priceGBP * 100,
          },
          quantity: 1,
        },
      ]
    } else {
      // Free prints — still use Stripe for address collection
      // Stripe requires at least one line item, so use a £0 item
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: '3EYES Pilgrim Physical Print (Free)',
              description: 'A free physical print of your Pilgrim selfie NFT',
            },
            unit_amount: 0,
          },
          quantity: 1,
        },
      ]
      // For £0, Stripe won't collect payment but will still collect address
      sessionConfig.payment_intent_data = { metadata: sessionConfig.metadata }
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionConfig)

    return NextResponse.json({ ok: true, checkoutUrl: checkoutSession.url })
  } catch (err) {
    console.error('Print order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
