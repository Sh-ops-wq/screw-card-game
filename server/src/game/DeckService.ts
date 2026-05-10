import { randomInt, randomUUID } from 'node:crypto';
import { CARD_DEFS, CARD_DEF_BY_ID, TOTAL_CARD_COUNT } from './CardDefs';
import type { CardInstance } from './Types';

export class DeckService {
  static buildDeck(): CardInstance[] {
    const deck = CARD_DEFS.flatMap((def) =>
      Array.from({ length: def.count }, () => ({
        instanceId: randomUUID(),
        defId: def.id
      }))
    );

    DeckService.assertDeck(deck);
    return deck;
  }

  static shuffle(deck: CardInstance[]): CardInstance[] {
    const copy = [...deck];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  static draw(deck: CardInstance[]): CardInstance {
    const card = deck.pop();
    if (!card) {
      throw new Error('The draw pile is empty.');
    }
    return card;
  }

  static getDefinition(card: CardInstance) {
    const def = CARD_DEF_BY_ID[card.defId];
    if (!def) {
      throw new Error(`Unknown card definition: ${card.defId}`);
    }
    return def;
  }

  static assertDefinitions(): void {
    const total = CARD_DEFS.reduce((sum, card) => sum + card.count, 0);
    if (total !== 65 || TOTAL_CARD_COUNT !== 65) {
      throw new Error(`Screw deck must contain exactly 65 cards. Got ${total}.`);
    }
  }

  static assertDeck(deck: CardInstance[]): void {
    if (deck.length !== 65) {
      throw new Error(`Screw deck must contain exactly 65 cards. Got ${deck.length}.`);
    }

    for (const def of CARD_DEFS) {
      const count = deck.filter((card) => card.defId === def.id).length;
      if (count !== def.count) {
        throw new Error(`${def.name} expected ${def.count} cards, got ${count}.`);
      }
    }
  }
}
