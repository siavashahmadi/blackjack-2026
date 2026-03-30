/**
 * Vig (interest) rate tiers for borrowed bets.
 * When a player bets with borrowed money, the casino takes a percentage off the top.
 * Tiers ordered from least negative bankroll to most negative.
 */
const VIG_TIERS = [
  { minBankroll: 0,          rate: 0.02 },   // >= $0: 2%
  { minBankroll: -10000,     rate: 0.04 },   // $0 to -$10K: 4%
  { minBankroll: -50000,     rate: 0.07 },   // -$10K to -$50K: 7%
  { minBankroll: -250000,    rate: 0.10 },   // -$50K to -$250K: 10%
  { minBankroll: -500000,    rate: 0.15 },   // -$250K to -$500K: 15%
  { minBankroll: -1000000,   rate: 0.20 },   // -$500K to -$1M: 20%
  { minBankroll: -5000000,   rate: 0.275 },  // -$1M to -$5M: 27.5%
  { minBankroll: -Infinity,  rate: 0.40 },   // Below -$5M: 40%
]

/**
 * Returns the vig rate for a given bankroll level.
 */
export function getVigRate(bankroll) {
  for (const tier of VIG_TIERS) {
    if (bankroll >= tier.minBankroll) return tier.rate
  }
  return VIG_TIERS[VIG_TIERS.length - 1].rate
}
