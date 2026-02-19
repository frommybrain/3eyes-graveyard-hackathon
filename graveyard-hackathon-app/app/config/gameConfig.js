// Game configuration — single source of truth for all scene/game parameters.
// Leva controls override these defaults at runtime for artistic tweaking.

export const gameConfig = {
  // Scene atmosphere
  fog: { color: '#2a1a2e', density: 0.015 },
  sky: { color: '#1a0a1e' },
  ground: { color: '#1a1a2e', size: 200 },

  // Lighting defaults
  dirLight: { color: '#f9c7fb', intensity: 1.0, position: [50, 50, 70] },
  ambientLight: { intensity: 0.9 },

  // Photo spots — equal weight, visual variety only (rarity lives in the Aura system)
  spots: [
    { id: 'grave_gate', name: 'Grave Gate', pos: [10, 0, -5], color: '#666666' },
    { id: 'cathedral_ruins', name: 'Cathedral Ruins', pos: [-30, 0, 12], color: '#4444aa' },
    { id: 'blood_orchard', name: 'Blood Orchard', pos: [5, 0, 40], color: '#aa4444' },
    { id: 'black_sun', name: 'Black Sun Altar', pos: [0, 0, 80], color: '#ffaa00' },
  ],

  // World presets — atmosphere variations selected by seed
  presets: [
    { id: 'ashen_dusk', name: 'Ashen Dusk', fog: '#2a1a2e', lightColor: '#f9c7fb', lightIntensity: 1.0, skyTint: '#1a0a1e' },
    { id: 'blood_dawn', name: 'Blood Dawn', fog: '#3a0a0a', lightColor: '#ff6644', lightIntensity: 1.2, skyTint: '#2a0505' },
    { id: 'ghost_fog', name: 'Ghost Fog', fog: '#1a2a1a', lightColor: '#aaffcc', lightIntensity: 0.8, skyTint: '#0a1a0a' },
    { id: 'void_night', name: 'Void Night', fog: '#0a0a1a', lightColor: '#6644ff', lightIntensity: 0.6, skyTint: '#050510' },
  ],

  // Poses — animation clip names for when GLB model is ready
  poses: [
    { id: 'prophet_point', name: 'Prophet Point', animClip: 'pose_01' },
    { id: 'grave_salute', name: 'Grave Salute', animClip: 'pose_02' },
    { id: 'skull_hold', name: 'Skull Hold', animClip: 'pose_03' },
    { id: 'peace_sign', name: 'Peace Sign', animClip: 'pose_04' },
    { id: 'arms_crossed', name: 'Arms Crossed', animClip: 'pose_05' },
  ],

  // Economy
  economy: {
    thirdVisionPrice: 100,
    auraRerollPrice: 50,
    totalSupply: 666,
    maxFreeVisions: 2,
    priceDisplay: 100,
    cluster: process.env.NEXT_PUBLIC_CLUSTER || 'devnet',
    get mint() {
      return this.cluster === 'mainnet-beta'
        ? process.env.NEXT_PUBLIC_3EYES_MINT_MAINNET
        : process.env.NEXT_PUBLIC_3EYES_MINT_DEVNET
    },
    get decimals() {
      return this.cluster === 'mainnet-beta' ? 6 : 9
    },
    get priceRaw() {
      return BigInt(this.priceDisplay) * BigInt(10 ** this.decimals)
    },
    treasury: process.env.NEXT_PUBLIC_TREASURY_PUBKEY,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  },

  // NPC behaviour
  npc: { walkSpeed: 2, runSpeed: 8, color: '#8844ff', roamRadius: 15 },

  // Fiat-only mode — hides all crypto UI, routes everything through Stripe + Crossmint
  // Set NEXT_PUBLIC_FIAT_ONLY=true to activate (e.g. for non-web3 audience after hackathon)
  fiatOnly: process.env.NEXT_PUBLIC_FIAT_ONLY === 'true',

  // Crossmint (email-based custodial wallets)
  crossmint: {
    projectId: process.env.NEXT_PUBLIC_CROSSMINT_PROJECT_ID,
    get environment() {
      const cluster = process.env.NEXT_PUBLIC_CLUSTER || 'devnet'
      return cluster === 'mainnet-beta' ? 'production' : 'staging'
    },
  },

  // Fiat pricing (shown to non-web3 users)
  fiatPricing: {
    visionPriceGBP: 5,           // £5 for vision 3
    auraRerollPriceGBP: 2.50,    // £2.50 for aura re-roll
    currency: 'gbp',
  },

  // Physical print ordering
  prints: {
    enabled: true,
    priceGBP: 0,              // 0 = free initially
    currency: 'gbp',
  },

  // Selfie camera
  selfieCamera: { fov: 85, offset: [2, 2, 3] },

  // Placeholder buildings for blockout — swap for real models later
  buildings: [
    { pos: [20, 2.5, -15], size: [6, 5, 6], color: '#2a2a3e' },
    { pos: [-15, 3, 5], size: [8, 6, 4], color: '#2a2a3e' },
    { pos: [35, 1.5, 20], size: [4, 3, 10], color: '#2a2a3e' },
    { pos: [-25, 4, -20], size: [10, 8, 8], color: '#2a2a3e' },
    { pos: [0, 2, 60], size: [12, 4, 6], color: '#2a2a3e' },
    { pos: [-40, 3.5, 30], size: [5, 7, 5], color: '#2a2a3e' },
  ],
}
