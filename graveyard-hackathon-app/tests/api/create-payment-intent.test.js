import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse, TEST_WALLETS } from '../helpers'

const mockPaymentIntentsCreate = vi.fn()

vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
    },
  }),
}))

describe('POST /api/create-payment-intent', () => {
  let POST

  beforeEach(async () => {
    vi.resetModules()
    mockPaymentIntentsCreate.mockReset()
    const mod = await import('../../app/api/create-payment-intent/route')
    POST = mod.POST
  })

  it('returns 400 if wallet is missing', async () => {
    const req = createRequest({ type: 'vision' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/wallet/i)
  })

  it('returns 400 if type is missing', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/type/i)
  })

  it('returns 400 if type is invalid', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1, type: 'invalid' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/type/i)
  })

  it('creates a PaymentIntent for vision type with correct amount', async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_vision_123',
      client_secret: 'pi_vision_123_secret_abc',
    })

    const req = createRequest({ wallet: TEST_WALLETS.user1, type: 'vision' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.clientSecret).toBe('pi_vision_123_secret_abc')
    expect(json.paymentIntentId).toBe('pi_vision_123')

    const args = mockPaymentIntentsCreate.mock.calls[0][0]
    expect(args.amount).toBe(500) // £5.00 = 500 pence
    expect(args.currency).toBe('gbp')
    expect(args.metadata.wallet).toBe(TEST_WALLETS.user1)
    expect(args.metadata.type).toBe('vision')
  })

  it('creates a PaymentIntent for reroll type with correct amount', async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_reroll_456',
      client_secret: 'pi_reroll_456_secret_def',
    })

    const req = createRequest({ wallet: TEST_WALLETS.user1, type: 'reroll' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.paymentIntentId).toBe('pi_reroll_456')

    const args = mockPaymentIntentsCreate.mock.calls[0][0]
    expect(args.amount).toBe(250) // £2.50 = 250 pence
    expect(args.metadata.type).toBe('reroll')
  })

  it('returns 500 if Stripe fails', async () => {
    mockPaymentIntentsCreate.mockRejectedValue(new Error('Stripe error'))

    const req = createRequest({ wallet: TEST_WALLETS.user1, type: 'vision' })
    const { status } = await parseResponse(await POST(req))
    expect(status).toBe(500)
  })
})
