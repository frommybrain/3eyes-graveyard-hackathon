import { NextResponse } from 'next/server'
import { sessions, mintedWallets } from '../vision/route'

const TOTAL_SUPPLY = 666
let mintCount = 0

export async function POST(request) {
  try {
    const formData = await request.formData()
    const sessionId = formData.get('sessionId')
    const wallet = formData.get('wallet')
    const imageBlob = formData.get('image')

    if (!sessionId || !wallet || !imageBlob) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (mintCount >= TOTAL_SUPPLY) {
      return NextResponse.json({ error: 'All 666 have been claimed' }, { status: 410 })
    }

    if (mintedWallets.has(wallet)) {
      return NextResponse.json({ error: 'Wallet already minted' }, { status: 409 })
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.wallet !== wallet) {
      return NextResponse.json({ error: 'Session wallet mismatch' }, { status: 403 })
    }
    if (session.minted) {
      return NextResponse.json({ error: 'Already minted' }, { status: 409 })
    }

    // TODO: Implement Irys upload + Metaplex Core minting
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())

    session.minted = true
    mintedWallets.add(wallet)
    mintCount += 1

    return NextResponse.json({
      ok: true,
      mint: 'PLACEHOLDER_MINT_ADDRESS',
      mintNumber: mintCount,
      totalSupply: TOTAL_SUPPLY,
      aura: session.outcome.aura,
    })
  } catch (err) {
    console.error('Mint error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
