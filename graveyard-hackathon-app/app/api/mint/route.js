import { NextResponse } from 'next/server'
import { sessions } from '../../lib/sessionStore'
import { getMintCount, incrementMintCount, hasMinted, addMintedWallet } from '../../lib/mintStore'
import { uploadFile, uploadJson, ipfsToHttp } from '../../lib/upload'
import { mintCoreAsset } from '../../lib/mintNft'
import { gameConfig } from '../../config/gameConfig'

const TOTAL_SUPPLY = 666

export async function POST(request) {
  try {
    const formData = await request.formData()
    const sessionId = formData.get('sessionId')
    const wallet = formData.get('wallet')
    const imageBlob = formData.get('image')

    if (!sessionId || !wallet || !imageBlob) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const isDev = (gameConfig.economy.devWallets || []).includes(wallet)

    // Persistent checks (Upstash Redis on Vercel, file fallback locally)
    if (!isDev && await hasMinted(wallet)) {
      return NextResponse.json({ error: 'Wallet already minted' }, { status: 409 })
    }

    const mintNumber = (await getMintCount()) + 1
    if (mintNumber > TOTAL_SUPPLY) {
      return NextResponse.json({ error: 'All 666 have been claimed' }, { status: 410 })
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.wallet !== wallet) {
      return NextResponse.json({ error: 'Session wallet mismatch' }, { status: 403 })
    }
    if (!isDev && session.minted) {
      return NextResponse.json({ error: 'Already minted' }, { status: 409 })
    }

    const { outcome } = session
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())

    // 1. Upload image to Pinata IPFS
    const imageUri = await uploadFile(imageBuffer, `3eyes-selfie-${mintNumber}.png`, 'image/png')

    // 2. Build and upload metadata
    const metadata = {
      name: `3eyes Selfie #${mintNumber}`,
      description: "POV. You're in 3eyes world.",
      image: imageUri,
      external_url: 'https://selfie.3eyes.world',
      attributes: [
        { trait_type: 'Spot', value: outcome.spot?.name || 'Unknown' },
        { trait_type: 'Spot Rarity', value: outcome.spot?.rarity || 'Common' },
        { trait_type: 'Atmosphere', value: outcome.preset?.name || 'Unknown' },
        { trait_type: 'Pose', value: outcome.pose?.name || 'Unknown' },
        { trait_type: 'Aura', value: outcome.aura?.name || 'Unknown' },
        { trait_type: 'Aura Tier', value: String(outcome.aura?.tier || 1) },
      ],
    }
    const metadataUri = await uploadJson(metadata, `3eyes-selfie-${mintNumber}-metadata`)

    // 3. Mint Metaplex Core asset to user's wallet
    const { assetPublicKey, signature } = await mintCoreAsset({
      metadataUri,
      name: `3eyes Selfie #${mintNumber}`,
      ownerAddress: wallet,
    })

    session.minted = true
    await addMintedWallet(wallet)
    await incrementMintCount()

    return NextResponse.json({
      ok: true,
      mint: assetPublicKey,
      mintNumber,
      totalSupply: TOTAL_SUPPLY,
      aura: outcome.aura,
      imageUrl: ipfsToHttp(imageUri),
      signature,
    })
  } catch (err) {
    console.error('Mint error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
