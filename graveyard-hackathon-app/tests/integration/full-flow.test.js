import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse, TEST_WALLETS } from '../helpers'

// Mock verifyPayment
vi.mock('../../app/lib/verifyPayment', () => ({
  verifyPayment: vi.fn().mockResolvedValue({ blockhash: 'mock_blockhash' }),
}))

// Mock Stripe for vision API (fiat path)
const mockStripeRetrieve = vi.fn()
const mockStripeSessionCreate = vi.fn()
vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: mockStripeRetrieve,
        create: mockStripeSessionCreate,
      },
    },
  }),
}))

describe('Integration: Full Web3 User Flow', () => {
  let visionPOST, sessions, walletVisions, mintedWallets

  beforeEach(async () => {
    vi.resetModules()
    const visionMod = await import('../../app/api/vision/route')
    visionPOST = visionMod.POST
    sessions = visionMod.sessions
    walletVisions = visionMod.walletVisions
    mintedWallets = visionMod.mintedWallets
    sessions.clear()
    walletVisions.clear()
    mintedWallets.clear()
  })

  it('completes full 3-vision flow with crypto payment', async () => {
    const wallet = TEST_WALLETS.user1

    // Vision 1 — free
    const res1 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 1 }))
    )
    expect(res1.status).toBe(200)
    expect(res1.json.visionNumber).toBe(1)
    expect(res1.json.visionsRemaining).toBe(2)
    expect(res1.json.outcome.spot).toBeDefined()
    expect(res1.json.outcome.aura).toBeDefined()

    // Vision 2 — free
    const res2 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 2 }))
    )
    expect(res2.status).toBe(200)
    expect(res2.json.visionNumber).toBe(2)
    expect(res2.json.visionsRemaining).toBe(1)

    // Vision 3 — paid with SOL
    const res3 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 3, txSig: 'real_tx_sig' }))
    )
    expect(res3.status).toBe(200)
    expect(res3.json.visionNumber).toBe(3)
    expect(res3.json.visionsRemaining).toBe(0)

    // All 3 sessions should exist
    expect(sessions.size).toBe(3)

    // 4th vision should fail
    const res4 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 4, txSig: 'another_tx' }))
    )
    expect(res4.status).toBe(400)
  })
})

// Fiat flow disabled for hackathon (fiatEnabled: false)
describe.skip('Integration: Full Fiat User Flow', () => {
  let visionPOST, sessions, walletVisions, mintedWallets

  beforeEach(async () => {
    vi.resetModules()
    mockStripeRetrieve.mockReset()
    const visionMod = await import('../../app/api/vision/route')
    visionPOST = visionMod.POST
    sessions = visionMod.sessions
    walletVisions = visionMod.walletVisions
    mintedWallets = visionMod.mintedWallets
    sessions.clear()
    walletVisions.clear()
    mintedWallets.clear()
  })

  it('completes full 3-vision flow with fiat payment', async () => {
    const wallet = TEST_WALLETS.user1

    // Vision 1 — free (same as web3)
    const res1 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 1 }))
    )
    expect(res1.status).toBe(200)

    // Vision 2 — free
    const res2 = await parseResponse(
      await visionPOST(createRequest({ wallet, visionNumber: 2 }))
    )
    expect(res2.status).toBe(200)

    // Vision 3 — paid with Stripe
    mockStripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet },
    })

    const res3 = await parseResponse(
      await visionPOST(createRequest({
        wallet,
        visionNumber: 3,
        stripeSessionId: 'cs_test_fiat_session',
      }))
    )
    expect(res3.status).toBe(200)
    expect(res3.json.visionNumber).toBe(3)
    expect(res3.json.visionsRemaining).toBe(0)
  })

  it('rejects fiat payment with wrong wallet in Stripe metadata', async () => {
    const wallet = TEST_WALLETS.user1

    await visionPOST(createRequest({ wallet, visionNumber: 1 }))
    await visionPOST(createRequest({ wallet, visionNumber: 2 }))

    // Stripe session has a different wallet
    mockStripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { wallet: TEST_WALLETS.user2 },
    })

    const res = await parseResponse(
      await visionPOST(createRequest({
        wallet,
        visionNumber: 3,
        stripeSessionId: 'cs_test_wrong_wallet',
      }))
    )
    expect(res.status).toBe(403)
  })
})

describe('Integration: Mixed User Isolation', () => {
  let visionPOST, sessions, walletVisions, mintedWallets

  beforeEach(async () => {
    vi.resetModules()
    mockStripeRetrieve.mockReset()
    const visionMod = await import('../../app/api/vision/route')
    visionPOST = visionMod.POST
    sessions = visionMod.sessions
    walletVisions = visionMod.walletVisions
    mintedWallets = visionMod.mintedWallets
    sessions.clear()
    walletVisions.clear()
    mintedWallets.clear()
  })

  it('two users do not interfere with each other', async () => {
    // User 1 takes 2 free visions
    await visionPOST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    await visionPOST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 2 }))

    // User 2 takes 2 free visions
    await visionPOST(createRequest({ wallet: TEST_WALLETS.user2, visionNumber: 1 }))
    await visionPOST(createRequest({ wallet: TEST_WALLETS.user2, visionNumber: 2 }))

    // User 1 pays with SOL
    const res1 = await parseResponse(
      await visionPOST(createRequest({
        wallet: TEST_WALLETS.user1,
        visionNumber: 3,
        txSig: 'crypto_tx_1',
      }))
    )
    expect(res1.status).toBe(200)

    // User 2 pays with SOL
    const res2 = await parseResponse(
      await visionPOST(createRequest({
        wallet: TEST_WALLETS.user2,
        visionNumber: 3,
        txSig: 'crypto_tx_2',
      }))
    )
    expect(res2.status).toBe(200)

    // Both should have 3 visions
    expect(walletVisions.get(TEST_WALLETS.user1).count).toBe(3)
    expect(walletVisions.get(TEST_WALLETS.user2).count).toBe(3)

    // Sessions should be independent
    expect(sessions.size).toBe(6)
  })

  it('minting one wallet does not block the other', async () => {
    mintedWallets.add(TEST_WALLETS.user1)

    // User 1 should be blocked
    const res1 = await parseResponse(
      await visionPOST(createRequest({ wallet: TEST_WALLETS.user1, visionNumber: 1 }))
    )
    expect(res1.status).toBe(409)

    // User 2 should still work
    const res2 = await parseResponse(
      await visionPOST(createRequest({ wallet: TEST_WALLETS.user2, visionNumber: 1 }))
    )
    expect(res2.status).toBe(200)
  })
})

describe('Integration: Print Order Flow', () => {
  let printPOST

  beforeEach(async () => {
    vi.resetModules()
    mockStripeSessionCreate.mockReset()
    const mod = await import('../../app/api/print-order/route')
    printPOST = mod.POST
  })

  it('creates print order after mint (£0 free)', async () => {
    mockStripeSessionCreate.mockResolvedValue({
      id: 'cs_print_free',
      url: 'https://checkout.stripe.com/pay/cs_print_free',
    })

    const req = createRequest({
      wallet: TEST_WALLETS.user1,
      mintAddress: 'MINT_PLACEHOLDER',
      sessionId: 'sess_abc',
    })
    const { status, json } = await parseResponse(await printPOST(req))
    expect(status).toBe(200)
    expect(json.checkoutUrl).toContain('stripe.com')

    // Verify it used £0 price
    const args = mockStripeSessionCreate.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(0)
    expect(args.shipping_address_collection).toBeDefined()
  })
})
