import { toPublicCard } from './CardDefs';
import { DeckService } from './DeckService';
import { TurnService } from './TurnService';
import type { ActionResult, CardInstance, GameRoom, PendingAction, PlayerGameState } from './Types';
import type { ActionPrompt, PublicCard } from '../../../shared/types';

interface ActionOptionPayload {
  option: string;
  cardIndexes?: number[];
  targets?: Array<{ targetPlayerId: string; cardIndex: number }>;
}

interface ConfirmSwapPayload {
  swap: boolean;
  targetPlayerId?: string;
  targetCardIndex?: number;
  ownCardIndex?: number;
}

export class ActionService {
  static startDrawnCardAction(room: GameRoom, actorId: string): ActionResult {
    const game = TurnService.requireGame(room);
    TurnService.assertPlayersTurn(room, actorId);
    if (!game.drawnCard || game.drawnCard.playerId !== actorId) {
      throw new Error('Draw a card before using an action.');
    }
    if (game.drawnCard.source !== 'deck') {
      throw new Error('Ground cards cannot activate actions.');
    }

    const actionCard = game.drawnCard.card;
    const def = DeckService.getDefinition(actionCard);
    const actorName = ActionService.playerName(room, actorId);

    switch (def.effectType) {
      case 'look_own':
        game.phase = 'action';
        game.pendingAction = { type: 'look_own', actorId, actionCard };
        return { prompt: ActionService.prompt('selectOwnCard', actorId, 'Choose one of your cards to peek.') };
      case 'look_other':
        game.phase = 'action';
        game.pendingAction = { type: 'look_other', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetCard', actorId, 'Choose another player card to peek.') };
      case 'thief':
        if (!game.finalRound || !game.screwCallerId) {
          ActionService.discardDrawnAction(room, actorId);
          return { endTurn: true, log: [`${actorName} used Thief before Screw, so it had no effect.`] };
        }
        ActionService.swapHands(room, actorId, game.screwCallerId);
        game.screwCallerId = actorId;
        ActionService.discardDrawnAction(room, actorId);
        return { endTurn: true, log: [`${actorName} stole the Screw with Thief.`] };
      case 'see_swap':
        game.phase = 'action';
        game.pendingAction = { type: 'see_swap', actorId, actionCard, inspectedPlayerIds: [] };
        return { prompt: ActionService.prompt('selectTargetCard', actorId, 'Inspect one card from another player. You can swap once.') };
      case 'take_give':
        game.phase = 'action';
        game.pendingAction = { type: 'take_give', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetPlayer', actorId, 'Choose a player to take from and give to.') };
      case 'basra':
        game.phase = 'action';
        game.pendingAction = { type: 'basra', actorId, actionCard };
        return { prompt: ActionService.prompt('selectOwnCard', actorId, 'Choose one of your cards to discard without looking.') };
      case 'just_take':
        game.phase = 'action';
        game.pendingAction = { type: 'just_take', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetPlayer', actorId, 'Choose a player who will receive one of your cards.') };
      case 'peek_around':
        game.phase = 'action';
        game.pendingAction = { type: 'peek_around', actorId, actionCard };
        return { prompt: ActionService.prompt('selectPeekAroundOption', actorId, 'Peek at two of your cards or one card from every other player.') };
      default:
        throw new Error(`${def.name} has no active action.`);
    }
  }

  static chooseOwnCard(room: GameRoom, actorId: string, cardIndex: number): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    const actorState = ActionService.requirePlayerState(room, actorId);
    ActionService.assertCardIndex(actorState, cardIndex);

    if (pending.type === 'look_own') {
      const reveal = ActionService.reveal(actorId, cardIndex, actorState.hand[cardIndex]);
      ActionService.finishAction(room, pending);
      return { reveals: [reveal], endTurn: true, log: [`${ActionService.playerName(room, actorId)} peeked at one of their cards.`] };
    }

    if (pending.type === 'basra') {
      const [removed] = actorState.hand.splice(cardIndex, 1);
      room.game!.discardPile.push(removed);
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} used Basra and discarded a hidden card.`] };
    }

    if (pending.type === 'just_take') {
      if (!pending.targetPlayerId) {
        throw new Error('Choose a target player first.');
      }
      const targetState = ActionService.requirePlayerState(room, pending.targetPlayerId);
      const [given] = actorState.hand.splice(cardIndex, 1);
      targetState.hand.push(given);
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} used Just Take.`] };
    }

