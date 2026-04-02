// All chip definitions (full catalog) — pastel palette, visually distinct
export const CHIPS = [
  // 25 - Punchy Coral Rose
  { value: 25, label: '25', color: '#FF8B8B', rimColor: '#E06B6B', spotColor: '#FFFFFF', textColor: '#7A2E2E' },
  // 100 - Vivid Sky Blue
  { value: 100, label: '100', color: '#7AB5E6', rimColor: '#5A95C6', spotColor: '#FFFFFF', textColor: '#1E3A5A' },
  // 500 - Electric Orchid
  { value: 500, label: '500', color: '#D291FF', rimColor: '#B271DF', spotColor: '#FFFFFF', textColor: '#4D1B7A' },
  // 1K - Bright Peach (Vibrant Orange-tone, zero yellow)
  { value: 1000, label: '1K', color: '#FFB366', rimColor: '#DF9346', spotColor: '#FFFFFF', textColor: '#7D3D0D' },
  // 5K - Neon Seafoam
  { value: 5000, label: '5K', color: '#7FFFD4', rimColor: '#5FDFB4', spotColor: '#FFFFFF', textColor: '#0D5D4D' },
  // 25K - Pastel Cream
  { value: 25000, label: '25K', color: '#F0E8D8', rimColor: '#D4CCC0', spotColor: '#A0C8F0', textColor: '#3A3530' },
  // 100K - Pastel Gold
  { value: 100000, label: '100K', color: '#F0D890', rimColor: '#D4BC74', spotColor: '#FFFFF0', textColor: '#5A4A10' },
  // 500K - Pastel Steel
  { value: 500000, label: '500K', color: '#C8D0DC', rimColor: '#ACB4C0', spotColor: '#E8ECF0', textColor: '#2D3540' },
  // 1M - Pastel Lilac
  { value: 1000000, label: '1M', color: '#D0A8E0', rimColor: '#B48CC4', spotColor: '#F0E0F8', textColor: '#3A1850' },
  // 10M - Pastel Charcoal
  { value: 10000000, label: '10M', color: '#484050', rimColor: '#343040', spotColor: '#E8A0A0', textColor: '#E8A0A0' },
]

// Chip lookup by value for fast access
export const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))
