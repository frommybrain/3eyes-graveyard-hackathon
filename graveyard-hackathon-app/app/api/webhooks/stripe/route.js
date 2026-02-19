import { NextResponse } from 'next/server'
import { getStripe } from '../../../lib/stripe'
import { printOrders } from '../../print-order/route'

// Stripe webhook endpoint — handles payment events for vision purchases and print orders
export async function POST(request) {
  const stripe = getStripe()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set — skipping webhook verification')
    return NextResponse.json({ received: true })
  }

  let event
  try {
    const body = await request.text()
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const { type, wallet, mintAddress, sessionId } = session.metadata || {}

      if (type === 'print') {
        const shipping = session.shipping_details || session.customer_details
        const order = {
          wallet,
          mintAddress,
          sessionId,
          stripeSessionId: session.id,
          shippingName: shipping?.name,
          shippingAddress: shipping?.address,
          email: session.customer_details?.email,
          amountPaid: session.amount_total,
          currency: session.currency,
          createdAt: Date.now(),
          status: 'pending',
        }
        printOrders.set(session.id, order)
        console.log('[Stripe] Print order received:', order)
      }

      if (type === 'vision') {
        console.log('[Stripe] Vision payment confirmed:', { wallet, sessionId: session.id })
      }
      break
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object
      const { type, wallet } = pi.metadata || {}
      if (type === 'vision') {
        console.log('[Stripe] Vision PaymentIntent succeeded:', { wallet, id: pi.id })
      }
      if (type === 'reroll') {
        console.log('[Stripe] Reroll PaymentIntent succeeded:', { wallet, id: pi.id })
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
