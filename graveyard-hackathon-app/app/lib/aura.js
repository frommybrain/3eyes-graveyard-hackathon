export const AURA_TIERS = [
  {
    id: 'faded',
    name: 'Faded',
    tier: 1,
    weight: 65,
    overlay: 'aura_faded.png',
    color: '#888888',
    description: 'A dim, barely-there presence',
  },
  {
    id: 'marked',
    name: 'Marked',
    tier: 2,
    weight: 20,
    overlay: 'aura_marked.png',
    color: '#6644cc',
    description: 'Something stirs beneath the surface',
  },
  {
    id: 'chosen',
    name: 'Chosen',
    tier: 3,
    weight: 10,
    overlay: 'aura_chosen.png',
    color: '#00ccff',
    description: 'The graveyard recognizes you',
  },
  {
    id: 'blessed',
    name: 'Blessed',
    tier: 4,
    weight: 4,
    overlay: 'aura_blessed.png',
    color: '#ffaa00',
    description: 'Touched by forces beyond the veil',
  },
  {
    id: 'black_sun',
    name: 'Black Sun',
    tier: 5,
    weight: 1,
    overlay: 'aura_black_sun.png',
    color: '#ff0033',
    description: 'THE BLACK SUN RISES',
    hasDistortion: true,
  },
]

export function pickAura(seedByte) {
  const totalWeight = AURA_TIERS.reduce((sum, a) => sum + a.weight, 0)
  let roll = seedByte % totalWeight
  for (const aura of AURA_TIERS) {
    roll -= aura.weight
    if (roll < 0) return aura
  }
  return AURA_TIERS[0]
}
