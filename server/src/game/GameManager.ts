import { randomInt } from 'node:crypto';
import {
  ALLOW_MATCH_DISCARD,
  INITIAL_PEEK_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCREW_UNLOCK_MS,
  START_WITH_HOST,
  WRONG_MATCH_PENALTY_POINTS
} from './Constants';
import { DeckService } from './DeckService';
import { ActionService } from './ActionService';
import { RoomManager } from './RoomManager';
import { ScoringService } from './ScoringService';
import { TurnService } from './TurnService';
import type { ActionPrompt, PublicCard, RevealedCard, RoundEndedPayload } from '../../../shared/types';
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
    if (room.hostId !== hostId) {
      throw new Error('Only the host can start the game.');
    }
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      throw new Error('Screw starts with 4 to 6 players.');
    }
    if (room.players.some((player) => !player.connected && !player.isBot)) {
      throw new Error('All seated players must be connected before starting.');
    }

    this.roomManager.resetPlayersForRound(room);
    const deck = DeckService.shuffle(DeckService.buildDeck());
    const playerStates = Object.fromEntries(
      room.players.map((player) => [
        player.id,
        {
          playerId: player.id,
          hand: Array.from({ length: 4 }, () => DeckService.draw(deck))
        }
      ])
    );
    const discardPile = [DeckService.draw(deck)];
    const turnOrder = room.players.map((player) => player.id);
    const currentTurnIndex = START_WITH_HOST ? Math.max(0, turnOrder.indexOf(room.hostId)) : randomInt(turnOrder.length);

    room.game = {
      phase: 'initialPeek',
      deck,
      discardPile,
      playerStates,
      turnOrder,
      currentTurnIndex,
      turnReadyAt: now,
      roundStartedAt: now,
      screwUnlockAt: now + SCREW_UNLOCK_MS,
      finalRound: false,
      finalTurnQueue: [],
      log: ['Round started. Choose 2 cards to peek, then remember them.']
    };

    return { room };
  }

  chooseInitialPeek(roomCode: string, playerId: string, cardIndexes: number[]): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    const player = this.roomManager.requirePlayer(room, playerId);
    if (game.phase !== 'initialPeek') {
      throw new Error('Initial peek is not active.');
    }
    if (player.initialPeekDone) {
      throw new Error('You already chose your initial peek.');
    }

    const indexes = [...new Set(cardIndexes)];
    if (indexes.length !== INITIAL_PEEK_COUNT) {
      throw new Error(`Choose exactly ${INITIAL_PEEK_COUNT} cards.`);
    }

    const playerState = game.playerStates[playerId];
    const reveals = indexes.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= playerState.hand.length) {
        throw new Error('Card index is not valid.');
      }
      return {
        ownerId: playerId,
        index,
        card: ActionService.publicCard(playerState.hand[index])
      };
    });

    player.initialPeekDone = true;
    game.log.push(`${player.nickname} finished initial peek.`);
    if (room.players.every((candidate) => candidate.initialPeekDone)) {
      game.phase = 'playing';
      game.turnReadyAt = Date.now();
      game.log.push(`${room.players.find((candidate) => candidate.id === TurnService.currentPlayerId(room))?.nickname ?? 'First player'} starts.`);
    }

    return { room, reveals };
  }

  drawCard(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    if (game.drawnCard) {
      throw new Error('You already drew a card.');
    }
    this.recycleIfNeeded(room);
    const card = DeckService.draw(game.deck);
    game.drawnCard = { playerId, card, source: 'deck' };
    game.log.push(`${this.playerName(room, playerId)} drew from the deck.`);
    return { room, drawnCard: ActionService.publicCard(card), drawnCardSource: 'deck' };
  }

  takeGroundCard(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    if (game.drawnCard) {
      throw new Error('You already chose a card this turn.');
    }
    const card = game.discardPile.pop();
    if (!card) {
      throw new Error('No ground card is available.');
    }
    game.drawnCard = { playerId, card, source: 'ground' };
    game.log.push(`${this.playerName(room, playerId)} took from the ground.`);
    return { room, drawnCard: ActionService.publicCard(card), drawnCardSource: 'ground' };
  }

  keepDrawnCard(roomCode: string, playerId: string, replaceIndex: number): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.assertPlayingTurn(room, playerId);
    const drawn = this.requireDrawnBy(room, playerId);
    const playerState = game.playerStates[playerId];
    this.assertCardIndex(playerState.hand, replaceIndex);

    const oldCard = playerState.hand[replaceIndex];
    playerState.hand[replaceIndex] = drawn.card;
    game.discardPile.push(oldCard);
    game.drawnCard = undefined;
    game.log.push(drawn.source === 'ground' ? `${this.playerName(room, playerId)} swapped with the ground.` : `${this.playerName(room, playerId)} kept the drawn card.`);
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
    if (drawn.source === 'ground') {
      throw new Error('A ground card must replace one of your cards.');
    }
    game.discardPile.push(drawn.card);
    game.drawnCard = undefined;
    game.log.push(`${this.playerName(room, playerId)} put the card on the ground.`);
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
    if (game.phase !== 'playing') {
      throw new Error('Screw can only be called during active play.');
    }
    TurnService.assertTurnReady(room);
    TurnService.callScrew(room, playerId, now);
    if (room.game?.phase === 'roundEnded') {
      return this.finishRound(room);
    }
    return { room };
  }

  playThief(roomCode: string, playerId: string): EngineResult {
    const room = this.roomManager.requireRoom(roomCode);
    TurnService.assertTurnReady(room);
    const result = ActionService.playThiefFromHand(room, playerId);
    return this.applyActionResult(room, result);
  }

  restartRound(roomCode: string, hostId: string): EngineResult {
    return this.startGame(roomCode, hostId);
  }

  matchDiscard(roomCode: string, playerId: string, cardIndex: number): EngineResult {
    if (!ALLOW_MATCH_DISCARD) {
      throw new Error('Match discard is disabled for this table.');
    }
    const room = this.roomManager.requireRoom(roomCode);
    const game = TurnService.requireGame(room);
    this.roomManager.requirePlayer(room, playerId);
    if (game.phase !== 'playing') {
      throw new Error('Match discard is only available during active play.');
    }

    const top = game.discardPile.at(-1);
    if (!top) {
      throw new Error('No discard card is available to match.');
    }
    const topDef = DeckService.getDefinition(top);
    if (topDef.type !== 'number') {
      throw new Error('You can only match number cards.');
    }

    const playerState = game.playerStates[playerId];
    this.assertCardIndex(playerState.hand, cardIndex);
    const selected = playerState.hand[cardIndex];
    const selectedDef = DeckService.getDefinition(selected);
    const player = this.roomManager.requirePlayer(room, playerId);

    if (selectedDef.type === 'number' && selectedDef.rank === topDef.rank) {
      const [removed] = playerState.hand.splice(cardIndex, 1);
      game.discardPile.push(removed);
      game.log.push(`${player.nickname} matched the discard and dropped a card.`);
      return { room };
    }

    player.penaltyPoints += WRONG_MATCH_PENALTY_POINTS;
    game.log.push(`${player.nickname} missed a match discard and took +${WRONG_MATCH_PENALTY_POINTS}.`);
    return { room };
  }

  finishRound(room: GameRoom): EngineResult {
    const game = TurnService.requireGame(room);
    const scores = ScoringService.calculate(room);
    const winner = scores.find((score) => score.isWinner);
    game.phase = 'roundEnded';
    game.scores = scores;
    game.winnerId = winner?.playerId;
    game.drawnCard = undefined;
    game.pendingAction = undefined;
    game.log.push(`${winner?.nickname ?? 'A player'} wins the round.`);
    return {
      room,
      roundEnded: {
        scores,
        winnerId: winner?.playerId ?? scores[0]?.playerId,
        screwCallerId: game.screwCallerId
      }
    };
  }

  private applyActionResult(room: GameRoom, result: ActionResult): EngineResult {
    if (result.log?.length) {
      room.game?.log.push(...result.log);
    }
    if (result.endTurn) {
      const ended = TurnService.endTurn(room);
      return this.afterTurnResult(room, {
        reveals: result.reveals,
        prompt: result.prompt,
        roundEnded: ended
      });
    }
    return { room, reveals: result.reveals, prompt: result.prompt };
  }

  private afterTurnResult(room: GameRoom, partial: { reveals?: RevealedCard[]; prompt?: ActionPrompt; roundEnded?: boolean }): EngineResult {
    if (partial.roundEnded) {
      const ended = this.finishRound(room);
      return {
        ...ended,
        reveals: partial.reveals,
        prompt: partial.prompt
      };
    }
    return { room, reveals: partial.reveals, prompt: partial.prompt };
  }

  private assertPlayingTurn(room: GameRoom, playerId: string): void {
    const game = TurnService.requireGame(room);
    if (game.phase !== 'playing') {
      throw new Error('The game is not ready for that move.');
    }
    TurnService.assertPlayersTurn(room, playerId);
    TurnService.assertTurnReady(room);
  }

  private requireDrawnBy(room: GameRoom, playerId: string) {
    const drawn = room.game?.drawnCard;
    if (!drawn || drawn.playerId !== playerId) {
      throw new Error('Draw a card first.');
    }
    return drawn;
  }

  private assertCardIndex(hand: CardInstance[], index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
      throw new Error('Card index is not valid.');
    }
  }

  private recycleIfNeeded(room: GameRoom): void {
    const game = TurnService.requireGame(room);
    if (game.deck.length > 0) {
      return;
    }
    if (game.discardPile.length <= 1) {
      throw new Error('No cards are available to draw.');
    }
    const top = game.discardPile.pop()!;
    game.deck = DeckService.shuffle(game.discardPile);
    game.discardPile = [top];
    game.log.push('Discard pile reshuffled into the draw pile.');
  }

  private playerName(room: GameRoom, playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.nickname ?? 'A player';
  }
}
