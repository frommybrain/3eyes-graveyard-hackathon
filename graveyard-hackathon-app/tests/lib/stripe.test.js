import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Stripe as a constructor class
vi.mock('stripe', () => {
  const MockStripe = function () {
    this.checkout = { sessions: { create: vi.fn(), retrieve: vi.fn() } }
    this.webhooks = { constructEvent: vi.fn() }
  }
  return { default: MockStripe }
})

describe('getStripe', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a Stripe instance when STRIPE_SECRET_KEY is set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    const { getStripe } = await import('../../app/lib/stripe')
    const stripe = getStripe()
    expect(stripe).toBeDefined()
    expect(stripe.checkout).toBeDefined()
    expect(stripe.checkout.sessions).toBeDefined()
  })

  it('throws if STRIPE_SECRET_KEY is not set', async () => {
    const originalKey = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const { getStripe } = await import('../../app/lib/stripe')
    expect(() => getStripe()).toThrow('STRIPE_SECRET_KEY not set')
    process.env.STRIPE_SECRET_KEY = originalKey
  })

  it('returns the same instance on subsequent calls (singleton)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_singleton'
    const { getStripe } = await import('../../app/lib/stripe')
    const a = getStripe()
    const b = getStripe()
    expect(a).toBe(b)
  })
})
