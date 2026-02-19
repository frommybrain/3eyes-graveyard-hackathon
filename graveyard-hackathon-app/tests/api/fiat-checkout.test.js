import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse, TEST_WALLETS } from '../helpers'

const mockSessionCreate = vi.fn()

vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
  }),
}))

describe('POST /api/fiat-checkout', () => {
  let POST

  beforeEach(async () => {
    vi.resetModules()
    mockSessionCreate.mockReset()
    const mod = await import('../../app/api/fiat-checkout/route')
    POST = mod.POST
  })

  it('returns 400 if wallet is missing', async () => {
    const req = createRequest({ visionNumber: 3, type: 'vision' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/wallet/i)
  })

  it('returns 400 if type is not vision', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 3, type: 'invalid' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/type/i)
  })

  it('creates a Stripe Checkout session and returns URL', async () => {
    mockSessionCreate.mockResolvedValue({
      id: 'cs_test_session_123',
      url: 'https://checkout.stripe.com/pay/cs_test_session_123',
    })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      type: 'vision',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.checkoutUrl).toContain('checkout.stripe.com')
  })

  it('passes correct metadata to Stripe', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs_test', url: 'https://stripe.com' })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      type: 'vision',
    })
    await POST(req)

    expect(mockSessionCreate).toHaveBeenCalledOnce()
    const args = mockSessionCreate.mock.calls[0][0]
    expect(args.metadata.wallet).toBe(TEST_WALLETS.user1)
    expect(args.metadata.visionNumber).toBe('3')
    expect(args.metadata.type).toBe('vision')
  })

  it('sets price to configured GBP amount in pence', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs_test', url: 'https://stripe.com' })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      type: 'vision',
    })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    const lineItem = args.line_items[0]
    expect(lineItem.price_data.currency).toBe('gbp')
    // Default price is £5 = 500 pence
    expect(lineItem.price_data.unit_amount).toBe(500)
  })

  it('includes success and cancel URLs with correct patterns', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs_test', url: 'https://stripe.com' })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      type: 'vision',
    })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    expect(args.success_url).toContain('fiat_session=')
    expect(args.cancel_url).toContain('fiat_cancelled=1')
  })

  it('returns 500 if Stripe session creation fails', async () => {
    mockSessionCreate.mockRejectedValue(new Error('Stripe API error'))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      type: 'vision',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(500)
    expect(json.error).toMatch(/stripe/i)
  })
})
