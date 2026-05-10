export type Language = 'en' | 'ar';

type TranslationKey =
  | 'actions'
  | 'bot'
  | 'callScrew'
  | 'cardsLeft'
  | 'chat'
  | 'chooseCard'
  | 'choosePlayer'
  | 'connected'
  | 'copyInvite'
  | 'copied'
  | 'createRoom'
  | 'deck'
  | 'discard'
  | 'disconnected'
  | 'donePeeking'
  | 'drawFromDeck'
  | 'drawnCard'
  | 'egyptianChaos'
  | 'fillBots'
  | 'ground'
  | 'host'
  | 'inviteLink'
  | 'join'
  | 'joinRoom'
  | 'keep'
  | 'language'
  | 'log'
  | 'matchChampion'
  | 'matchStandings'
  | 'nextTurn'
  | 'nickname'
  | 'optionalMoves'
  | 'playAgain'
  | 'players'
  | 'privateTable'
  | 'raceToNWins'
  | 'reserved'
  | 'roomCode'
  | 'roundClosedByScrew'
  | 'roundComplete'
  | 'scoreboard'
  | 'send'
  | 'sound'
  | 'stats'
  | 'thiefDisabled'
  | 'startGame'
  | 'takeFromGround'
  | 'turn'
  | 'useAction'
  | 'waiting'
  | 'winner'
  | 'warnings'
  | 'yourHand'
  | 'yourTurn';

export type TFunction = (key: TranslationKey) => string;

const dictionary: Record<Language, Record<TranslationKey, string>> = {
  en: {
    actions: 'Actions',
    bot: 'Bot',
    callScrew: 'Call Screw',
    cardsLeft: 'left',
    chat: 'Chat',
    chooseCard: 'Choose a card',
    choosePlayer: 'Choose a player',
    connected: 'Connected',
    copyInvite: 'Copy invite',
    copied: 'Copied',
    createRoom: 'Create Room',
    deck: 'Deck',
    discard: 'Discard',
    disconnected: 'Disconnected',
    donePeeking: 'Done Peeking',
    drawFromDeck: 'Draw from Deck',
    drawnCard: 'Drawn Card',
    egyptianChaos: 'Egyptian hidden-card chaos, built for friends around a desktop table.',
    fillBots: 'Fill empty seats with Bots',
    ground: 'Ground',
    host: 'Host',
    inviteLink: 'Invite Link',
    join: 'Join',
    joinRoom: 'Join Room',
    keep: 'Keep',
    language: 'Language',
    log: 'Log',
    matchChampion: 'Match champion',
    matchStandings: 'Match standings',
    nextTurn: 'Next turn',
    nickname: 'Nickname',
    optionalMoves: 'Optional moves',
    playAgain: 'Play Again',
    players: 'players',
    privateTable: 'Private Table',
    raceToNWins: 'First to {n} round wins takes the match',
    reserved: 'Reserved',
    roomCode: 'Room Code',
    roundClosedByScrew: 'Round sealed by Screw',
    roundComplete: 'Round Complete',
    scoreboard: 'Scoreboard',
    send: 'Send',
    sound: 'Sound',
    stats: 'Stats',
    thiefDisabled: 'Thief cannot fire anymore — Screw now ends the round immediately.',
    startGame: 'Start Game',
    takeFromGround: 'Take from Ground',
    turn: 'Turn',
    useAction: 'Use Action',
    waiting: 'Waiting for players',
    winner: 'Winner',
    warnings: 'Warnings',
    yourHand: 'Your Hand',
    yourTurn: 'Your Turn'
  },
  ar: {
    actions: 'الحركات',
    bot: 'بوت',
    callScrew: 'قول سكرو',
    cardsLeft: 'فاضل',
    chat: 'الشات',
    chooseCard: 'اختار كارت',
    choosePlayer: 'اختار لاعب',
    connected: 'متصل',
    copyInvite: 'انسخ الدعوة',
    copied: 'اتنسخ',
    createRoom: 'اعمل روم',
    deck: 'القومة',
    discard: 'ارمي',
    disconnected: 'فاصل',
    donePeeking: 'خلصت',
    drawFromDeck: 'اسحب من القومة',
    drawnCard: 'الكارت المسحوب',
    egyptianChaos: 'سكرو للأصحاب على ترابيزة ديسكتوب شيك.',
    fillBots: 'كمّل العدد ببوتات',
    ground: 'الأرض',
    host: 'الهوست',
    inviteLink: 'لينك الدعوة',
    join: 'ادخل',
    joinRoom: 'ادخل روم',
    keep: 'احتفظ',
    language: 'اللغة',
    log: 'اللوج',
    matchChampion: 'بطل الماتش',
    matchStandings: 'ترتيب الماتش',
    nextTurn: 'الدور الجاي',
    nickname: 'اسمك',
    optionalMoves: 'حركات اختيارية',
    playAgain: 'العب تاني',
    players: 'لاعيبة',
    privateTable: 'ترابيزة خاصة',
    raceToNWins: 'أول واحد يوصل لـ {n} جولة يكسب الماتش',
    reserved: 'محجوز',
    roomCode: 'كود الروم',
    roundClosedByScrew: 'الجولة اتقفلت بالسكرو',
    roundComplete: 'الجولة خلصت',
    scoreboard: 'النتيجة',
    send: 'ابعت',
    sound: 'الصوت',
    stats: 'الإحصائيات',
    thiefDisabled: 'حركة اللص مش شغالة هنا لأن السكرو بيقفل الجولة على طول.',
    startGame: 'ابدأ اللعبة',
    takeFromGround: 'خد من الأرض',
    turn: 'الدور',
    useAction: 'استخدم الحركة',
    waiting: 'مستنيين لاعيبة',
    winner: 'الفائز',
    warnings: 'تحذيرات',
    yourHand: 'كروتك',
    yourTurn: 'دورك'
  }
};

export const reactions: Record<Language, string[]> = {
  en: ['Clean swap.', 'Sharp.'],
  ar: ['لعبتهالها صح.', 'شاطر.']
};

export function getT(language: Language): TFunction {
  return (key) => dictionary[language][key] ?? dictionary.en[key] ?? key;
}
