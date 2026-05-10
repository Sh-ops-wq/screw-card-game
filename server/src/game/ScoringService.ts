import { toPublicCard } from './CardDefs';
import { DeckService } from './DeckService';
import type { GameRoom } from './Types';
import type { ScoreLine } from '../../../shared/types';

export class ScoringService {
  static calculate(room: GameRoom): ScoreLine[] {
    if (!room.game) {
      throw new Error('Game has not started.');
    }

    const scores = room.players.map((player) => {
      const playerState = room.game!.playerStates[player.id];
      const cards = playerState.hand.map((card) => toPublicCard(DeckService.getDefinition(card)));
      const cardTotal = playerState.hand.reduce((sum, card) => sum + DeckService.getDefinition(card).value, 0);
      const total = cardTotal + player.penaltyPoints;
      return {
        playerId: player.id,
        nickname: player.nickname,
        total,
        penaltyPoints: player.penaltyPoints,
        warningCount: player.warningCount,
        cards,
        isWinner: false,
        isScrewCaller: room.game!.screwCallerId === player.id
      };
    });

    const lowest = Math.min(...scores.map((score) => score.total));
    for (const score of scores) {
      score.isWinner = score.total === lowest;
    }

    return scores;
  }
}
