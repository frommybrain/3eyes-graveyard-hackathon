#!/usr/bin/env node
/**
 * Generate a Solana keypair for SERVER_MINT_AUTHORITY_SECRET.
 *
 * Usage:
 *   node scripts/generate-mint-keypair.mjs
 *
 * Output:
 *   - Public key (fund this on devnet with `solana airdrop 2 <pubkey> --url devnet`)
 *   - Base58 secret key (add to .env.local as SERVER_MINT_AUTHORITY_SECRET)
 */

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

const keypair = Keypair.generate()
const pubkey = keypair.publicKey.toBase58()
const secret = bs58.encode(keypair.secretKey)

console.log('\n--- Mint Authority Keypair ---')
console.log(`Public Key:  ${pubkey}`)
console.log(`Secret Key:  ${secret}`)
console.log('\nAdd to .env.local:')
console.log(`SERVER_MINT_AUTHORITY_SECRET=${secret}`)
console.log(`\nFund on devnet:`)
console.log(`solana airdrop 2 ${pubkey} --url devnet`)
console.log('')
