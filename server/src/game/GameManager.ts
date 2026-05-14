import { GAMES_PER_MATCH } from '../../../shared/gameConfig';
import { randomInt } from 'node:crypto';
import {
  ALLOW_MATCH_DISCARD,
  ILLEGAL_ATTEMPT_PENALTY_POINTS,
  ILLEGAL_WARNING_LIMIT,
  INITIAL_PEEK_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCREW_UNLOCK_MS,
  START_WITH_HOST,
  TIMEOUT_PENALTY_POINTS,
  TURN_TIMEOUT_MS,
  WRONG_MATCH_PENALTY_POINTS
} from './Constants';
import { DeckService } from './DeckService';
import { ActionService } from './ActionService';
import { RoomManager } from './RoomManager';
import { ScoringService } from './ScoringService';
import { TurnService } from './TurnService';
import type { ActionPrompt, MatchStandingLine, PublicCard, RevealedCard, RoundEndedPayload } from '../../../shared/types';
import type { ActionResult, CardInstance, GameRoom } from './Types';

export interface EngineResult {
  room: GameRoom;
  drawnCard?: PublicCard;
  drawnCardSource?: 'deck' | 'ground';
  reveals?: RevealedCard[];
  prompt?: ActionPrompt;
  roundEnded?: RoundEndedPayload;
  log?: string[];
}

export class GameManager {
  constructor(private readonly roomManager: RoomManager) {}