    if (pending.type === 'take_give') {
      if (!pending.targetPlayerId || pending.targetCardIndex === undefined) {
        throw new Error('Choose the target card first.');
      }
      const targetState = ActionService.requirePlayerState(room, pending.targetPlayerId);
      ActionService.assertCardIndex(targetState, pending.targetCardIndex);
      [actorState.hand[cardIndex], targetState.hand[pending.targetCardIndex]] = [targetState.hand[pending.targetCardIndex], actorState.hand[cardIndex]];
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} used Take & Give.`] };
    }

    throw new Error('That card choice is not valid for the current action.');
  }

  static chooseTargetPlayer(room: GameRoom, actorId: string, targetPlayerId: string): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    ActionService.assertTargetPlayer(room, actorId, targetPlayerId);

    if (pending.type === 'take_give') {
      pending.targetPlayerId = targetPlayerId;
      return { prompt: ActionService.prompt('selectTargetCard', actorId, 'Choose one target card to take without looking.', targetPlayerId) };
    }

    if (pending.type === 'just_take') {
      pending.targetPlayerId = targetPlayerId;
      return { prompt: ActionService.prompt('selectOwnCard', actorId, 'Choose one of your cards to give away without looking.') };
    }

    throw new Error('Target player is not valid for the current action.');
  }

  static chooseTargetCard(room: GameRoom, actorId: string, targetPlayerId: string, cardIndex: number): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    ActionService.assertTargetPlayer(room, actorId, targetPlayerId);
    const targetState = ActionService.requirePlayerState(room, targetPlayerId);
    ActionService.assertCardIndex(targetState, cardIndex);

    if (pending.type === 'look_other') {
      const reveal = ActionService.reveal(targetPlayerId, cardIndex, targetState.hand[cardIndex]);
      ActionService.finishAction(room, pending);
      return { reveals: [reveal], endTurn: true, log: [`${ActionService.playerName(room, actorId)} peeked at another player's card.`] };
    }

    if (pending.type === 'take_give') {
      pending.targetPlayerId = targetPlayerId;
      pending.targetCardIndex = cardIndex;
      return { prompt: ActionService.prompt('selectOwnCard', actorId, 'Choose one of your cards to give back.') };
    }

    if (pending.type === 'see_swap') {
      if (pending.inspectedPlayerIds.includes(targetPlayerId)) {
        throw new Error('You already inspected that player during this See & Swap.');
      }
      pending.targetPlayerId = targetPlayerId;
      pending.targetCardIndex = cardIndex;
      const reveal = ActionService.reveal(targetPlayerId, cardIndex, targetState.hand[cardIndex]);
      return {
        reveals: [reveal],
        prompt: {
          ...ActionService.prompt('confirmSwap', actorId, 'Swap with this card or skip to inspect another player.', targetPlayerId),
          targetCardIndex: cardIndex
        }
      };
    }

    throw new Error('Target card is not valid for the current action.');
  }

  static chooseActionOption(room: GameRoom, actorId: string, payload: ActionOptionPayload): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    if (pending.type !== 'peek_around') {
      throw new Error('No option is expected for the current action.');
    }

    if (payload.option === 'own') {
      const indexes = [...new Set(payload.cardIndexes ?? [])];
      if (indexes.length !== 2) {
        throw new Error('Choose exactly two of your own cards.');
      }
      const actorState = ActionService.requirePlayerState(room, actorId);
      const reveals = indexes.map((index) => {
        ActionService.assertCardIndex(actorState, index);
        return ActionService.reveal(actorId, index, actorState.hand[index]);
      });
      ActionService.finishAction(room, pending);
      return { reveals, endTurn: true, log: [`${ActionService.playerName(room, actorId)} used Peek Around on their own cards.`] };
    }

    if (payload.option === 'others') {
      const otherPlayers = room.players.filter((player) => player.id !== actorId);
      const targets = payload.targets?.length
        ? payload.targets
        : otherPlayers.map((player) => ({ targetPlayerId: player.id, cardIndex: 0 }));

      if (targets.length !== otherPlayers.length) {
        throw new Error('Choose exactly one card from each other player.');
      }

      const reveals = targets.map((target) => {
        ActionService.assertTargetPlayer(room, actorId, target.targetPlayerId);
        const targetState = ActionService.requirePlayerState(room, target.targetPlayerId);
        ActionService.assertCardIndex(targetState, target.cardIndex);
        return ActionService.reveal(target.targetPlayerId, target.cardIndex, targetState.hand[target.cardIndex]);
      });

      ActionService.finishAction(room, pending);
      return { reveals, endTurn: true, log: [`${ActionService.playerName(room, actorId)} used Peek Around on the table.`] };
    }

    throw new Error('Unknown Peek Around option.');
  }

  static confirmSwap(room: GameRoom, actorId: string, payload: ConfirmSwapPayload): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    if (pending.type !== 'see_swap') {
      throw new Error('No swap is waiting for confirmation.');
    }
    if (!pending.targetPlayerId || pending.targetCardIndex === undefined) {
      throw new Error('Inspect a card before deciding to swap.');
    }

    if (!payload.swap) {
      pending.inspectedPlayerIds.push(pending.targetPlayerId);
      pending.targetPlayerId = undefined;
      pending.targetCardIndex = undefined;
      const remaining = room.players.filter((player) => player.id !== actorId && !pending.inspectedPlayerIds.includes(player.id));
      if (remaining.length === 0) {
        ActionService.finishAction(room, pending);
        return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} skipped every See & Swap option.`] };
      }
      return { prompt: ActionService.prompt('selectTargetCard', actorId, 'Choose one card from the next player to inspect.') };
    }

    const targetPlayerId = payload.targetPlayerId ?? pending.targetPlayerId;
    const targetCardIndex = payload.targetCardIndex ?? pending.targetCardIndex;
    const ownCardIndex = payload.ownCardIndex;
    if (ownCardIndex === undefined) {
      throw new Error('Choose one of your cards to swap.');
    }

    const actorState = ActionService.requirePlayerState(room, actorId);
    const targetState = ActionService.requirePlayerState(room, targetPlayerId);
    ActionService.assertCardIndex(actorState, ownCardIndex);
    ActionService.assertCardIndex(targetState, targetCardIndex);
    [actorState.hand[ownCardIndex], targetState.hand[targetCardIndex]] = [targetState.hand[targetCardIndex], actorState.hand[ownCardIndex]];
    ActionService.finishAction(room, pending);
    return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} swapped one card with See & Swap.`] };
  }

  static playThiefFromHand(room: GameRoom, actorId: string): ActionResult {
    const game = TurnService.requireGame(room);
    TurnService.assertPlayersTurn(room, actorId);
    if (!game.finalRound || !game.screwCallerId) {
      throw new Error('Thief can only steal after Screw has been called.');
    }
    if (game.screwCallerId === actorId) {
      throw new Error('You already hold the Screw.');
    }

    const actorState = ActionService.requirePlayerState(room, actorId);
    const thiefIndex = actorState.hand.findIndex((card) => card.defId === 'thief');
    if (thiefIndex === -1) {
      throw new Error('You do not have a Thief card.');
    }

    const [thief] = actorState.hand.splice(thiefIndex, 1);
    game.discardPile.push(thief);
    ActionService.swapHands(room, actorId, game.screwCallerId);
    game.screwCallerId = actorId;
    return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} stole the Screw with Thief.`] };
  }

  static publicCard(card: CardInstance): PublicCard {
    return toPublicCard(DeckService.getDefinition(card));
  }

  private static finishAction(room: GameRoom, pending: PendingAction): void {
    const game = TurnService.requireGame(room);
    game.discardPile.push(pending.actionCard);
    game.drawnCard = undefined;
    game.pendingAction = undefined;
    game.phase = 'playing';
  }

  private static discardDrawnAction(room: GameRoom, actorId: string): void {
    const game = TurnService.requireGame(room);
    if (!game.drawnCard || game.drawnCard.playerId !== actorId) {
      throw new Error('No drawn card to discard.');
    }
    game.discardPile.push(game.drawnCard.card);
    game.drawnCard = undefined;
    game.pendingAction = undefined;
    game.phase = 'playing';
  }

  private static swapHands(room: GameRoom, firstPlayerId: string, secondPlayerId: string): void {
    const first = ActionService.requirePlayerState(room, firstPlayerId);
    const second = ActionService.requirePlayerState(room, secondPlayerId);
    [first.hand, second.hand] = [second.hand, first.hand];
  }

  private static requirePending(room: GameRoom, actorId: string): PendingAction {
    const game = TurnService.requireGame(room);
    if (!game.pendingAction || game.pendingAction.actorId !== actorId) {
      throw new Error('No action is waiting for you.');
    }
    return game.pendingAction;
  }

  private static requirePlayerState(room: GameRoom, playerId: string): PlayerGameState {
    const state = room.game?.playerStates[playerId];
    if (!state) {
      throw new Error('Player is not in this round.');
    }
    return state;
  }

  private static assertCardIndex(playerState: PlayerGameState, cardIndex: number): void {
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= playerState.hand.length) {
      throw new Error('Card index is not valid.');
    }
  }

  private static assertTargetPlayer(room: GameRoom, actorId: string, targetPlayerId: string): void {
    if (actorId === targetPlayerId) {
      throw new Error('Choose another player.');
    }
    const target = room.players.find((player) => player.id === targetPlayerId);
    if (!target) {
      throw new Error('Target player is not in this room.');
    }
  }

  private static reveal(ownerId: string, index: number, card: CardInstance) {
    return {
      ownerId,
      index,
      card: ActionService.publicCard(card)
    };
  }

  private static prompt(type: ActionPrompt['type'], actorId: string, message: string, targetPlayerId?: string): ActionPrompt {
    return { type, actorId, message, targetPlayerId };
  }

  private static playerName(room: GameRoom, playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.nickname ?? 'A player';
  }
}
