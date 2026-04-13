export const slotsBattleInitialState = {
  // Connection
  connected: false,
  playerId: null,
  roomCode: null,
  sessionToken: null,
  error: null,

  // Lobby
  playerName: '',
  players: [],
  isHost: false,

  // Game config
  totalRounds: 10,
  betPerRound: 100,

  // Game state (from server)
  phase: 'disconnected', // disconnected | lobby | spinning | round_result | final_result
  currentRound: 0,
  pot: 0,
  buyIn: 0,

  // Player states — pid → { name, totalScore, hasSpun, roundScore, reels, matchType, connected, isHost }
  playerStates: {},

  // Round result — array of { player_id, name, round_score, total_score, reels, match_type }
  roundResults: null,

  // Final result
  finalStandings: null,
  winnerId: null,
  winnerPayout: 0,
  houseCut: 0,
  payoutType: null, // 'winner' | 'refund'
  isTie: false,

  // Audio
  muted: false,
}

export function createSlotsBattleInitialState() {
  return { ...slotsBattleInitialState }
}
