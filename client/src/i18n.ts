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
  | 'game'
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
  | 'matchTotal'
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
    callScrew: 'SCREW',
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
    egyptianChaos: 'Egyptian hidden-card chaos, built for friends.',
    fillBots: 'Fill empty seats with Bots',
    game: 'Game',
    ground: 'Ground',
    host: 'Host',
    inviteLink: 'Invite Link',
    join: 'Join',
    joinRoom: 'Join Room',
    keep: 'Keep',
    language: 'Language',
    log: 'Log',
    matchChampion: 'Match Champion',
    matchStandings: 'Match Standings',
    matchTotal: 'Total',
    nextTurn: 'Next turn',
    nickname: 'Nickname',
    optionalMoves: 'Optional moves',
    playAgain: 'Play Again',
    players: 'players',
    privateTable: 'Private Table',
    raceToNWins: 'Best of {n} games - lowest total points wins',
    reserved: 'Reserved',
    roomCode: 'Room Code',
    roundClosedByScrew: 'Round sealed by Screw',
    roundComplete: 'Round Complete',
    scoreboard: 'Scoreboard',
    send: 'Send',
    sound: 'Sound',
    stats: 'Stats',
    thiefDisabled: 'Thief only works after Screw is called.',
    startGame: 'Start Game',
    takeFromGround: 'Take from Ground',
    turn: 'Turn',
    useAction: 'Use Action',
    waiting: 'Waiting',
    winner: 'Winner',
    warnings: 'Warnings',
    yourHand: 'Your Hand',
    yourTurn: 'Your Turn'
  },
  ar: {
    actions: 'الحركات',
    bot: 'بوت',
    callScrew: 'سكرو',
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
    egyptianChaos: 'سكرو للأصحاب على ترابيزة ديسكتوب.',
    fillBots: 'كمّل العدد ببوتات',
    game: 'جيم',
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
    matchTotal: 'المجموع',
    nextTurn: 'الدور الجاي',
    nickname: 'اسمك',
    optionalMoves: 'حركات اختيارية',
    playAgain: 'العب تاني',
    players: 'لعيبة',
    privateTable: 'ترابيزة خاصة',
    raceToNWins: 'أحسن {n} جيمات - أقل نقاط يكسب',
    reserved: 'محجوز',
    roomCode: 'كود الروم',
    roundClosedByScrew: 'الجولة اتقفلت بسكرو',
    roundComplete: 'الجولة خلصت',
    scoreboard: 'النتيجة',
    send: 'ابعت',
    sound: 'الصوت',
    stats: 'الإحصائيات',
    thiefDisabled: 'اللص بيشتغل بس بعد السكرو.',
    startGame: 'ابدأ اللعبة',
    takeFromGround: 'خد من الأرض',
    turn: 'الدور',
    useAction: 'استخدم الحركة',
    waiting: 'مستنيين',
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
