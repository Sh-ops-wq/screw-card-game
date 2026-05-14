import { toPublicCard } from './CardDefs';
import { DeckService } from './DeckService';
import { TurnService } from './TurnService';
import type { ActionResult, CardInstance, GameRoom, PendingAction, PlayerGameState } from './Types';
import type { ActionPrompt, PeekMarker, PublicCard } from '../../../shared/types';

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
        return { prompt: ActionService.prompt('selectOwnCard', actorId, 'اختار واحدة من كروتك تبص عليها.') };
      case 'look_other':
        game.phase = 'action';
        game.pendingAction = { type: 'look_other', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetCard', actorId, 'اختار كارت عند لاعب تاني تبص عليه.') };
      case 'thief':
        if (!game.finalRound || !game.screwCallerId) {
          ActionService.discardDrawnAction(room, actorId);
          return { endTurn: true, log: [`${actorName} استخدم اللص قبل السكرو — مفيش أثر.`] };
        }
        ActionService.swapHands(room, actorId, game.screwCallerId);
        game.screwCallerId = actorId;
        ActionService.discardDrawnAction(room, actorId);
        return { endTurn: true, log: [`${actorName} سرق السكرو باللص!`] };
      case 'see_swap':
        game.phase = 'action';
        game.pendingAction = { type: 'see_swap', actorId, actionCard, inspectedPlayerIds: [] };
        return { prompt: ActionService.prompt('selectTargetCard', actorId, 'بص على كارت عند لاعب تاني — تقدر تتبادل.') };
      case 'take_give':
        game.phase = 'action';
        game.pendingAction = { type: 'take_give', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetPlayer', actorId, 'اختار لاعب تاخد منه وتديله.') };
      case 'basra':
        game.phase = 'action';
        game.pendingAction = { type: 'basra', actorId, actionCard };
        return { prompt: ActionService.prompt('selectOwnCard', actorId, 'اختار واحدة من كروتك ترميها من غير ما تبصها.') };
      case 'just_take':
        game.phase = 'action';
        game.pendingAction = { type: 'just_take', actorId, actionCard };
        return { prompt: ActionService.prompt('selectTargetPlayer', actorId, 'اختار لاعب هيستلم واحدة من كروتك.') };
      case 'peek_around':
        game.phase = 'action';
        game.pendingAction = { type: 'peek_around', actorId, actionCard };
        return { prompt: ActionService.prompt('selectPeekAroundOption', actorId, 'بص على اتنين من كروتك أو واحدة عند كل لاعب.') };
      default:
        throw new Error(`${def.name} مفيش أكشن ليها.`);
    }
  }

  static chooseOwnCard(room: GameRoom, actorId: string, cardIndex: number): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    const actorState = ActionService.requirePlayerState(room, actorId);
    ActionService.assertCardIndex(actorState, cardIndex);

    if (pending.type === 'look_own') {
      const reveal = ActionService.reveal(actorId, cardIndex, actorState.hand[cardIndex]);
      const marker: PeekMarker = {
        ownerId: actorId,
        index: cardIndex,
        peekerId: actorId,
        peekerName: ActionService.playerName(room, actorId)
      };
      ActionService.finishAction(room, pending);
      return { reveals: [reveal], peekMarkers: [marker], endTurn: true, log: [`${marker.peekerName} بص على واحدة من كروته.`] };
    }

    if (pending.type === 'basra') {
      // Clear any existing peek marker for this card slot
      ActionService.clearMarkersForSlot(room, actorId, cardIndex);
      const [removed] = actorState.hand.splice(cardIndex, 1);
      room.game!.discardPile.push(removed);
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} رمى كارت مخفية ببصرة.`] };
    }

    if (pending.type === 'just_take') {
      if (!pending.targetPlayerId) {
        throw new Error('اختار لاعب الأول.');
      }
      const targetState = ActionService.requirePlayerState(room, pending.targetPlayerId);
      // Clear marker for moved card
      ActionService.clearMarkersForSlot(room, actorId, cardIndex);
      const [given] = actorState.hand.splice(cardIndex, 1);
      targetState.hand.push(given);
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} استخدم Just Take.`] };
    }

    if (pending.type === 'take_give') {
      if (!pending.targetPlayerId || pending.targetCardIndex === undefined) {
        throw new Error('اختار الكارت الهدف الأول.');
      }
      const targetState = ActionService.requirePlayerState(room, pending.targetPlayerId);
      ActionService.assertCardIndex(targetState, pending.targetCardIndex);
      // Clear markers for both swapped slots
      ActionService.clearMarkersForSlot(room, actorId, cardIndex);
      ActionService.clearMarkersForSlot(room, pending.targetPlayerId, pending.targetCardIndex);
      [actorState.hand[cardIndex], targetState.hand[pending.targetCardIndex]] = [targetState.hand[pending.targetCardIndex], actorState.hand[cardIndex]];
      ActionService.finishAction(room, pending);
      return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} استخدم Take & Give.`] };
    }

    throw new Error('اختيار الكارت ده مش صح للأكشن الحالي.');
  }

  static chooseTargetPlayer(room: GameRoom, actorId: string, targetPlayerId: string): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    ActionService.assertTargetPlayer(room, actorId, targetPlayerId);

    if (pending.type === 'take_give') {
      pending.targetPlayerId = targetPlayerId;
      return { prompt: ActionService.prompt('selectTargetCard', actorId, 'اختار الكارت اللي هتاخدها.', targetPlayerId) };
    }

    if (pending.type === 'just_take') {
      pending.targetPlayerId = targetPlayerId;
      return { prompt: ActionService.prompt('selectOwnCard', actorId, 'اختار واحدة من كروتك تديها.') };
    }

    throw new Error('اختيار اللاعب ده مش صح للأكشن الحالي.');
  }

  static chooseTargetCard(room: GameRoom, actorId: string, targetPlayerId: string, cardIndex: number): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    ActionService.assertTargetPlayer(room, actorId, targetPlayerId);
    const targetState = ActionService.requirePlayerState(room, targetPlayerId);
    ActionService.assertCardIndex(targetState, cardIndex);

    if (pending.type === 'look_other') {
      const reveal = ActionService.reveal(targetPlayerId, cardIndex, targetState.hand[cardIndex]);
      const marker: PeekMarker = {
        ownerId: targetPlayerId,
        index: cardIndex,
        peekerId: actorId,
        peekerName: ActionService.playerName(room, actorId)
      };
      ActionService.finishAction(room, pending);
      return { reveals: [reveal], peekMarkers: [marker], endTurn: true, log: [`${marker.peekerName} بص على كارت عند ${ActionService.playerName(room, targetPlayerId)}.`] };
    }

    if (pending.type === 'take_give') {
      pending.targetPlayerId = targetPlayerId;
      pending.targetCardIndex = cardIndex;
      return { prompt: ActionService.prompt('selectOwnCard', actorId, 'دلوقتي اختار واحدة من كروتك تديها ليه.') };
    }

    if (pending.type === 'see_swap') {
      if (pending.inspectedPlayerIds.includes(targetPlayerId)) {
        throw new Error('انت بصيت على الكروت دي الأول.');
      }
      pending.targetPlayerId = targetPlayerId;
      pending.targetCardIndex = cardIndex;
      const reveal = ActionService.reveal(targetPlayerId, cardIndex, targetState.hand[cardIndex]);
      const marker: PeekMarker = {
        ownerId: targetPlayerId,
        index: cardIndex,
        peekerId: actorId,
        peekerName: ActionService.playerName(room, actorId)
      };
      return {
        reveals: [reveal],
        peekMarkers: [marker],
        prompt: {
          ...ActionService.prompt('confirmSwap', actorId, 'تتبادل مع الكارت دي ولا تعدي للاعب التاني؟', targetPlayerId),
          targetCardIndex: cardIndex
        }
      };
    }

    throw new Error('اختيار الكارت ده مش صح للأكشن الحالي.');
  }

  static chooseActionOption(room: GameRoom, actorId: string, payload: ActionOptionPayload): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    if (pending.type !== 'peek_around') {
      throw new Error('مش متوقع خيار للأكشن الحالي.');
    }
    const actorName = ActionService.playerName(room, actorId);

    if (payload.option === 'own') {
      const indexes = [...new Set(payload.cardIndexes ?? [])];
      if (indexes.length !== 2) {
        throw new Error('اختار اتنين من كروتك.');
      }
      const actorState = ActionService.requirePlayerState(room, actorId);
      const reveals = indexes.map((index) => {
        ActionService.assertCardIndex(actorState, index);
        return ActionService.reveal(actorId, index, actorState.hand[index]);
      });
      const markers: PeekMarker[] = indexes.map((index) => ({
        ownerId: actorId,
        index,
        peekerId: actorId,
        peekerName: actorName
      }));
      ActionService.finishAction(room, pending);
      return { reveals, peekMarkers: markers, endTurn: true, log: [`${actorName} بص على اتنين من كروته.`] };
    }

    if (payload.option === 'others') {
      const otherPlayers = room.players.filter((player) => player.id !== actorId);
      const targets = payload.targets?.length
        ? payload.targets
        : otherPlayers.map((player) => ({ targetPlayerId: player.id, cardIndex: 0 }));

      if (targets.length !== otherPlayers.length) {
        throw new Error('اختار واحدة من كل لاعب تاني.');
      }

      const reveals = targets.map((target) => {
        ActionService.assertTargetPlayer(room, actorId, target.targetPlayerId);
        const targetState = ActionService.requirePlayerState(room, target.targetPlayerId);
        ActionService.assertCardIndex(targetState, target.cardIndex);
        return ActionService.reveal(target.targetPlayerId, target.cardIndex, targetState.hand[target.cardIndex]);
      });
      const markers: PeekMarker[] = targets.map((target) => ({
        ownerId: target.targetPlayerId,
        index: target.cardIndex,
        peekerId: actorId,
        peekerName: actorName
      }));

      ActionService.finishAction(room, pending);
      return { reveals, peekMarkers: markers, endTurn: true, log: [`${actorName} بص على كارت عند كل اللاعبين.`] };
    }

    throw new Error('خيار Peek Around غير معروف.');
  }

  static confirmSwap(room: GameRoom, actorId: string, payload: ConfirmSwapPayload): ActionResult {
    const pending = ActionService.requirePending(room, actorId);
    if (pending.type !== 'see_swap') {
      throw new Error('مفيش تبادل منتظر.');
    }
    if (!pending.targetPlayerId || pending.targetCardIndex === undefined) {
      throw new Error('ابص على الكارت الأول قبل ما تقرر.');
    }

    if (!payload.swap) {
      pending.inspectedPlayerIds.push(pending.targetPlayerId);
      pending.targetPlayerId = undefined;
      pending.targetCardIndex = undefined;
      const remaining = room.players.filter((player) => player.id !== actorId && !pending.inspectedPlayerIds.includes(player.id));
      if (remaining.length === 0) {
        ActionService.finishAction(room, pending);
        return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} عدا كل الخيارات بدون تبادل.`] };
      }
      return { prompt: ActionService.prompt('selectTargetCard', actorId, 'اختار كارت عند اللاعب الجاي.') };
    }

    const targetPlayerId = payload.targetPlayerId ?? pending.targetPlayerId;
    const targetCardIndex = payload.targetCardIndex ?? pending.targetCardIndex;
    const ownCardIndex = payload.ownCardIndex;
    if (ownCardIndex === undefined) {
      throw new Error('اختار واحدة من كروتك للتبادل.');
    }

    const actorState = ActionService.requirePlayerState(room, actorId);
    const targetState = ActionService.requirePlayerState(room, targetPlayerId);
    ActionService.assertCardIndex(actorState, ownCardIndex);
    ActionService.assertCardIndex(targetState, targetCardIndex);
    // Clear markers for both swapped slots
    ActionService.clearMarkersForSlot(room, actorId, ownCardIndex);
    ActionService.clearMarkersForSlot(room, targetPlayerId, targetCardIndex);
    [actorState.hand[ownCardIndex], targetState.hand[targetCardIndex]] = [targetState.hand[targetCardIndex], actorState.hand[ownCardIndex]];
    ActionService.finishAction(room, pending);
    return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} اتبادل بـ See & Swap.`] };
  }

  static playThiefFromHand(room: GameRoom, actorId: string): ActionResult {
    const game = TurnService.requireGame(room);
    TurnService.assertPlayersTurn(room, actorId);
    if (!game.finalRound || !game.screwCallerId) {
      throw new Error('اللص بيشتغل بس بعد ما حد يقول سكرو.');
    }
    if (game.screwCallerId === actorId) {
      throw new Error('انت عندك السكرو أصلاً.');
    }

    const actorState = ActionService.requirePlayerState(room, actorId);
    const thiefIndex = actorState.hand.findIndex((card) => card.defId === 'thief');
    if (thiefIndex === -1) {
      throw new Error('مش عندك كارت اللص.');
    }

    const [thief] = actorState.hand.splice(thiefIndex, 1);
    game.discardPile.push(thief);
    ActionService.swapHands(room, actorId, game.screwCallerId);
    game.screwCallerId = actorId;
    return { endTurn: true, log: [`${ActionService.playerName(room, actorId)} سرق السكرو باللص!`] };
  }

  static publicCard(card: CardInstance): PublicCard {
    return toPublicCard(DeckService.getDefinition(card));
  }

  /** Add peek markers to game state (called from GameManager after action) */
  static applyPeekMarkers(room: GameRoom, markers: PeekMarker[]): void {
    if (!room.game || !markers.length) return;
    for (const marker of markers) {
      // Remove existing marker for same slot then add new
      room.game.peekMarkers = room.game.peekMarkers.filter(
        (m) => !(m.ownerId === marker.ownerId && m.index === marker.index)
      );
      room.game.peekMarkers.push(marker);
    }
  }

  /** Clear markers for a card slot that has been moved/swapped */
  static clearMarkersForSlot(room: GameRoom, ownerId: string, index: number): void {
    if (!room.game) return;
    room.game.peekMarkers = room.game.peekMarkers.filter(
      (m) => !(m.ownerId === ownerId && m.index === index)
    );
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
      throw new Error('مفيش كارت مسحوبة ترميها.');
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
      throw new Error('مفيش أكشن منتظرك.');
    }
    return game.pendingAction;
  }

  private static requirePlayerState(room: GameRoom, playerId: string): PlayerGameState {
    const state = room.game?.playerStates[playerId];
    if (!state) {
      throw new Error('اللاعب مش في الجولة دي.');
    }
    return state;
  }

  private static assertCardIndex(playerState: PlayerGameState, cardIndex: number): void {
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= playerState.hand.length) {
      throw new Error('رقم الكارت مش صح.');
    }
  }

  private static assertTargetPlayer(room: GameRoom, actorId: string, targetPlayerId: string): void {
    if (actorId === targetPlayerId) {
      throw new Error('اختار لاعب تاني.');
    }
    const target = room.players.find((player) => player.id === targetPlayerId);
    if (!target) {
      throw new Error('اللاعب ده مش في الروم.');
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
    return room.players.find((player) => player.id === playerId)?.nickname ?? 'لاعب';
  }
}
