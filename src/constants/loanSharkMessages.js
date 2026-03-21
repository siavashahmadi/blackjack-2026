// Loan shark message thresholds — sorted ascending (least negative first)
// Each threshold triggers once per session when bankroll drops to or below the value

export const LOAN_SHARK_THRESHOLDS = [
  { threshold: -1000, message: '📱 Text from unknown number: "We know where you live."' },
  { threshold: -5000, message: '📱 Text from Tony: "Nice kneecaps. Would be a shame if..."' },
  { threshold: -10000, message: '🚪 Someone knocked on your door. Nobody was there. Just a dead fish on the welcome mat.' },
  { threshold: -25000, message: '🚗 A black SUV has been parked outside your house for 3 days.' },
  { threshold: -50000, message: '📞 Voicemail from Mom: "Honey, some men in suits came asking about you..."' },
  { threshold: -100000, message: '📰 Local news: "Missing persons report filed by concerned friends."' },
  { threshold: -250000, message: '🏦 Your bank account has been frozen. Your credit cards are confetti.' },
  { threshold: -500000, message: '🔥 Your credit score just caught fire.' },
  { threshold: -1000000, message: '👑 Congrats! You\'ve been crowned King of Bad Decisions.' },
  { threshold: -5000000, message: '🌍 You now owe more than the GDP of some small nations. The IMF is concerned.' },
  { threshold: -10000000, message: '🛸 At this point, only aliens can save you.' },
]
