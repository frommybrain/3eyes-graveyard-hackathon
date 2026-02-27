/**
 * On-chain queries using the DAS (Digital Asset Standard) API.
 * Works with DAS-compatible RPCs (Helius, Triton, etc.)
 * Falls back gracefully if DAS is not supported.
 */

import { Keypair } from '@solana/web3.js'

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
}

let _authorityAddress = null

function getAuthorityAddress() {
  if (_authorityAddress) return _authorityAddress
  const walletJson = process.env.DEPLOY_WALLET_JSON
  if (!walletJson) throw new Error('DEPLOY_WALLET_JSON not set')
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(walletJson)))
  _authorityAddress = kp.publicKey.toBase58()
  return _authorityAddress
}

async function dasCall(method, params) {
  const res = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'DAS call failed')
  return data.result
}

/**
 * Get total number of NFTs minted by our authority (on-chain).
 */
export async function getOnChainMintCount() {
  const authority = getAuthorityAddress()
  const result = await dasCall('getAssetsByAuthority', {
    authorityAddress: authority,
    page: 1,
    limit: 1,
  })
  return result.total
}

/**
 * Check if a wallet already owns an NFT from our collection.
 */
export async function hasWalletMinted(walletAddress) {
  const nft = await getWalletNft(walletAddress)
  return !!nft
}

/**
 * Get the NFT data for a wallet (if they own one from our collection).
 * Returns { mint, name, imageUrl, uri } or null.
 */
export async function getWalletNft(walletAddress) {
  const authority = getAuthorityAddress()
  const result = await dasCall('getAssetsByOwner', {
    ownerAddress: walletAddress,
    page: 1,
    limit: 100,
  })
  const nft = result.items?.find(item =>
    item.authorities?.some(a => a.address === authority)
  )
  if (!nft) return null
  return {
    mint: nft.id,
    name: nft.content?.metadata?.name,
    imageUrl: nft.content?.links?.image,
    uri: nft.content?.json_uri,
  }
}
