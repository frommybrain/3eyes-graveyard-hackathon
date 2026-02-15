import { Connection, PublicKey } from '@solana/web3.js'

export async function verifyPayment(txSig, userPubkey, rpcUrl, expectedMint, treasuryPubkey) {
  const connection = new Connection(rpcUrl, 'confirmed')

  const tx = await connection.getParsedTransaction(txSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })

  if (!tx) throw new Error('Transaction not found')
  if (tx.meta?.err) throw new Error('Transaction failed on-chain')

  // Verify the transaction contains a token transfer with the correct mint
  const preBalances = tx.meta.preTokenBalances || []
  const postBalances = tx.meta.postTokenBalances || []

  // Find token transfers matching our expected mint
  const mintStr = expectedMint.toString()
  const relevantPost = postBalances.filter((b) => b.mint === mintStr)

  if (relevantPost.length === 0) {
    throw new Error('No token transfer found for expected mint')
  }

  // Verify that the transaction was signed by the user
  const signers = tx.transaction.message.accountKeys
    .filter((k) => k.signer)
    .map((k) => k.pubkey.toString())

  if (!signers.includes(userPubkey)) {
    throw new Error('Transaction not signed by claimed user')
  }

  return {
    blockhash: tx.transaction.message.recentBlockhash,
  }
}
