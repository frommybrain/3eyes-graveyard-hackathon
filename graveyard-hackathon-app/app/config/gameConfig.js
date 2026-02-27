// Game configuration — single source of truth for all scene/game parameters.
// Leva controls override these defaults at runtime for artistic tweaking.

export const gameConfig = {
  // Scene atmosphere
  sky: { color: '#1a0a1e' },
  ground: { color: '#1a1a2e', size: 200 },

  // Lighting defaults
  dirLight: { color: '#f9c7fb', intensity: 1.0, position: [-6, 34, -17] },
  ambientLight: { intensity: 0.9 },

  // Photo spots — weight determines selection probability (higher = more common)
  // To change: edit name/rarity/weight freely. Keep id stable once NFTs are minted.
  // Probability = weight / sum_of_all_weights (currently 100)
  spots: [
    { id: 'spot_1', name: 'Forgotten Gate',   rarity: 'Common',    weight: 25, pos: [-1.76, 0, -5.41] },
    { id: 'spot_2', name: 'Hollow Clearing',  rarity: 'Common',    weight: 25, pos: [1.25, 0, -23.68] },
    { id: 'spot_3', name: "Watcher's Perch",  rarity: 'Uncommon',  weight: 15, pos: [6.28, 0, -29.59] },
    { id: 'spot_4', name: 'Bone Garden',      rarity: 'Uncommon',  weight: 12, pos: [4.31, 0, -21.44] },
    { id: 'spot_5', name: "Pilgrim's Rest",   rarity: 'Rare',      weight: 8,  pos: [-0.81, 0, 11.40] },
    { id: 'spot_6', name: 'Void Sanctum',     rarity: 'Rare',      weight: 7,  pos: [-26.63, 0, -63.88] },
    { id: 'spot_7', name: 'Blood Altar',      rarity: 'Epic',      weight: 5,  pos: [0.93, 0, -64.30] },
    { id: 'spot_8', name: 'Black Sun Throne', rarity: 'Legendary', weight: 3,  pos: [-10.22, 0, 1.28] },
  ],

  // World presets — atmosphere variations selected by seed
  // Each preset sets sky gradient (top/middle/bottom) + gradient mask color
  presets: [
    { id: 'cool_whip', name: 'Cool Whip', skyTop: '#000000', skyMiddle: '#53b2ff', skyBottom: '#ffffff', gradientColor: '#4ebeff' },
    { id: 'rose',      name: 'Rose',      skyTop: '#ff0060', skyMiddle: '#ff79bf', skyBottom: '#ffffff', gradientColor: '#ff5682' },
    { id: 'soft',      name: 'Soft',      skyTop: '#ffa15e', skyMiddle: '#f5a270', skyBottom: '#ffffff', gradientColor: '#f2cfa2' },
    { id: 'fuji',      name: 'Fuji',      skyTop: '#5effb1', skyMiddle: '#88e5e5', skyBottom: '#bffffa', gradientColor: '#cfffef' },
  ],

  // Poses — animation clip names for when GLB model is ready
  poses: [
    { id: 'prophet_point', name: 'Prophet Point', animClip: 'pose_01' },
    { id: 'grave_salute', name: 'Grave Salute', animClip: 'pose_02' },
    { id: 'skull_hold', name: 'Skull Hold', animClip: 'pose_03' },
    { id: 'peace_sign', name: 'Peace Sign', animClip: 'pose_04' },
    { id: 'arms_crossed', name: 'Arms Crossed', animClip: 'pose_05' },
  ],

  // Economy — SOL-based payments
  economy: {
    thirdVisionPrice: 0.333,     // SOL for 3rd vision
    auraRerollPrice: 0.0333,     // SOL for aura re-roll
    totalSupply: 666,
    maxFreeVisions: 2,
    maxSelfies: 3, // Hard cap per batch
    selfieCooldownHours: 3, // Hours before a new batch of selfies unlocks
    devWallets: ['Fop6HTZr57VAHw8t2S8MGwJvxJ9BGWHvLfLrRajKMv6'], // Bypass cooldown
    cluster: process.env.NEXT_PUBLIC_CLUSTER || 'devnet',
    treasury: process.env.NEXT_PUBLIC_TREASURY_PUBKEY,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  },

  // NPC behaviour
  npc: { walkSpeed: 2, runSpeed: 3, color: '#8844ff', roamRadius: 15 },

  // Fiat + Crossmint — disabled for Solana hackathon, enable later
  fiatEnabled: false,
  fiatOnly: false,

  // Crossmint (email-based custodial wallets) — disabled for hackathon
  crossmint: {
    projectId: process.env.NEXT_PUBLIC_CROSSMINT_PROJECT_ID,
    get environment() {
      const cluster = process.env.NEXT_PUBLIC_CLUSTER || 'devnet'
      return cluster === 'mainnet-beta' ? 'production' : 'staging'
    },
  },

  // Fiat pricing — hidden for hackathon (fiatEnabled: false)
  fiatPricing: {
    visionPriceGBP: 5,
    auraRerollPriceGBP: 2.50,
    currency: 'gbp',
  },

  // Physical print ordering — hidden for hackathon
  prints: {
    enabled: false,
    priceGBP: 0,
    currency: 'gbp',
  },

  // Selfie camera
  selfieCamera: { fov: 85, offset: [2, 2, 3] },
}
