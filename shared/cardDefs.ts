import type { CardDef, PublicCard } from './types';

const BACK_IMAGE = '/assets/card-back-screw.png';
const cardImage = (name: string) => `/assets/cards/${name}.png`;

export const CARD_DEFS: CardDef[] = [
  { id: 'card_1', name: '1', type: 'number', count: 4, value: 1, image: cardImage('card_1'), backImage: BACK_IMAGE, effectType: 'none', rank: 1 },
  { id: 'card_2', name: '2', type: 'number', count: 4, value: 2, image: cardImage('card_2'), backImage: BACK_IMAGE, effectType: 'none', rank: 2 },
  { id: 'card_3', name: '3', type: 'number', count: 4, value: 3, image: cardImage('card_3'), backImage: BACK_IMAGE, effectType: 'none', rank: 3 },
  { id: 'card_4', name: '4', type: 'number', count: 4, value: 4, image: cardImage('card_4'), backImage: BACK_IMAGE, effectType: 'none', rank: 4 },
  { id: 'card_5', name: '5', type: 'number', count: 4, value: 5, image: cardImage('card_5'), backImage: BACK_IMAGE, effectType: 'none', rank: 5 },
  { id: 'card_6', name: '6', type: 'number', count: 4, value: 6, image: cardImage('card_6'), backImage: BACK_IMAGE, effectType: 'none', rank: 6 },
  { id: 'card_7', name: '7', type: 'number', count: 4, value: 7, image: cardImage('card_7'), backImage: BACK_IMAGE, effectType: 'look_own', rank: 7 },
  { id: 'card_8', name: '8', type: 'number', count: 4, value: 8, image: cardImage('card_8'), backImage: BACK_IMAGE, effectType: 'look_own', rank: 8 },
  { id: 'card_9', name: '9', type: 'number', count: 4, value: 9, image: cardImage('card_9'), backImage: BACK_IMAGE, effectType: 'look_other', rank: 9 },
  { id: 'card_10', name: '10', type: 'number', count: 4, value: 10, image: cardImage('card_10'), backImage: BACK_IMAGE, effectType: 'look_other', rank: 10 },
  { id: 'screw_driver', name: 'Screw Driver', type: 'special', count: 2, value: 0, image: cardImage('screw_driver'), backImage: BACK_IMAGE, effectType: 'none' },
  { id: 'screw', name: 'Screw', type: 'special', count: 2, value: 35, image: cardImage('screw'), backImage: BACK_IMAGE, effectType: 'none' },
  { id: 'minus_1', name: '-1', type: 'special', count: 2, value: -1, image: cardImage('minus_1'), backImage: BACK_IMAGE, effectType: 'none' },
  { id: 'plus_20', name: '+20', type: 'special', count: 3, value: 20, image: cardImage('plus_20'), backImage: BACK_IMAGE, effectType: 'none' },
  { id: 'thief', name: 'Thief', type: 'special', count: 2, value: 10, image: cardImage('thief'), backImage: BACK_IMAGE, effectType: 'thief' },
  { id: 'see_swap', name: 'See & Swap', type: 'special', count: 2, value: 10, image: cardImage('see_swap'), backImage: BACK_IMAGE, effectType: 'see_swap' },
  { id: 'take_give', name: 'Take & Give', type: 'special', count: 4, value: 10, image: cardImage('take_give'), backImage: BACK_IMAGE, effectType: 'take_give' },
  { id: 'basra', name: 'Basra', type: 'special', count: 3, value: 10, image: cardImage('basra'), backImage: BACK_IMAGE, effectType: 'basra' },
  { id: 'just_take', name: 'Just Take', type: 'special', count: 2, value: 10, image: cardImage('just_take'), backImage: BACK_IMAGE, effectType: 'just_take' },
  { id: 'peek_around', name: 'Peek Around', type: 'special', count: 3, value: 10, image: cardImage('peek_around'), backImage: BACK_IMAGE, effectType: 'peek_around' }
];

export const CARD_DEF_BY_ID = Object.fromEntries(CARD_DEFS.map((card) => [card.id, card])) as Record<string, CardDef>;

export const toPublicCard = (card: CardDef): PublicCard => ({
  id: card.id,
  name: card.name,
  type: card.type,
  value: card.value,
  image: card.image,
  effectType: card.effectType,
  rank: card.rank
});

export const TOTAL_CARD_COUNT = CARD_DEFS.reduce((sum, card) => sum + card.count, 0);
