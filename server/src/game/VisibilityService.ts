import { BOT_PREFILL_TABLE_SIZE } from '../../../shared/gameConfig';
import { MAX_PLAYERS, MIN_PLAYERS, TURN_TRANSITION_DELAY_MS } from './Constants';
import { toPublicCard } from './CardDefs';
import { DeckService } from './DeckService';
import { TurnService } from './TurnService';
import type { GameRoom } from './Types';
import type { PrivatePlayerState, PublicGameState, PublicPlayer, RoomState } from '../../../shared/types';

export class VisibilityService {
  static roomState(room: GameRoom, inviteUrl?: string): RoomState {
    return {
      roomCode: room.code,
      hostId: room.hostId,
      phase: room.game?.phase ?? 'lobby',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      botPrefillTarget: BOT_PREFILL_TABLE_SIZE,
      players: VisibilityService.publicPlayers(room),
      chatMessages: room.chatMessages.slice(-50),
      inviteUrl
    };
  }

  static publicGameState(room: GameRoom, now = Date.now(), inviteUrl?: string): PublicGameState {
    const game = room.game;
    const discardTop = game?.discardPile.at(-1);

    return {
      ...VisibilityService.roomState(room, inviteUrl),
      currentPlayerId: game ? TurnService.currentPlayerId(room) : undefined,
      turnReadyAt: game?.turnReadyAt,
      turnExpiresAt: game?.turnExpiresAt,
      turnTransitionDelayMs: game ? TURN_TRANSITION_DELAY_MS : undefined,
      roundStartedAt: game?.roundStartedAt,
      screwUnlockAt: game?.screwUnlockAt,
      screwUnlocked: game ? now >= game.screwUnlockAt : false,
      finalRound: game?.finalRound ?? false,
      screwCallerId: game?.screwCallerId,
      drawPileCount: game?.deck.length ?? 0,
      discardTop: discardTop ? toPublicCard(DeckService.getDefinition(discardTop)) : null,
      log: game?.log.slice(-80) ?? [],
      pausedReason: game?.pausedReason,
      winnerId: game?.winnerId
    };
  }

  static privatePlayerState(room: GameRoom, playerId: string, now = Date.now()): PrivatePlayerState {
    const game = room.game;
    const player = room.players.find((candidate) => candidate.id === playerId);
    const playerState = game?.playerStates[playerId];
    const drawn = game?.drawnCard?.playerId === playerId ? game.drawnCard.card : undefined;
    const drawnSource = game?.drawnCard?.playerId === playerId ? game.drawnCard.source : null;
    const isTurnReady = game ? TurnService.isTurnReady(room, now) : false;
    const isRoundEnded = game?.phase === 'roundEnded';
    const hand = playerState
      ? playerState.hand.map((card, index) => ({
          index,
          card: isRoundEnded ? toPublicCard(DeckService.getDefinition(card)) : null,
          visible: isRoundEnded,
          reason: isRoundEnded ? ('roundEnd' as const) : undefined
        }))
      : [];

    return {
      playerId,
      hand,
      drawnCard: drawn ? toPublicCard(DeckService.getDefinition(drawn)) : null,
      drawnCardSource: drawnSource,
      canAct: Boolean(game && game.phase !== 'paused' && isTurnReady && TurnService.currentPlayerId(room) === playerId && (game.phase === 'playing' || game.phase === 'action')),
      canDraw: Boolean(game && game.phase === 'playing' && isTurnReady && TurnService.currentPlayerId(room) === playerId && !game.drawnCard && !game.pendingAction),
      canTakeGround: Boolean(game && game.phase === 'playing' && isTurnReady && TurnService.currentPlayerId(room) === playerId && !game.drawnCard && !game.pendingAction && game.discardPile.length > 0),
      canCallScrew: Boolean(game && game.phase === 'playing' && isTurnReady && now >= game.screwUnlockAt && !game.finalRound),
      canPlayThief: Boolean(game && game.phase === 'playing' && isTurnReady && game.finalRound && TurnService.currentPlayerId(room) === playerId && playerState?.hand.some((card) => card.defId === 'thief')),
      needsInitialPeek: Boolean(game && game.phase === 'initialPeek' && player && !player.initialPeekDone)
    };
  }

  private static publicPlayers(room: GameRoom): PublicPlayer[] {
    return room.players.map((player, seatIndex) => ({
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
      isBot: player.isBot,
      connected: player.connected,
      handSize: room.game?.playerStates[player.id]?.hand.length ?? 0,
      penaltyPoints: player.penaltyPoints,
      warningCount: player.warningCount,
      initialPeekDone: player.initialPeekDone,
      seatIndex
    }));
  }
}