  startGame(roomCode: string, hostId: string, now = Date.now()): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    if (room.hostId !== hostId) throw new Error('بس الهوست يقدر يبدأ الجيم.');
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) throw new Error('سكرو بيتلعب من 2 لـ 6 لاعيبة.');
    if (room.players.some((p) => !p.connected && !p.isBot)) throw new Error('كل اللاعيبة لازم يكونوا متصلين.');

    this.roomManager.resetPlayersForRound(room);
    const deck = DeckService.shuffle(DeckService.buildDeck());
    const playerStates = Object.fromEntries(
      room.players.map((p) => [p.id, { playerId: p.id, hand: Array.from({ length: 4 }, () => DeckService.draw(deck)) }])
    );
    const discardPile = [DeckService.draw(deck)];
    const turnOrder = room.players.map((p) => p.id);
    const currentTurnIndex = START_WITH_HOST ? Math.max(0, turnOrder.indexOf(room.hostId)) : randomInt(turnOrder.length);

    room.game = {
      phase: 'initialPeek',
      deck,
      discardPile,
      playerStates,
      turnOrder,
      currentTurnIndex,
      turnReadyAt: now,
      turnExpiresAt: now + TURN_TIMEOUT_MS,
      roundStartedAt: now,
      screwUnlockAt: now + SCREW_UNLOCK_MS,
      finalRound: false,
      finalTurnQueue: [],
      log: ['ابدأ — اختار كارتين تبصهم وافتكرهم.'],
      peekMarkers: [],
    };
    return { room };
  }

  chooseInitialPeek(roomCode: string, playerId: string, cardIndexes: number[]): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    const player = this.roomManager.requirePlayer(room, playerId);
    if (game.phase !== 'initialPeek') throw new Error('مش وقت البصة الأولية.');
    if (player.initialPeekDone) throw new Error('انت بصيت الأول.');

    const indexes = [...new Set(cardIndexes)];
    if (indexes.length !== INITIAL_PEEK_COUNT) throw new Error(`اختار ${INITIAL_PEEK_COUNT} كروت بالظبط.`);

    const playerState = game.playerStates[playerId];
    const reveals = indexes.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= playerState.hand.length) throw new Error('رقم الكارت مش صح.');
      return { ownerId: playerId, index, card: ActionService.publicCard(playerState.hand[index]) };
    });

    player.initialPeekDone = true;
    game.log.push(`${player.nickname} خلص البصة الأولية.`);
    if (room.players.every((p) => p.initialPeekDone)) {
      game.phase = 'playing';
      game.turnReadyAt = Date.now();
      game.turnExpiresAt = game.turnReadyAt + TURN_TIMEOUT_MS;
      const firstPlayer = room.players.find((p) => p.id === TurnService.currentPlayerId(room));
      game.log.push(`${firstPlayer?.nickname ?? 'الأول'} يبدأ.`);
    }
    return { room, reveals };
  }

  drawCard(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    if (game.drawnCard) throw new Error('انت سحبت كارت بالفعل.');
    this.recycleIfNeeded(room);
    const card = DeckService.draw(game.deck);
    game.drawnCard = { playerId, card, source: 'deck' };
    game.log.push(`${this.playerName(room, playerId)} سحب من القومة.`);
    return { room, drawnCard: ActionService.publicCard(card), drawnCardSource: 'deck' };
  }

  takeGroundCard(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    if (game.drawnCard) throw new Error('انت اخترت كارت بالفعل.');
    const card = game.discardPile.pop();
    if (!card) throw new Error('مفيش كارت على الأرض.');
    game.drawnCard = { playerId, card, source: 'ground' };
    game.log.push(`${this.playerName(room, playerId)} أخد من الأرض.`);
    return { room, drawnCard: ActionService.publicCard(card), drawnCardSource: 'ground' };
  }

  keepDrawnCard(roomCode: string, playerId: string, replaceIndex: number): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    const drawn = this.requireDrawnBy(room, playerId);
    const playerState = game.playerStates[playerId];
    this.assertCardIndex(playerState.hand, replaceIndex);

    // Clear peek marker for replaced slot
    ActionService.clearMarkersForSlot(room, playerId, replaceIndex);

    const oldCard = playerState.hand[replaceIndex];
    playerState.hand[replaceIndex] = drawn.card;
    game.discardPile.push(oldCard);
    game.drawnCard = undefined;
    const msg = drawn.source === 'ground' ? `${this.playerName(room, playerId)} اتبادل مع الأرض.` : `${this.playerName(room, playerId)} احتفظ بالكارت.`;
    game.log.push(msg);
    const ended = TurnService.endTurn(room);
    return this.afterTurnResult(room, {
      reveals: [{ ownerId: playerId, index: replaceIndex, card: ActionService.publicCard(drawn.card) }],
      roundEnded: ended
    });
  }

  discardDrawnCard(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    const drawn = this.requireDrawnBy(room, playerId);

    // ── MANDATORY ACTION: if card has an effect, force it ──────────────
    if (drawn.source === 'deck') {
      const def = DeckService.getDefinition(drawn.card);
      if (def.effectType !== 'none' && def.effectType !== 'thief') {
        // Auto-trigger the action instead of discarding
        const result = ActionService.startDrawnCardAction(room, playerId);
        return this.applyActionResult(room, result);
      }
    }

    game.discardPile.push(drawn.card);
    game.drawnCard = undefined;
    game.log.push(`${this.playerName(room, playerId)} رمى الكارت على الأرض.`);
    const ended = TurnService.endTurn(room);
    return this.afterTurnResult(room, { roundEnded: ended });
  }

  useDrawnCardAction(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.startDrawnCardAction(room, playerId);
    return this.applyActionResult(room, result);
  }

  chooseOwnCard(roomCode: string, playerId: string, cardIndex: number): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.chooseOwnCard(room, playerId, cardIndex);
    return this.applyActionResult(room, result);
  }

  chooseTargetPlayer(roomCode: string, playerId: string, targetPlayerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.chooseTargetPlayer(room, playerId, targetPlayerId);
    return this.applyActionResult(room, result);
  }

  chooseTargetCard(roomCode: string, playerId: string, targetPlayerId: string, cardIndex: number): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.chooseTargetCard(room, playerId, targetPlayerId, cardIndex);
    return this.applyActionResult(room, result);
  }

  chooseActionOption(roomCode: string, playerId: string, payload: { option: string; cardIndexes?: number[]; targets?: Array<{ targetPlayerId: string; cardIndex: number }> }): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.chooseActionOption(room, playerId, payload);
    return this.applyActionResult(room, result);
  }

  confirmSwap(roomCode: string, playerId: string, payload: { swap: boolean; targetPlayerId?: string; targetCardIndex?: number; ownCardIndex?: number }): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const result = ActionService.confirmSwap(room, playerId, payload);
    return this.applyActionResult(room, result);
  }

  callScrew(roomCode: string, playerId: string, now = Date.now()): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    this.roomManager.requirePlayer(room, playerId);
    const game = TurnService.requireGame(room);
    if (game.phase !== 'playing') throw new Error('سكرو بس في وسط اللعب.');
    TurnService.assertTurnReady(room);
    TurnService.callScrew(room, playerId, now);
    return this.finishRound(room);
  }

  playThief(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    TurnService.assertTurnReady(room);
    const result = ActionService.playThiefFromHand(room, playerId);
    return this.applyActionResult(room, result);
  }

  restartRound(roomCode: string, hostId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    if (room.pendingMatchReset) {
      room.matchPoints = {};
      room.matchGamePoints = {};
      room.matchGamesPlayed = 0;
      room.pendingMatchReset = false;
    }
    return this.startGame(roomCode, hostId);
  }

  matchDiscard(roomCode: string, playerId: string, cardIndex: number): EngineResult {
    if (!ALLOW_MATCH_DISCARD) throw new Error('Match discard معطل.');
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.roomManager.requirePlayer(room, playerId);
    if (game.phase !== 'playing') throw new Error('Match discard بس في وسط اللعب.');
    const top = game.discardPile.at(-1);
    if (!top) throw new Error('مفيش كارت على الأرض.');
    const playerState = game.playerStates[playerId];
    this.assertCardIndex(playerState.hand, cardIndex);
    const selected = playerState.hand[cardIndex];
    const topDef = DeckService.getDefinition(top);
    const selectedDef = DeckService.getDefinition(selected);
    if (topDef.type === 'number' && selectedDef.type === 'number' && selectedDef.rank === topDef.rank) {
      ActionService.clearMarkersForSlot(room, playerId, cardIndex);
      const [removed] = playerState.hand.splice(cardIndex, 1);
      game.discardPile.push(removed);
      game.log.push(`${this.playerName(room, playerId)} طابق الكارت ورماها.`);
      return { room };
    }
    // No penalty — just ignore
    return { room };
  }

  recordIllegalAttempt(roomCode: string, playerId: string, reason: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    // Warnings disabled — log only
    room.game?.log.push(`${this.playerName(room, playerId)}: ${reason}`);
    return { room };
  }

  handleTurnTimeout(roomCode: string, playerId: string, now = Date.now()): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    if (game.phase !== 'playing' && game.phase !== 'action') return { room };
    if (TurnService.currentPlayerId(room) !== playerId || now < game.turnExpiresAt) return { room };
    // Infinite timer — no timeout action
    return { room };
  }

  handleDisconnectState(room: GameRoom): EngineResult {
    if (!room.game || room.game.phase === 'lobby' || room.game.phase === 'roundEnded') return { room };
    const disconnectedHumans = room.players.filter((p) => !p.isBot && !p.connected).length;
    const activeSeats = room.players.filter((p) => p.connected || p.isBot).length;
    if (disconnectedHumans >= 2 || activeSeats < 2) {
      room.game.log.push('الجيم انتهى لأن لاعيبة اتقطعوا.');
      return this.finishRound(room);
    }
    return { room };
  }

  finishRound(room: GameRoom): EngineResult {
    const game = TurnService.requireGame(room);
    const scores = ScoringService.calculate(room);
    const winner = scores.find((s) => s.isWinner);
    game.phase = 'roundEnded';
    game.scores = scores;
    const roundWinnerId = winner?.playerId ?? scores[0]?.playerId;
    game.winnerId = roundWinnerId;

    for (const score of scores) {
      room.matchPoints[score.playerId] = (room.matchPoints[score.playerId] ?? 0) + score.total;
      if (!room.matchGamePoints[score.playerId]) room.matchGamePoints[score.playerId] = [];
      room.matchGamePoints[score.playerId].push(score.total);
    }
    room.matchGamesPlayed += 1;

    let matchWinnerId: string | undefined;
    if (room.matchGamesPlayed >= GAMES_PER_MATCH) {
      const sorted = Object.entries(room.matchPoints).sort((a, b) => a[1] - b[1]);
      matchWinnerId = sorted[0]?.[0];
      room.pendingMatchReset = true;
    }

    const matchStanding: MatchStandingLine[] = room.players
      .map((p) => ({ playerId: p.id, nickname: p.nickname, points: room.matchPoints[p.id] ?? 0, gamePoints: room.matchGamePoints[p.id] ?? [] }))
      .sort((a, b) => a.points - b.points);

    game.drawnCard = undefined;
    game.pendingAction = undefined;
    game.peekMarkers = [];
    game.log.push(`${winner?.nickname ?? 'لاعب'} كسب الجولة!`);

    return {
      room,
      roundEnded: { scores, winnerId: roundWinnerId, screwCallerId: game.screwCallerId, matchStanding, gamesPerMatch: GAMES_PER_MATCH, matchGamesPlayed: room.matchGamesPlayed, matchWinnerId }
    };
  }

  private applyActionResult(room: GameRoom, result: ActionResult): EngineResult {
    if (result.log?.length) room.game?.log.push(...result.log);
    // Apply peek markers to game state
    if (result.peekMarkers?.length) ActionService.applyPeekMarkers(room, result.peekMarkers);
    if (result.endTurn) {
      const ended = TurnService.endTurn(room);
      return this.afterTurnResult(room, { reveals: result.reveals, prompt: result.prompt, roundEnded: ended });
    }
    return { room, reveals: result.reveals, prompt: result.prompt };
  }

  private afterTurnResult(room: GameRoom, partial: { reveals?: RevealedCard[]; prompt?: ActionPrompt; roundEnded?: boolean }): EngineResult {
    if (partial.roundEnded) {
      const ended = this.finishRound(room);
      return { ...ended, reveals: partial.reveals, prompt: partial.prompt };
    }
    return { room, reveals: partial.reveals, prompt: partial.prompt };
  }

  private assertPlayingTurn(room: GameRoom, playerId: string): void {
    const game = TurnService.requireGame(room);
    if (game.phase !== 'playing') throw new Error('الجيم مش جاهز للحركة دي.');
    TurnService.assertPlayersTurn(room, playerId);
    TurnService.assertTurnReady(room);
  }

  private requireDrawnBy(room: GameRoom, playerId: string) {
    const drawn = room.game?.drawnCard;
    if (!drawn || drawn.playerId !== playerId) throw new Error('اسحب كارت الأول.');
    return drawn;
  }

  private assertCardIndex(hand: CardInstance[], index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) throw new Error('رقم الكارت مش صح.');
  }

  private recycleIfNeeded(room: GameRoom): void {
    const game = TurnService.requireGame(room);
    if (game.deck.length > 0) return;
    if (game.discardPile.length <= 1) throw new Error('مفيش كروت متاحة.');
    const top = game.discardPile.pop()!;
    game.deck = DeckService.shuffle(game.discardPile);
    game.discardPile = [top];
    game.log.push('الكروت اتخلطت من الأرض.');
  }

  private playerName(room: GameRoom, playerId: string): string {
    return room.players.find((p) => p.id === playerId)?.nickname ?? 'لاعب';
  }
}
