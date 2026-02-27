/**
 * Mint a Metaplex Core NFT asset.
 *
 * Keypair loading (checked in order):
 *   1. DEPLOY_WALLET_JSON env → JSON byte array (e.g. [241,157,...])
 *   2. MINT_KEYPAIR_PATH env → path to a Solana CLI JSON keypair file
 */

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { create, mplCore } from '@metaplex-foundation/mpl-core'
import {
  generateSigner,
  createSignerFromKeypair,
  signerIdentity,
  publicKey,
} from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'
import fs from 'fs'
import path from 'path'

let _umi = null

function loadSecretKey() {
  // Option 1: JSON byte array in env var
  const walletJson = process.env.DEPLOY_WALLET_JSON
  if (walletJson) {
    return new Uint8Array(JSON.parse(walletJson))
  }

  // Option 2: Path to JSON keypair file
  const keypairPath = process.env.MINT_KEYPAIR_PATH
  if (keypairPath) {
    const resolved = path.resolve(keypairPath)
    const raw = fs.readFileSync(resolved, 'utf-8')
    return new Uint8Array(JSON.parse(raw))
  }

  throw new Error('Set DEPLOY_WALLET_JSON (JSON byte array) or MINT_KEYPAIR_PATH (path to JSON keypair file)')
}

function getUmi() {
  if (_umi) return _umi

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
  const umi = createUmi(rpcUrl).use(mplCore())

  const secretKeyBytes = loadSecretKey()
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes)
  const authoritySigner = createSignerFromKeypair(umi, keypair)
  umi.use(signerIdentity(authoritySigner))

  _umi = umi
  return umi
}

/**
 * Mint a Metaplex Core asset to a user's wallet.
 * @param {object} params
 * @param {string} params.metadataUri - IPFS URI for the JSON metadata
 * @param {string} params.name - On-chain asset name
 * @param {string} params.ownerAddress - User's wallet (base58)
 * @returns {Promise<{ assetPublicKey: string, signature: string }>}
 */
export async function mintCoreAsset({ metadataUri, name, ownerAddress }) {
  const umi = getUmi()

  const asset = generateSigner(umi)
  const owner = publicKey(ownerAddress)

  const tx = await create(umi, {
    asset,
    name,
    uri: metadataUri,
    owner,
  }).sendAndConfirm(umi)

  const signature = base58.deserialize(tx.signature)[0]

  return {
    assetPublicKey: asset.publicKey,
    signature,
  }
}
