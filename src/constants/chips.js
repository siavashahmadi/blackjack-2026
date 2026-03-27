// All chip definitions (full catalog)
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
  // 25K - Bright Pearl White
  { value: 25000, label: '25K', color: '#F8F9FA', rimColor: '#D8D9DA', spotColor: '#7AB5E6', textColor: '#334155' },
  // 100K - Gold Metallic
  { value: 100000, label: '100K', color: '#DAA520', rimColor: '#B8860B', spotColor: '#FFF8DC', textColor: '#3D2B00' },
  // 500K - Platinum Silver
  { value: 500000, label: '500K', color: '#C0C0C0', rimColor: '#A0A0A0', spotColor: '#E8E8E8', textColor: '#2D2D2D' },
  // 1M - Royal Purple
  { value: 1000000, label: '1M', color: '#8E24AA', rimColor: '#6A1B9A', spotColor: '#E1BEE7', textColor: '#FFFFFF' },
  // 10M - Obsidian Black (THE ULTIMATE CHIP)
  { value: 10000000, label: '10M', color: '#1a1a1a', rimColor: '#0a0a0a', spotColor: '#cc3333', textColor: '#cc3333' },
]

// Chip lookup by value for fast access
export const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))
