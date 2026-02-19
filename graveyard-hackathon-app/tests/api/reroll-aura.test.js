import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequest, parseResponse, TEST_WALLETS } from '../helpers'

const mockPaymentIntentsRetrieve = vi.fn()

vi.mock('../../app/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: mockPaymentIntentsRetrieve,
    },
  }),
}))

vi.mock('../../app/lib/verifyPayment', () => ({
  verifyPayment: vi.fn().mockResolvedValue({ blockhash: 'mock_blockhash' }),
}))

describe('POST /api/reroll-aura', () => {
  let POST, usedPaymentProofs
  // We also need access to sessions from the vision route to set up test state
  let sessions

  beforeEach(async () => {
    vi.resetModules()
    mockPaymentIntentsRetrieve.mockReset()

    const visionMod = await import('../../app/api/vision/route')
    sessions = visionMod.sessions
    sessions.clear()

    const mod = await import('../../app/api/reroll-aura/route')
    POST = mod.POST
    usedPaymentProofs = mod.usedPaymentProofs
    usedPaymentProofs.clear()
  })

  function createSession(overrides = {}) {
    const sessionId = 'sess_test_' + Math.random().toString(36).slice(2)
    const session = {
      sessionId,
      seed: 'abc123',
      wallet: TEST_WALLETS.user1,
      visionNumber: 1,
      outcome: {
        spot: { id: 'grave_gate', name: 'Grave Gate' },
        preset: { id: 'ashen_dusk', name: 'Ashen Dusk' },
        pose: { id: 'prophet_point', name: 'Prophet Point' },
        aura: { id: 'faded', name: 'Faded', tier: 1, weight: 65, color: '#888888' },
      },
      minted: false,
      createdAt: Date.now(),
      ...overrides,
    }
    sessions.set(sessionId, session)
    return session
  }

  it('returns 400 if sessionId is missing', async () => {
    const req = createRequest({ wallet: TEST_WALLETS.user1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/required/i)
  })

  it('returns 400 if wallet is missing', async () => {
    const req = createRequest({ sessionId: 'sess_123' })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(400)
    expect(json.error).toMatch(/required/i)
  })

  it('returns 404 if session does not exist', async () => {
    const req = createRequest({ sessionId: 'nonexistent', wallet: TEST_WALLETS.user1 })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(404)
    expect(json.error).toMatch(/not found/i)
  })

  it('returns 403 if wallet does not match session', async () => {
    const session = createSession({ wallet: TEST_WALLETS.user1 })
    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user2,
      txSig: 'tx_123',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/wallet/i)
  })

  it('returns 409 if session is already minted', async () => {
    const session = createSession({ minted: true })
    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_123',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(409)
    expect(json.error).toMatch(/minted/i)
  })

  it('returns 402 if no payment proof provided', async () => {
    const session = createSession()
    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/payment/i)
  })

  it('re-rolls aura with valid txSig', async () => {
    const session = createSession()
    const originalAura = session.outcome.aura

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'valid_tx_sig_reroll',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.aura).toBeDefined()
    expect(json.aura.id).toBeDefined()
    expect(json.rerollCount).toBe(1)
  })

  it('re-rolls aura with valid paymentIntentId', async () => {
    const session = createSession()

    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user1, type: 'reroll' },
    })

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      paymentIntentId: 'pi_reroll_valid',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.aura).toBeDefined()
    expect(json.rerollCount).toBe(1)
  })

  it('returns 402 if PaymentIntent is not succeeded', async () => {
    const session = createSession()

    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'requires_payment_method',
      metadata: { wallet: TEST_WALLETS.user1, type: 'reroll' },
    })

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      paymentIntentId: 'pi_pending',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(402)
    expect(json.error).toMatch(/not completed/i)
  })

  it('returns 403 if PaymentIntent metadata wallet mismatches', async () => {
    const session = createSession()

    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user2, type: 'reroll' },
    })

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      paymentIntentId: 'pi_wrong_wallet',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/metadata/i)
  })

  it('returns 403 if PaymentIntent metadata type is not reroll', async () => {
    const session = createSession()

    mockPaymentIntentsRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: { wallet: TEST_WALLETS.user1, type: 'vision' },
    })

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      paymentIntentId: 'pi_wrong_type',
    })
    const { status, json } = await parseResponse(await POST(req))
    expect(status).toBe(403)
    expect(json.error).toMatch(/metadata/i)
  })

  it('preserves spot/preset/pose and only changes aura', async () => {
    const session = createSession()
    const originalSpot = session.outcome.spot
    const originalPreset = session.outcome.preset
    const originalPose = session.outcome.pose

    const req = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_preserve_check',
    })
    await parseResponse(await POST(req))

    // Verify spot/preset/pose unchanged
    const updated = sessions.get(session.sessionId)
    expect(updated.outcome.spot).toEqual(originalSpot)
    expect(updated.outcome.preset).toEqual(originalPreset)
    expect(updated.outcome.pose).toEqual(originalPose)
    // Aura should be defined (may or may not be different due to randomness)
    expect(updated.outcome.aura).toBeDefined()
    expect(updated.outcome.aura.id).toBeDefined()
  })

  it('increments rerollCount on each re-roll', async () => {
    const session = createSession()

    // First re-roll
    const req1 = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_reroll_1',
    })
    const res1 = await parseResponse(await POST(req1))
    expect(res1.json.rerollCount).toBe(1)

    // Second re-roll
    const req2 = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_reroll_2',
    })
    const res2 = await parseResponse(await POST(req2))
    expect(res2.json.rerollCount).toBe(2)
  })

  it('prevents replay of the same payment proof', async () => {
    const session = createSession()

    const req1 = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_replay_test',
    })
    const res1 = await parseResponse(await POST(req1))
    expect(res1.status).toBe(200)

    // Same txSig should be rejected
    const req2 = createRequest({
      sessionId: session.sessionId,
      wallet: TEST_WALLETS.user1,
      txSig: 'tx_replay_test',
    })
    const res2 = await parseResponse(await POST(req2))
    expect(res2.status).toBe(409)
    expect(res2.json.error).toMatch(/already used/i)
  })
})
