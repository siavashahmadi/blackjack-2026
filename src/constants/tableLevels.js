import { CHIP_MAP } from './chips'

export const TABLE_LEVELS = [
  {
    id: 'felt',
    name: 'The Felt',
    subtitle: 'THE FELT',
    unlockAt: 0,
    minBet: 25,
    maxBet: 5000,
    chipValues: [25, 100, 500, 1000, 5000],
    felt: { dark: '#0c200c', mid: '#143a14', light: '#1a5a1a', highlight: '#2a7a2a', texture: '#1e4e1e' },
  },
  {
    id: 'emerald',
    name: 'The Emerald Room',
    subtitle: 'EMERALD ROOM',
    unlockAt: 100000,
    minBet: 500,
    maxBet: 25000,
    chipValues: [100, 500, 1000, 5000, 25000],
    felt: { dark: '#081a0a', mid: '#0e2e12', light: '#14501e', highlight: '#1c7030', texture: '#124218' },
  },
  {
    id: 'highRoller',
    name: 'High Roller Lounge',
    subtitle: 'HIGH ROLLER',
    unlockAt: 500000,
    minBet: 1000,
    maxBet: 100000,
    chipValues: [500, 1000, 5000, 25000, 100000],
    felt: { dark: '#081a1a', mid: '#0e2e2e', light: '#145050', highlight: '#1c7070', texture: '#124242' },
  },
  {
    id: 'penthouse',
    name: 'The Penthouse',
    subtitle: 'THE PENTHOUSE',
    unlockAt: 2000000,
    minBet: 10000,
    maxBet: 500000,
    chipValues: [1000, 5000, 25000, 100000, 500000],
    felt: { dark: '#08101a', mid: '#0e1a30', light: '#142850', highlight: '#1c3870', texture: '#122040' },
  },
  {
    id: 'vault',
    name: 'The Vault',
    subtitle: 'THE VAULT',
    unlockAt: 5000000,
    minBet: 100000,
    maxBet: 5000000,
    chipValues: [5000, 25000, 100000, 500000, 1000000],
    felt: { dark: '#0a0a08', mid: '#1a1a10', light: '#2a2a18', highlight: '#3a3a22', texture: '#1e1e12' },
  },
  {
    id: 'obsidian',
    name: 'The Obsidian Room',
    subtitle: 'OBSIDIAN ROOM',
    unlockAt: 10000000,
    minBet: 1000000,
    maxBet: 10000000,
    chipValues: [25000, 100000, 500000, 1000000, 10000000],
    felt: { dark: '#0a0808', mid: '#1a1010', light: '#2a1818', highlight: '#3a2222', texture: '#1e1212' },
  },
]

// Debt chip sets — used when bankroll <= 0 (always at The Felt)
const DEBT_CHIP_SETS = [
  { maxBankroll: -1000000, values: [5000, 25000, 100000, 500000, 1000000] },
  { maxBankroll: -100000,  values: [1000, 5000, 25000, 100000, 500000] },
  { maxBankroll: 0,        values: [100, 500, 1000, 5000, 25000] },
]

/**
 * Returns table level index (0-5) based on current bankroll.
 * Bankroll <= 0 always returns 0 (The Felt).
 */
export function getTableLevel(bankroll) {
  if (bankroll <= 0) return 0
  for (let i = TABLE_LEVELS.length - 1; i >= 0; i--) {
    if (bankroll >= TABLE_LEVELS[i].unlockAt) return i
  }
  return 0
}

/**
 * Returns 5 chip objects for the given table level and bankroll.
 * When in debt (bankroll <= 0), uses debt-specific chip escalation.
 */
export function getTableChips(tableLevel, bankroll) {
  if (bankroll <= 0) {
    const set = DEBT_CHIP_SETS.find(s => bankroll <= s.maxBankroll) || DEBT_CHIP_SETS[DEBT_CHIP_SETS.length - 1]
    return set.values.map(v => CHIP_MAP[v])
  }
  return TABLE_LEVELS[tableLevel].chipValues.map(v => CHIP_MAP[v])
}
