/**
 * Escalating credit labels that rotate based on debt level.
 * Tiers ordered from least negative to most negative.
 */
export const CREDIT_LABEL_TIERS = [
  { minBankroll: -1000,     labels: ['BETTING ON CREDIT', 'THE HOLE BEGINS', 'BORROWING FROM TOMORROW'] },
  { minBankroll: -5000,     labels: ['FINANCIALLY QUESTIONABLE', 'PAST THE POINT OF NO RETURN', 'YOUR BANK IS CALLING'] },
  { minBankroll: -25000,    labels: ['DEBT IS JUST NEGATIVE SAVINGS', 'DIGGING DEEPER', 'THE CASINO THANKS YOU'] },
  { minBankroll: -100000,   labels: ['DEBT IS A LIFESTYLE', 'YOUR CREDIT SCORE LEFT THE CHAT', 'FINANCIAL FREEFALL'] },
  { minBankroll: -500000,   labels: ["MONEY ISN'T REAL ANYWAY", 'BEYOND RECOVERY', 'THE IRS HAS QUESTIONS'] },
  { minBankroll: -1000000,  labels: ['WANTED BY VISA, MASTERCARD, AND GOD', 'GENERATIONAL DEBT UNLOCKED', 'YOUR DEBT HAS ITS OWN ZIP CODE'] },
  { minBankroll: -Infinity, labels: ['ECONOMIC ANOMALY', 'DEBT SINGULARITY REACHED', "THEY'LL WRITE TEXTBOOKS ABOUT THIS"] },
]

/**
 * Returns the tier index for a given bankroll, or -1 if bankroll >= 0.
 */
export function getCreditTierIndex(bankroll) {
  if (bankroll >= 0) return -1
  for (let i = 0; i < CREDIT_LABEL_TIERS.length; i++) {
    if (bankroll >= CREDIT_LABEL_TIERS[i].minBankroll) return i
  }
  return CREDIT_LABEL_TIERS.length - 1
}
