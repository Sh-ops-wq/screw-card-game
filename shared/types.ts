export type CardType = 'number' | 'special';

export type EffectType =
  | 'none'
  | 'look_own'
  | 'look_other'
  | 'thief'
  | 'see_swap'
  | 'take_give'
  | 'basra'
  | 'just_take'
  | 'peek_around';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  count: number;
  value: number;
  image: string;
  backImage: string;
  effectType: EffectType;
  rank?: number;
}

export interface PublicCard {
  id: string;
  name: string;
  type: CardType;
  value: number;
  image: string;
  effectType: EffectType;
  rank?: number;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  handSize: number;
  penaltyPoints: number;
  warningCount: number;
  initialPeekDone: boolean;
  seatIndex: number;
}

export type RoomPhase = 'lobby' | 'initialPeek' | 'playing' | 'action' | 'paused' | 'roundEnded';

export interface RoomState {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  minPlayers: number;
  maxPlayers: number;
  players: PublicPlayer[];
  chatMessages?: ChatMessage[];
  inviteUrl?: string;
}

export interface PublicGameState extends RoomState {
  currentPlayerId?: string;
  turnReadyAt?: number;
  turnExpiresAt?: number;
  turnTransitionDelayMs?: number;
  roundStartedAt?: number;
  screwUnlockAt?: number;
  screwUnlocked: boolean;
  finalRound: boolean;
  screwCallerId?: string;
  drawPileCount: number;
  discardTop: PublicCard | null;
  log: string[];
  pausedReason?: string;
  winnerId?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  message: string;
  createdAt: number;
}

export interface EmojiReaction {
  id: string;
  playerId: string;
  nickname: string;
  emoji: string;
  createdAt: number;
}

export interface PrivateHandSlot {
  index: number;
  card: PublicCard | null;
  visible: boolean;
  reason?: 'temporary' | 'drawn' | 'roundEnd';
}

export interface PrivatePlayerState {
  playerId: string;
  hand: PrivateHandSlot[];
  drawnCard: PublicCard | null;
  drawnCardSource: 'deck' | 'ground' | null;
  canAct: boolean;
  canDraw: boolean;
  canTakeGround: boolean;
  canCallScrew: boolean;
  canPlayThief: boolean;
  needsInitialPeek: boolean;
}

export interface RevealedCard {
  ownerId: string;
  index: number;
  card: PublicCard;
}

export interface ScoreLine {
  playerId: string;
  nickname: string;
  total: number;
  penaltyPoints: number;
  warningCount?: number;
  cards: PublicCard[];
  isWinner: boolean;
  isScrewCaller: boolean;
}

export interface RoundEndedPayload {
  scores: ScoreLine[];
  winnerId: string;
  screwCallerId?: string;
}

export interface ActionPrompt {
  type:
    | 'selectOwnCard'
    | 'selectOwnCards'
    | 'selectTargetPlayer'
    | 'selectTargetCard'
    | 'selectPeekAroundOption'
    | 'confirmSwap'
    | 'message';
  message: string;
  actorId: string;
  maxCards?: number;
  minCards?: number;
  targetPlayerId?: string;
  targetCardIndex?: number;
}

export interface GameLogEntry {
  at: number;
  message: string;
}
