import { FINAL_ROUND_INCLUDE_CALLER, SCREW_UNLOCK_MS, TURN_TRANSITION_DELAY_MS } from './Constants';
import type { GameRoom } from './Types';

export class TurnService {
  static currentPlayerId(room: GameRoom): string | undefined {
    const game = room.game;
    if (!game) {
      return undefined;
    }
    return game.turnOrder[game.currentTurnIndex];
  }

  static assertPlayersTurn(room: GameRoom, playerId: string): void {
    const current = TurnService.currentPlayerId(room);
    if (current !== playerId) {
      throw new Error('It is not your turn.');
    }
  }

  static isTurnReady(room: GameRoom, now = Date.now()): boolean {
    return Boolean(room.game && now >= room.game.turnReadyAt);
  }

  static assertTurnReady(room: GameRoom, now = Date.now()): void {
    if (!TurnService.isTurnReady(room, now)) {
      throw new Error('Next turn is starting soon.');
    }
  }

  static isScrewUnlocked(room: GameRoom, now = Date.now()): boolean {
    return Boolean(room.game && now >= room.game.screwUnlockAt);
  }

  static callScrew(room: GameRoom, callerId: string, now = Date.now()): void {
    const game = TurnService.requireGame(room);
    if (game.finalRound) {
      throw new Error('Screw has already been called.');
    }
    if (!TurnService.isScrewUnlocked(room, now)) {
      throw new Error('Screw is still locked.');
    }

    const callerIndex = game.turnOrder.indexOf(callerId);
    if (callerIndex === -1) {
      throw new Error('Caller is not in this round.');
    }

    const afterCaller = [
      ...game.turnOrder.slice(callerIndex + 1),
      ...game.turnOrder.slice(0, callerIndex)
    ];

    game.finalRound = true;
    game.screwCallerId = callerId;
    game.finalTurnQueue = FINAL_ROUND_INCLUDE_CALLER ? [...afterCaller, callerId] : afterCaller;
    game.log.push(`${room.players.find((player) => player.id === callerId)?.nickname ?? 'A player'} called Screw.`);

    if (game.finalTurnQueue.length === 0) {
      game.phase = 'roundEnded';
      return;
    }

    game.currentTurnIndex = game.turnOrder.indexOf(game.finalTurnQueue[0]);
    game.turnReadyAt = now + TURN_TRANSITION_DELAY_MS;
    game.drawnCard = undefined;
    game.pendingAction = undefined;
    game.phase = 'playing';
  }

  static endTurn(room: GameRoom): boolean {
    const game = TurnService.requireGame(room);
    game.drawnCard = undefined;
    game.pendingAction = undefined;

    if (game.finalRound) {
      const current = TurnService.currentPlayerId(room);
      if (game.finalTurnQueue[0] === current) {
        game.finalTurnQueue.shift();
      } else if (current) {
        game.finalTurnQueue = game.finalTurnQueue.filter((playerId) => playerId !== current);
      }

      if (game.finalTurnQueue.length === 0) {
        game.phase = 'roundEnded';
        return true;
      }

      game.currentTurnIndex = game.turnOrder.indexOf(game.finalTurnQueue[0]);
      game.turnReadyAt = Date.now() + TURN_TRANSITION_DELAY_MS;
      game.phase = 'playing';
      return false;
    }

    game.currentTurnIndex = (game.currentTurnIndex + 1) % game.turnOrder.length;
    game.turnReadyAt = Date.now() + TURN_TRANSITION_DELAY_MS;
    game.phase = 'playing';
    return false;
  }

  static requireGame(room: GameRoom) {
    if (!room.game) {
      throw new Error('Game has not started.');
    }
    return room.game;
  }

  static millisecondsUntilUnlock(room: GameRoom, now = Date.now()): number {
    const game = TurnService.requireGame(room);
    return Math.max(0, game.screwUnlockAt - now);
  }

  static forceUnlock(room: GameRoom): void {
    const game = TurnService.requireGame(room);
    game.screwUnlockAt = Date.now() - SCREW_UNLOCK_MS;
  }
}
