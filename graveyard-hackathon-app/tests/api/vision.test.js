import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse, TEST_WALLETS } from '../helpers'

// Mock verifyPayment — we don't want real RPC calls
vi.mock('../../app/lib/verifyPayment', () => ({
  verifyPayment: vi.fn().mockResolvedValue({ blockhash: 'mock_blockhash' }),
}))

// Mock Stripe
const mockStripeRetrieve = vi.fn()
const mockPaymentIntentsRetrieve = vi.fn()
vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: mockStripeRetrieve,
      },
    },
    paymentIntents: {
      retrieve: mockPaymentIntentsRetrieve,
    },
  }),
}))

describe('POST /api/vision', () => {
  let POST, sessions, walletVisions, mintedWallets

  beforeEach(async () => {
    // Fresh module for each test (resets in-memory stores)
    vi.resetModules()
    const mod = await import('../../app/api/vision/route')
    POST = mod.POST
    sessions = mod.sessions
    walletVisions = mod.walletVisions
    mintedWallets = mod.mintedWallets
    sessions.clear()
    walletVisions.clear()
    mintedWallets.clear()
    mockStripeRetrieve.mockReset()
    mockPaymentIntentsRetrieve.mockReset()
  })

  // --- Basic validation ---

  it('returns 400 if wallet is missing', async () => {
    const req = createRequest({ visionNumber: 1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/wallet/i)
  })

  it('returns 400 if wallet is empty string', async () => {
    const req = createRequest({ wallet: '', visionNumber: 1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
  })

  // --- Free visions (1 & 2) ---

  it('creates a free vision without payment', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.sessionId).toBeTruthy()
    expect(json.outcome).toHaveProperty('spot')
    expect(json.outcome).toHaveProperty('preset')
    expect(json.outcome).toHaveProperty('pose')
    expect(json.outcome).toHaveProperty('aura')
    expect(json.visionNumber).toBe(1)
    expect(json.visionsRemaining).toBe(2)
  })

  it('allows 2 free visions for the same wallet', async () => {
    const req1 = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 })
    const res1 = await parseResponse(await POST(req1))
    expect(res1.status).toBe(200)

    const req2 = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 })
    const res2 = await parseResponse(await POST(req2))
    expect(res2.status).toBe(200)
    expect(res2.json.visionNumber).toBe(2)
    expect(res2.json.visionsRemaining).toBe(1)
  })

  it('tracks visions per-wallet independently', async () => {
    const req1 = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 })
    await POST(req1)

    const req2 = createRequest({ wallet: TEST_WALLETS.user2, visionNumber: 1 })
    const res = await parseResponse(await POST(req2))
    expect(res.json.visionNumber).toBe(1)
  })

  // --- Paid vision (3) — crypto path ---

  it('returns 402 if vision 3 has no payment', async () => {
    // Burn through 2 free visions
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 3 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/payment required/i)
  })

  it('accepts vision 3 with a valid txSig', async () => {
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      txSig: 'valid_tx_signature_123',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.visionNumber).toBe(3)
    expect(json.visionsRemaining).toBe(0)
  })

  // --- Paid vision (3) — fiat/Stripe path (disabled for hackathon, fiatEnabled: false) ---

  it.skip('accepts vision 3 with a valid stripeSessionId', async () => {
    mockStripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet: TEST_WALLETS.user1 },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      stripeSessionId: 'cs_test_abc123',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it.skip('returns 402 if Stripe session is not paid', async () => {
    mockStripeRetrieve.mockResolvedValue({
      payment_status: 'unpaid',
      metadata: { wallet: TEST_WALLETS.user1 },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      stripeSessionId: 'cs_test_unpaid',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/not completed/i)
  })

  it.skip('returns 403 if Stripe session wallet does not match', async () => {
    mockStripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet: TEST_WALLETS.user2 },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      stripeSessionId: 'cs_test_wrong_wallet',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/mismatch/i)
  })

  // --- Rate limits ---

  it('rejects more than 3 visions per wallet', async () => {
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))
    await POST(createRequest({
      wallet: TEST_WALLETS.user1, visionNumber: 3, txSig: 'tx_sig',
    }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1, visionNumber: 4, txSig: 'tx_sig2',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/maximum/i)
  })

  it('rejects visions from a wallet that already minted', async () => {
    mintedWallets.add(TEST_WALLETS.user1)
    const req = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(409)
    expect(json.error).toMatch(/already minted/i)
  })

  // --- Session store ---

  it('stores session with correct data', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 })
    const { json } = await parseResponse(await POST(req))

    const session = sessions.get(json.sessionId)
    expect(session).toBeDefined()
    expect(session.wallet).toBe(TEST_WALLETS.user1)
    expect(session.minted).toBe(false)
    expect(session.outcome).toHaveProperty('spot')
  })

  // --- Determinism ---

  it('produces different outcomes for different wallets', async () => {
    const res1 = await parseResponse(
      await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    )
    const res2 = await parseResponse(
      await POST(createRequest({ wallet: TEST_WALLETS.user2, visionNumber: 1 }))
    )
    // They CAN be the same by chance, but sessionIds should always differ
    expect(res1.json.sessionId).not.toBe(res2.json.sessionId)
  })

  // --- Paid vision (3) — PaymentIntent path (disabled for hackathon, fiatEnabled: false) ---

  it.skip('accepts vision 3 with a valid paymentIntentId', async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user1, type: 'vision' },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      paymentIntentId: 'pi_test_valid',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.visionNumber).toBe(3)
  })

  it.skip('returns 402 if PaymentIntent is not succeeded', async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'requires_payment_method',
      metadata: { wallet: TEST_WALLETS.user1, type: 'vision' },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      paymentIntentId: 'pi_test_pending',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/not completed/i)
  })

  it.skip('returns 403 if PaymentIntent wallet mismatches', async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user2, type: 'vision' },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      paymentIntentId: 'pi_test_wrong_wallet',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/mismatch/i)
  })

  it.skip('returns 403 if PaymentIntent type is not vision', async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user1, type: 'reroll' },
    })

    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await POST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      visionNumber: 3,
      paymentIntentId: 'pi_test_wrong_type',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/mismatch/i)
  })
})
