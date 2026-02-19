import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse } from '../helpers'

const mockRetrieve = vi.fn()

vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: mockRetrieve,
      },
    },
  }),
}))

// Mock pendingFiatSessions
vi.mock('../../app/api/fiat-checkout/route', () => ({
  pendingFiatSessions: new Map(),
}))

describe('POST /api/fiat-success', () => {
  let POST

  beforeEach(async () => {
    vi.resetModules()
    mockRetrieve.mockReset()
    const mod = await import('../../app/api/fiat-success/route')
    POST = mod.POST
  })

  it('returns 400 if sessionId is missing', async () => {
    const req = createRequest({})
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/sessionId/i)
  })

  it('returns 402 if payment is not completed', async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: 'unpaid',
      metadata: { wallet: 'test_wallet', visionNumber: '3', type: 'vision' },
    })

    const req = createRequest({ sessionId: 'cs_test_unpaid' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/not completed/i)
  })

  it('returns 400 if session type is not vision', async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet: 'test_wallet', visionNumber: '3', type: 'print' },
    })

    const req = createRequest({ sessionId: 'cs_test_wrong_type' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/type/i)
  })

  it('returns wallet and visionNumber on successful verification', async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet: 'test_wallet_abc', visionNumber: '3', type: 'vision' },
    })

    const req = createRequest({ sessionId: 'cs_test_paid' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.wallet).toBe('test_wallet_abc')
    expect(json.visionNumber).toBe(3)
    expect(json.stripeSessionId).toBe('cs_test_paid')
  })

  it('returns 500 if Stripe API fails', async () => {
    mockRetrieve.mockRejectedValue(new Error('Network error'))

    const req = createRequest({ sessionId: 'cs_test_error' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(500)
  })
})
