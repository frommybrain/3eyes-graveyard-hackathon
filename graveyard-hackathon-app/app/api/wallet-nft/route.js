import { NextResponse } from 'next/server'
import { getWalletNft } from '../../lib/onchain'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
  }

  try {
    const nft = await getWalletNft(wallet)
    return NextResponse.json({ nft })
  } catch (err) {
    // DAS not available — return null gracefully
    return NextResponse.json({ nft: null })
  }
}
