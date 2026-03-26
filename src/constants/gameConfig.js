export const STARTING_BANKROLL = 10000
export const MIN_BET = 25
export const DECK_COUNT = 6
export const RESHUFFLE_THRESHOLD = 75
export const DEALER_HIT_DELAY = 600
export const DEALER_STAND_DELAY = 400
export const BLACKJACK_PAYOUT = 1.5
export const MAX_VISUAL_CHIPS = 12

// Multiplayer WebSocket
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
