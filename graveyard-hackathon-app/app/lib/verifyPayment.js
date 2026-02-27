import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

export async function verifyPayment(txSig, userPubkey, rpcUrl, treasuryPubkey) {
  const connection = new Connection(rpcUrl, 'confirmed')

  const tx = await connection.getParsedTransaction(txSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })

  if (!tx) throw new Error('Transaction not found')
  if (tx.meta?.err) throw new Error('Transaction failed on-chain')

  // Verify the transaction contains a SOL transfer to treasury
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === 'string' ? k : k.pubkey.toString()
  )
  const treasuryStr = treasuryPubkey.toString()
  const treasuryIndex = accountKeys.indexOf(treasuryStr)

  if (treasuryIndex === -1) {
    throw new Error('Treasury not found in transaction accounts')
  }

  // Check that treasury received SOL (postBalance > preBalance)
  const preBal = tx.meta.preBalances[treasuryIndex]
  const postBal = tx.meta.postBalances[treasuryIndex]
  if (postBal <= preBal) {
    throw new Error('No SOL transferred to treasury')
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
