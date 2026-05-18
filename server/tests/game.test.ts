import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_DEFS, CARD_DEF_BY_ID, TOTAL_CARD_COUNT } from '../../shared/cardDefs';
import { VisibilityService } from '../src/game/VisibilityService';
import { DeckService } from '../src/game/DeckService';
import { GameManager } from '../src/game/GameManager';
import { RoomManager } from '../src/game/RoomManager';
import { TurnService } from '../src/game/TurnService';
import type { CardInstance, GameRoom } from '../src/game/Types';

let rooms: RoomManager;
let games: GameManager;

beforeEach(() => {
  rooms = new RoomManager();
  games = new GameManager(rooms);
});

describe('Screw game engine', () => {
  it('builds a 65-card deck', () => {
    const deck = DeckService.buildDeck();
    expect(deck).toHaveLength(65);
    expect(TOTAL_CARD_COUNT).toBe(65);
  });

  it('matches every card count in the definitions', () => {
    const deck = DeckService.buildDeck();
    for (const def of CARD_DEFS) {
      expect(deck.filter((card) => card.defId === def.id)).toHaveLength(def.count);
    }
  });

  it('does not start with less than 2 or more than 6 players', () => {
    const room = createRoom(1);
    expect(() => games.startGame(room.code, room.hostId)).toThrow();

    const fullRoom = createRoom(6);
    expect(() => rooms.joinRoom(fullRoom.code, 'Seven', 's7')).toThrow(/full/);
  });

  it('deals 4 cards to every player', () => {
    const room = startReadyRound();
    for (const player of room.players) {
      expect(room.game!.playerStates[player.id].hand).toHaveLength(4);
    }
  });

  it('starts with 2 players', () => {
    const room = startReadyRound(2);
    expect(room.players).toHaveLength(2);
    expect(room.game!.phase).toBe('playing');
  });

  it('initial peek reveals exactly 2 cards to the choosing player', () => {
    const room = createRoom(4);
    games.startGame(room.code, room.hostId);
    const result = games.chooseInitialPeek(room.code, room.players[1].id, [0, 1]);
    expect(result.reveals).toHaveLength(2);
    expect(result.reveals?.every((card) => card.ownerId === room.players[1].id)).toBe(true);
    expect(VisibilityService.privatePlayerState(room, room.players[2].id).hand.every((slot) => !slot.visible && !slot.card)).toBe(true);
  });

  it('7 and 8 reveal one own card only', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;

    forceDrawn(room, actor, 'card_7');
    let result = games.useDrawnCardAction(room.code, actor);
    expect(result.prompt?.type).toBe('selectOwnCard');
    result = games.chooseOwnCard(room.code, actor, 0);
    expect(result.reveals).toEqual([expect.objectContaining({ ownerId: actor, index: 0 })]);

    setCurrent(room, actor);
    forceDrawn(room, actor, 'card_8');
    games.useDrawnCardAction(room.code, actor);
    result = games.chooseOwnCard(room.code, actor, 1);
    expect(result.reveals).toEqual([expect.objectContaining({ ownerId: actor, index: 1 })]);
  });

  it('9 and 10 reveal one other-player card only', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    const target = room.players[1].id;

    forceDrawn(room, actor, 'card_9');
    games.useDrawnCardAction(room.code, actor);
    let result = games.chooseTargetCard(room.code, actor, target, 0);
    expect(result.reveals).toEqual([expect.objectContaining({ ownerId: target, index: 0 })]);

    setCurrent(room, actor);
    forceDrawn(room, actor, 'card_10');
    games.useDrawnCardAction(room.code, actor);
    result = games.chooseTargetCard(room.code, actor, target, 1);
    expect(result.reveals).toEqual([expect.objectContaining({ ownerId: target, index: 1 })]);
  });

  it('uses the correct Screw Driver and Screw values', () => {
    expect(CARD_DEF_BY_ID.screw_driver.value).toBe(0);
    expect(CARD_DEF_BY_ID.screw.value).toBe(35);
  });

  it('calling Screw seals the round for everyone instantly', () => {
    const room = startReadyRound(4, 1000);
    const caller = room.players[0].id;
    const result = games.callScrew(room.code, caller, 1000 + 600_000);
    expect(room.game!.phase).toBe('roundEnded');
    expect(result.roundEnded?.scores.length).toBe(4);
    expect(room.game!.screwCallerId).toBe(caller);
  });

  it('See & Swap allows only one swap', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    const target = room.players[1].id;
    forceDrawn(room, actor, 'see_swap');
    games.useDrawnCardAction(room.code, actor);
    games.chooseTargetCard(room.code, actor, target, 0);
    games.confirmSwap(room.code, actor, { swap: true, targetPlayerId: target, targetCardIndex: 0, ownCardIndex: 0 });
    expect(room.game!.pendingAction).toBeUndefined();
    expect(() => games.confirmSwap(room.code, actor, { swap: true, targetPlayerId: target, targetCardIndex: 1, ownCardIndex: 1 })).toThrow();
  });

  it('Take & Give keeps card counts the same for both players', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    const target = room.players[1].id;
    const actorCount = room.game!.playerStates[actor].hand.length;
    const targetCount = room.game!.playerStates[target].hand.length;

    forceDrawn(room, actor, 'take_give');
    games.useDrawnCardAction(room.code, actor);
    games.chooseTargetPlayer(room.code, actor, target);
    games.chooseTargetCard(room.code, actor, target, 0);
    games.chooseOwnCard(room.code, actor, 0);

    expect(room.game!.playerStates[actor].hand).toHaveLength(actorCount);
    expect(room.game!.playerStates[target].hand).toHaveLength(targetCount);
  });

  it('Basra reduces the current player hand by 1', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    const before = room.game!.playerStates[actor].hand.length;
    forceDrawn(room, actor, 'basra');
    games.useDrawnCardAction(room.code, actor);
    games.chooseOwnCard(room.code, actor, 0);
    expect(room.game!.playerStates[actor].hand).toHaveLength(before - 1);
  });

  it('Just Take reduces actor hand by 1 and increases target hand by 1', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    const target = room.players[1].id;
    const actorBefore = room.game!.playerStates[actor].hand.length;
    const targetBefore = room.game!.playerStates[target].hand.length;
    forceDrawn(room, actor, 'just_take');
    games.useDrawnCardAction(room.code, actor);
    games.chooseTargetPlayer(room.code, actor, target);
    games.chooseOwnCard(room.code, actor, 0);
    expect(room.game!.playerStates[actor].hand).toHaveLength(actorBefore - 1);
    expect(room.game!.playerStates[target].hand).toHaveLength(targetBefore + 1);
  });

  it('Peek Around option A reveals 2 own cards', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    forceDrawn(room, actor, 'peek_around');
    games.useDrawnCardAction(room.code, actor);
    const result = games.chooseActionOption(room.code, actor, { option: 'own', cardIndexes: [0, 1] });
    expect(result.reveals).toHaveLength(2);
    expect(result.reveals?.every((reveal) => reveal.ownerId === actor)).toBe(true);
  });

  it('Peek Around option B reveals 1 card from each other player', () => {
    const room = startReadyRound();
    const actor = room.players[0].id;
    forceDrawn(room, actor, 'peek_around');
    games.useDrawnCardAction(room.code, actor);
    const result = games.chooseActionOption(room.code, actor, { option: 'others' });
    expect(result.reveals).toHaveLength(room.players.length - 1);
    expect(new Set(result.reveals?.map((reveal) => reveal.ownerId)).size).toBe(room.players.length - 1);
  });

  it('keeps Screw unlocked from the start', () => {
    const room = startReadyRound(4, 10_000);
    expect(TurnService.isScrewUnlocked(room, 10_000)).toBe(true);
    expect(TurnService.isScrewUnlocked(room, 10_001)).toBe(true);
  });

  it('queues a bracket reset once a player banks five cumulative round trophies', () => {
    const room = startReadyRound(2);
    const champ = room.players[0].id;
    room.matchWins[champ] = 4;
    room.game!.playerStates[champ].hand = [card('minus_1'), card('minus_1'), card('minus_1'), card('screw_driver')];
    room.game!.playerStates[room.players[1].id].hand = [card('plus_20'), card('plus_20'), card('plus_20'), card('screw')];

    games.finishRound(room);

    expect(room.matchWins[champ]).toBe(5);
    expect(room.pendingMatchReset).toBe(true);
  });

  it('does not skip or warn a player after turn timeout handling', () => {
    const room = startReadyRound(2, 1000);
    const player = TurnService.currentPlayerId(room)!;
    room.game!.turnExpiresAt = 1000;
    const result = games.handleTurnTimeout(room.code, player, 2000);
    expect(room.players.find((candidate) => candidate.id === player)?.warningCount).toBe(0);
    expect(TurnService.currentPlayerId(room)).toBe(player);
    expect(result.room.game!.phase).toBe('playing');
  });

  it('calculates scores correctly', () => {
    const room = startReadyRound();
    const player = room.players[0].id;
    room.game!.playerStates[player].hand = [card('card_1'), card('screw_driver'), card('minus_1'), card('plus_20')];
    const result = games.finishRound(room);
    const score = result.roundEnded!.scores.find((line) => line.playerId === player)!;
    expect(score.total).toBe(20);
  });

  it('ignores a wrong match discard guess without warnings or penalties', () => {
    const room = startReadyRound();
    const player = room.players[0].id;
    room.game!.discardPile = [card('card_5')];
    room.game!.playerStates[player].hand[0] = card('card_4');

    games.matchDiscard(room.code, player, 0);

    expect(room.players[0].warningCount).toBe(0);
    expect(room.players[0].penaltyPoints).toBe(0);
    games.matchDiscard(room.code, player, 0);
    expect(room.players[0].warningCount).toBe(0);
    expect(room.players[0].penaltyPoints).toBe(0);
    expect(room.game!.playerStates[player].hand).toHaveLength(4);
  });

  it('takes from ground as a simple swap without activating actions', () => {
    const room = startReadyRound();
    const player = room.players[0].id;
    const oldCard = card('card_9');
    const groundCard = card('card_7');
    room.game!.playerStates[player].hand[2] = oldCard;
    room.game!.discardPile = [groundCard];

    const result = games.takeGroundCard(room.code, player);
    expect(result.drawnCard?.id).toBe('card_7');
    expect(room.game!.drawnCard?.source).toBe('ground');
    expect(() => games.useDrawnCardAction(room.code, player)).toThrow(/Ground cards/);
    expect(() => games.discardDrawnCard(room.code, player)).toThrow(/ground card/i);

    games.keepDrawnCard(room.code, player, 2);
    expect(room.game!.playerStates[player].hand[2].defId).toBe('card_7');
    expect(room.game!.discardPile.at(-1)?.defId).toBe('card_9');
  });

  it('fills missing lobby seats with bots so a solo host can start', () => {
    const room = rooms.createRoom('P1', 's1');
    rooms.fillWithBots(room.code, room.hostId);

    expect(room.players).toHaveLength(4);
    expect(room.players.filter((player) => player.isBot)).toHaveLength(3);
    expect(() => games.startGame(room.code, room.hostId)).not.toThrow();
  });

  it('drops match standings once the bracket is over and host restarts', () => {
    const room = startReadyRound(2);
    room.matchWins[room.players[0].id] = 5;
    room.pendingMatchReset = true;

    games.restartRound(room.code, room.hostId);

    expect(room.matchWins).toEqual({});
    expect(room.pendingMatchReset).toBe(false);
    expect(room.game?.phase).toBe('initialPeek');
  });

  it('never leaks hidden cards in public game state', () => {
    const room = startReadyRound();
    const publicState = VisibilityService.publicGameState(room);
    const raw = JSON.stringify(publicState);
    expect(raw).not.toContain('playerStates');
    expect(raw).not.toContain('instanceId');
    expect(publicState.players.every((player) => !('hand' in player))).toBe(true);
  });
});

function createRoom(playerCount: number): GameRoom {
  const room = rooms.createRoom('P1', 's1');
  for (let index = 2; index <= playerCount; index += 1) {
    rooms.joinRoom(room.code, `P${index}`, `s${index}`);
  }
  return room;
}

function startReadyRound(playerCount = 4, now = Date.now()): GameRoom {
  const room = createRoom(playerCount);
  games.startGame(room.code, room.hostId, now);
  for (const player of room.players) {
    games.chooseInitialPeek(room.code, player.id, [0, 1]);
  }
  return room;
}

function card(defId: string): CardInstance {
  return { defId, instanceId: `test-${defId}-${Math.random()}` };
}

function forceDrawn(room: GameRoom, playerId: string, defId: string): void {
  setCurrent(room, playerId);
  room.game!.phase = 'playing';
  room.game!.drawnCard = { playerId, card: card(defId), source: 'deck' };
  room.game!.pendingAction = undefined;
}

function setCurrent(room: GameRoom, playerId: string): void {
  room.game!.currentTurnIndex = room.game!.turnOrder.indexOf(playerId);
  room.game!.turnReadyAt = 0;
}
