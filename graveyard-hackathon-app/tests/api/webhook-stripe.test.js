import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseResponse } from '../helpers'

const mockConstructEvent = vi.fn()

vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}))

vi.mock('../../app/api/print-order/route', () => ({
  printOrders: new Map(),
}))

describe('POST /api/webhooks/stripe', () => {
  let POST

  beforeEach(async () => {
    vi.resetModules()
    mockConstructEvent.mockReset()

    // Set webhook secret
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123'

    const mod = await import('../../app/api/webhooks/stripe/route')
    POST = mod.POST
  })

  it('returns 400 if webhook signature is invalid', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const req = new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'invalid_sig' },
      body: '{}',
    })

    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/signature/i)
  })

  it('handles checkout.session.completed for print orders', async () => {
    const { printOrders } = await import('../../app/api/print-order/route')

    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_print_completed',
          metadata: {
            type: 'print',
            wallet: 'test_wallet',
            mintAddress: 'MINT_123',
            sessionId: 'sess_456',
          },
          shipping_details: {
            name: 'Test User',
            address: {
              line1: '123 Test St',
              city: 'London',
              country: 'GB',
              postal_code: 'SW1A 1AA',
            },
          },
          customer_details: { email: 'test@example.com' },
          amount_total: 0,
          currency: 'gbp',
        },
      },
    })

    const req = new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify({}),
    })

    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.received).toBe(true)

    // Verify print order was stored
    const order = printOrders.get('cs_print_completed')
    expect(order).toBeDefined()
    expect(order.wallet).toBe('test_wallet')
    expect(order.shippingName).toBe('Test User')
    expect(order.email).toBe('test@example.com')
    expect(order.status).toBe('pending')
  })

  it('handles checkout.session.completed for vision payments', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_vision_completed',
          metadata: {
            type: 'vision',
            wallet: 'test_wallet',
          },
        },
      },
    })

    const req = new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid_sig' },
      body: '{}',
    })

    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.received).toBe(true)
  })

  it('handles unknown event types gracefully', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} },
    })

    const req = new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid_sig' },
      body: '{}',
    })

    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.received).toBe(true)
  })

  it('skips verification if STRIPE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET

    // Re-import to pick up missing env
    vi.resetModules()
    const mod = await import('../../app/api/webhooks/stripe/route')

    const req = new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })

    const { status, json } = await parseResponse(await mod.POST(req))
    expect(status).toBe(200)
    expect(json.received).toBe(true)

    // Restore for other tests
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123'
  })
})
