const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Formats a number as currency: $1,234 or -$1,234
 */
export function formatMoney(amount) {
  return moneyFormatter.format(amount)
}

/**
 * Returns a random element from an array.
 */
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)]
}
