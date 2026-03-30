import { CHIPS } from '../constants/chips'

// Chip values sorted descending for greedy decomposition
const CHIP_VALUES_DESC = [...CHIPS].map(c => c.value).sort((a, b) => b - a)

export function sumChipStack(chipStack) {
  return chipStack.reduce((sum, v) => sum + v, 0)
}

export function decomposeIntoChips(amount) {
  const chips = []
  let remaining = amount
  for (const value of CHIP_VALUES_DESC) {
    while (remaining >= value) {
      chips.push(value)
      remaining -= value
    }
  }
  return chips
}
