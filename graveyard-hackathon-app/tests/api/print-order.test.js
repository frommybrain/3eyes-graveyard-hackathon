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

describe('POST /api/print-order', () => {
  let POST

  beforeEach(async () => {
    vi.resetModules()
    mockSessionCreate.mockReset()
    const mod = await import('../../app/api/print-order/route')
    POST = mod.POST
  })

  it('returns 400 if wallet is missing', async () => {
    const req = createRequest({})
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/wallet/i)
  })

  it('creates a Stripe Checkout session with shipping address collection', async () => {
    mockSessionCreate.mockResolvedValue({
      id: 'cs_print_123',
      url: 'https://checkout.stripe.com/pay/cs_print_123',
    })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      mintAddress: 'FAKE_MINT_ADDRESS',
      sessionId: 'sess_123',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.checkoutUrl).toContain('checkout.stripe.com')
  })

  it('includes shipping_address_collection with GB', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs', url: 'https://stripe.com' })

    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    expect(args.shipping_address_collection).toBeDefined()
    expect(args.shipping_address_collection.allowed_countries).toContain('GB')
  })

  it('sets metadata with wallet and mint address', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs', url: 'https://stripe.com' })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      mintAddress: 'MINT_ABC',
      sessionId: 'sess_456',
    })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    expect(args.metadata.wallet).toBe(TEST_WALLETS.user1)
    expect(args.metadata.mintAddress).toBe('MINT_ABC')
    expect(args.metadata.type).toBe('print')
  })

  it('uses £0 price for free prints (default config)', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs', url: 'https://stripe.com' })

    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    const lineItem = args.line_items[0]
    expect(lineItem.price_data.unit_amount).toBe(0)
    expect(lineItem.price_data.currency).toBe('gbp')
  })

  it('includes success and cancel URLs', async () => {
    mockSessionCreate.mockResolvedValue({ id: 'cs', url: 'https://stripe.com' })

    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    await POST(req)

    const args = mockSessionCreate.mock.calls[0][0]
    expect(args.success_url).toContain('print_ordered=1')
    expect(args.cancel_url).toContain('print_cancelled=1')
  })

  it('returns 500 if Stripe fails', async () => {
    mockSessionCreate.mockRejectedValue(new Error('Stripe error'))

    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    const { status } = await parseResponse(await POST(req))
    expect(status).toBe(500)
  })
})
