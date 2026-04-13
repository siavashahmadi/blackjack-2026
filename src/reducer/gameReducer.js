import { bettingReducer } from './bettingReducer'
import { playReducer } from './playReducer'
import { resolveReducer } from './resolveReducer'
import { uiReducer } from './uiReducer'

/*
 * DEBT GATE FLOW — How assets, debt, and vig interact:
 *
 * 1. Player starts with $10,000 cash + 6 assets.
 * 2. Player loses cash to $0. Chip tray is disabled (ADD_CHIP blocked by bankroll check).
 * 3. At $0, the BettingControls UI shows "BET AN ASSET" overlay (asset gate).
 *    Assets unlock progressively based on bankroll threshold.
 * 4. Player bets an asset as a side bet (BET_ASSET action). The asset's cash value
 *    is added to the bet total alongside any chip bet.
 * 5. If they LOSE: bankroll drops by the total bet amount. Asset is gone.
 *    This negative bankroll unlocks the NEXT asset.
 * 6. The cycle repeats: bet asset → lose → go deeper negative → unlock next asset.
 * 7. When ALL assets are bet/lost and bankroll is $0 or negative:
 *    The "TAKE A LOAN" button appears (loan gate).
 * 8. Player taps TAKE A LOAN → inDebtMode = true → chip tray unlocks permanently.
 *    Now the player can bet freely with borrowed money. Vig applies on borrowed portions.
 * 9. If the player WINS back above $0: inDebtMode resets to false.
 *    If they drop back to $0 with no assets, they must tap TAKE A LOAN again.
 *
 * Key invariant: ADD_CHIP is blocked when bankroll < minBet && !inDebtMode.
 * This forces the player through the asset → loan pipeline before accessing credit.
 */
export function gameReducer(state, action) {
  return bettingReducer(state, action)
    ?? playReducer(state, action)
    ?? resolveReducer(state, action)
    ?? uiReducer(state, action)
    ?? state
}
