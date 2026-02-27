// Shared in-memory stores — imported by all API routes
// Replace with a DB for production

export const sessions = new Map()
export const walletVisions = new Map()
export const mintedWallets = new Set()

let _mintCount = 0
export function getMintCount() { return _mintCount }
export function incrementMintCount() { return ++_mintCount }
