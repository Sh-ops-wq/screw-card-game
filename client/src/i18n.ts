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
  | 'nextTurn'
  | 'nickname'
  | 'optionalMoves'
  | 'playAgain'
  | 'players'
  | 'privateTable'
  | 'reserved'
  | 'roomCode'
  | 'roundComplete'
  | 'scoreboard'
  | 'send'
  | 'sound'
  | 'stats'
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
    nextTurn: 'Next turn',
    nickname: 'Nickname',
    optionalMoves: 'Optional moves',
    playAgain: 'Play Again',
    players: 'players',
    privateTable: 'Private Table',
    reserved: 'Reserved',
    roomCode: 'Room Code',
    roundComplete: 'Round Complete',
    scoreboard: 'Scoreboard',
    send: 'Send',
    sound: 'Sound',
    stats: 'Stats',
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
    nextTurn: 'الدور الجاي',
    nickname: 'اسمك',
    optionalMoves: 'حركات اختيارية',
    playAgain: 'العب تاني',
    players: 'لاعيبة',
    privateTable: 'ترابيزة خاصة',
    reserved: 'محجوز',
    roomCode: 'كود الروم',
    roundComplete: 'الجولة خلصت',
    scoreboard: 'النتيجة',
    send: 'ابعت',
    sound: 'الصوت',
    stats: 'الإحصائيات',
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
  en: ['Smart move!', 'Clean swap!', 'Big brain play!', 'Nice memory!', 'You cooked!'],
  ar: ['حركة نضيفة!', 'لعبتها صح!', 'دماغ عالية!', 'جامدة يا نجم!', 'كده أنت بتطبخ!']
};

export function getT(language: Language): TFunction {
  return (key) => dictionary[language][key] ?? dictionary.en[key] ?? key;
}
