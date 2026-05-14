import type { ActionPrompt, ChatMessage, PeekMarker, PublicCard, RoomPhase, ScoreLine } from '../../../shared/types';

export interface CardInstance {
  instanceId: string;
  defId: string;
}

export interface ServerPlayer {
  id: string;
  nickname: string;
  socketId?: string;
  connected: boolean;
  isBot: boolean;
  disconnectedAt?: number;
  isHost: boolean;
  penaltyPoints: number;
  warningCount: number;
  timeoutCount: number;
  initialPeekDone: boolean;
}

export interface PlayerGameState {
  playerId: string;
  hand: CardInstance[];
}

export interface DrawnCardState {
  playerId: string;
  card: CardInstance;
  source: 'deck' | 'ground';
}

export type PendingAction =
  | { type: 'look_own'; actorId: string; actionCard: CardInstance }
  | { type: 'look_other'; actorId: string; actionCard: CardInstance }
  | { type: 'take_give'; actorId: string; actionCard: CardInstance; targetPlayerId?: string; targetCardIndex?: number; takenCard?: CardInstance }
  | { type: 'basra'; actorId: string; actionCard: CardInstance }
  | { type: 'just_take'; actorId: string; actionCard: CardInstance; targetPlayerId?: string }
  | { type: 'peek_around'; actorId: string; actionCard: CardInstance }
  | { type: 'see_swap'; actorId: string; actionCard: CardInstance; inspectedPlayerIds: string[]; targetPlayerId?: string; targetCardIndex?: number };

export interface GameState {
  phase: RoomPhase;
  deck: CardInstance[];
  discardPile: CardInstance[];
  playerStates: Record<string, PlayerGameState>;
  turnOrder: string[];
  currentTurnIndex: number;
  turnReadyAt: number;
  turnExpiresAt: number;
  roundStartedAt: number;
  screwUnlockAt: number;
  finalRound: boolean;
  screwCallerId?: string;
  finalTurnQueue: string[];
  drawnCard?: DrawnCardState;
  pendingAction?: PendingAction;
  log: string[];
  pausedReason?: string;
  scores?: ScoreLine[];
  winnerId?: string;
  /** Cards that have been peeked — eye icon shown to all players */
  peekMarkers: PeekMarker[];
}

export interface GameRoom {
  code: string;
  hostId: string;
  players: ServerPlayer[];
  game?: GameState;
  chatMessages: ChatMessage[];
  createdAt: number;
  matchPoints: Record<string, number>;
  matchGamePoints: Record<string, number[]>;
  matchGamesPlayed: number;
  pendingMatchReset: boolean;
}

export interface ActionResult {
  prompt?: ActionPrompt;
  reveals?: Array<{ ownerId: string; index: number; card: PublicCard }>;
  endTurn?: boolean;
  log?: string[];
  /** New peek markers to broadcast */
  peekMarkers?: PeekMarker[];
}
