import { BOT_THINK_TIME_MAX_MS, BOT_THINK_TIME_MIN_MS } from './Constants';
import { DeckService } from './DeckService';
import { GameManager, type EngineResult } from './GameManager';
import { RoomManager } from './RoomManager';
import { TurnService } from './TurnService';
import type { CardInstance, GameRoom } from './Types';

type EmitGameResult = (result: EngineResult, actorId?: string) => void;

export class BotService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly roomManager: RoomManager,
    private readonly gameManager: GameManager
  ) {}

  schedule(roomCode: string, emit: EmitGameResult): void {
    if (this.timers.has(roomCode)) {
      return;
    }
    const room = this.roomManager.getRoom(roomCode);
    const readyAt = room?.game?.turnReadyAt ?? Date.now();
    const delay = Math.max(0, readyAt - Date.now()) + BotService.randomThinkTime();

    const timer = setTimeout(() => {
      this.timers.delete(roomCode);
      this.step(roomCode, emit);
    }, delay);

    this.timers.set(roomCode, timer);
  }

  private step(roomCode: string, emit: EmitGameResult): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room?.game || room.game.phase === 'paused' || room.game.phase === 'roundEnded') {
      return;
    }

    if (room.game.phase === 'initialPeek') {
      let changed = false;
      for (const bot of room.players.filter((player) => player.isBot && !player.initialPeekDone)) {
        this.gameManager.chooseInitialPeek(room.code, bot.id, [0, 1]);
        changed = true;
      }
      if (changed) {
        emit({ room });
      }
      this.scheduleIfBotTurn(room, emit);
      return;
    }

    this.scheduleIfBotTurn(room, emit);
  }

  private scheduleIfBotTurn(room: GameRoom, emit: EmitGameResult): void {
    if (!room.game || room.game.phase !== 'playing') {
      return;
    }

    const currentPlayerId = TurnService.currentPlayerId(room);
    const bot = room.players.find((player) => player.id === currentPlayerId && player.isBot);
    if (!bot) {
      return;
    }
    if (!TurnService.isTurnReady(room)) {
      this.schedule(room.code, emit);
      return;
    }

    try {
      const result = this.playBotTurn(room, bot.id);
      emit(result, bot.id);
      if (result.room.game?.phase === 'playing') {
        this.schedule(result.room.code, emit);
      }
    } catch (error) {
      room.game.log.push(`${bot.nickname} got confused and skipped.`);
      try {
        if (room.game.drawnCard?.playerId === bot.id && room.game.drawnCard.source === 'deck') {
          emit(this.gameManager.discardDrawnCard(room.code, bot.id), bot.id);
        } else {
          const ended = TurnService.endTurn(room);
          emit(ended ? this.gameManager.finishRound(room) : { room }, bot.id);
        }
      } catch {
        emit({ room }, bot.id);
      }
    }
  }

  private playBotTurn(room: GameRoom, botId: string): EngineResult {
    const game = room.game;
    if (!game) {
      return { room };
    }

    if (!game.finalRound && TurnService.isScrewUnlocked(room) && this.estimatedScore(room, botId) <= 7) {
      return this.gameManager.callScrew(room.code, botId);
    }

    const groundCard = game.discardPile.at(-1);
    const worstIndex = this.worstCardIndex(room, botId);
    const worstValue = this.cardValue(game.playerStates[botId].hand[worstIndex]);
    if (groundCard && (this.cardValue(groundCard) <= 4 || this.cardValue(groundCard) + 2 < worstValue)) {
      this.gameManager.takeGroundCard(room.code, botId);
      return this.gameManager.keepDrawnCard(room.code, botId, worstIndex);
    }

    this.gameManager.drawCard(room.code, botId);
    const drawn = game.drawnCard?.card;
    if (!drawn) {
      return { room };
    }

    const def = DeckService.getDefinition(drawn);
    const drawnValue = def.value;

    if (def.effectType !== 'none') {
      if (def.effectType === 'thief') {
        return this.gameManager.useDrawnCardAction(room.code, botId);
      }

      if (def.effectType === 'look_own') {
        this.gameManager.useDrawnCardAction(room.code, botId);
        return this.gameManager.chooseOwnCard(room.code, botId, this.firstCardIndex(room, botId));
      }

      if (def.effectType === 'look_other') {
        const target = room.players.find((player) => player.id !== botId);
        if (target && game.playerStates[target.id]?.hand.length) {
          this.gameManager.useDrawnCardAction(room.code, botId);
          return this.gameManager.chooseTargetCard(room.code, botId, target.id, 0);
        }
      }

      if (def.effectType === 'basra') {
        this.gameManager.useDrawnCardAction(room.code, botId);
        return this.gameManager.chooseOwnCard(room.code, botId, this.worstCardIndex(room, botId));
      }

      if (def.effectType === 'just_take') {
        const target = this.randomOpponent(room, botId);
        if (target) {
          this.gameManager.useDrawnCardAction(room.code, botId);
          this.gameManager.chooseTargetPlayer(room.code, botId, target.id);
          return this.gameManager.chooseOwnCard(room.code, botId, this.worstCardIndex(room, botId));
        }
      }

      if (def.effectType === 'take_give') {
        const target = this.randomOpponent(room, botId);
        if (target && game.playerStates[target.id]?.hand.length) {
          this.gameManager.useDrawnCardAction(room.code, botId);
          this.gameManager.chooseTargetPlayer(room.code, botId, target.id);
          this.gameManager.chooseTargetCard(room.code, botId, target.id, 0);
          return this.gameManager.chooseOwnCard(room.code, botId, this.worstCardIndex(room, botId));
        }
      }

      if (def.effectType === 'see_swap') {
        const target = this.randomOpponent(room, botId);
        if (target && game.playerStates[target.id]?.hand.length) {
          this.gameManager.useDrawnCardAction(room.code, botId);
          this.gameManager.chooseTargetCard(room.code, botId, target.id, 0);
          return this.gameManager.confirmSwap(room.code, botId, { swap: true, targetPlayerId: target.id, targetCardIndex: 0, ownCardIndex: this.worstCardIndex(room, botId) });
        }
      }

      if (def.effectType === 'peek_around') {
        this.gameManager.useDrawnCardAction(room.code, botId);
        if (game.playerStates[botId].hand.length >= 2) {
          return this.gameManager.chooseActionOption(room.code, botId, { option: 'own', cardIndexes: [0, 1] });
        }
        return this.gameManager.chooseActionOption(room.code, botId, { option: 'others' });
      }

      return this.gameManager.useDrawnCardAction(room.code, botId);
    }

    if (drawn.defId === 'screw' || drawn.defId === 'plus_20') {
      return this.gameManager.discardDrawnCard(room.code, botId);
    }

    if (drawnValue <= 4 || drawn.defId === 'screw_driver' || drawn.defId === 'minus_1' || drawnValue + 1 < worstValue) {
      return this.gameManager.keepDrawnCard(room.code, botId, this.worstCardIndex(room, botId));
    }

    return this.gameManager.discardDrawnCard(room.code, botId);
  }

  private worstCardIndex(room: GameRoom, playerId: string): number {
    const hand = room.game?.playerStates[playerId]?.hand ?? [];
    return hand.reduce((worstIndex, card, index) => (this.cardValue(card) > this.cardValue(hand[worstIndex]) ? index : worstIndex), 0);
  }

  private firstCardIndex(room: GameRoom, playerId: string): number {
    return room.game?.playerStates[playerId]?.hand.length ? 0 : -1;
  }

  private estimatedScore(room: GameRoom, playerId: string): number {
    return room.game?.playerStates[playerId]?.hand.reduce((sum, card) => sum + this.cardValue(card), 0) ?? 99;
  }

  private cardValue(card: CardInstance): number {
    return DeckService.getDefinition(card).value;
  }

  private randomOpponent(room: GameRoom, playerId: string) {
    const opponents = room.players.filter((player) => player.id !== playerId && (player.connected || player.isBot) && (room.game?.playerStates[player.id]?.hand.length ?? 0) > 0);
    return opponents[Math.floor(Math.random() * opponents.length)];
  }

  private static randomThinkTime(): number {
    return BOT_THINK_TIME_MIN_MS + Math.floor(Math.random() * (BOT_THINK_TIME_MAX_MS - BOT_THINK_TIME_MIN_MS + 1));
  }
}
