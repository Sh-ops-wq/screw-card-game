import { Trophy, X } from 'lucide-react';
import type { RoundEndedPayload } from '../../../shared/types';
import type { TFunction } from '../i18n';
import { CardImage } from './CardImage';

interface ScoreboardModalProps {
  payload: RoundEndedPayload | null;
  onClose: () => void;
  onRestart: () => void;
  canRestart: boolean;
  t: TFunction;
}

export function ScoreboardModal({ payload, onClose, onRestart, canRestart, t }: ScoreboardModalProps) {
  if (!payload) {
    return null;
  }

  const winner = payload.scores.find((score) => score.playerId === payload.winnerId);

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="score-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{t('roundComplete')}</p>
            <h2>
              <Trophy size={26} /> {t('winner')}: {winner?.nickname ?? t('winner')}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close scoreboard">
            <X size={20} />
          </button>
        </div>

        <div className="score-grid">
          {payload.scores
            .slice()
            .sort((a, b) => a.total - b.total)
            .map((score) => (
              <section className={score.isWinner ? 'score-line is-winner' : 'score-line'} key={score.playerId}>
                <div className="score-line__top">
                  <strong>{score.nickname}</strong>
                  <span>{score.total} pts</span>
                </div>
                <div className="score-line__meta">
                  {score.isScrewCaller ? 'Screw caller' : 'Player'} {score.penaltyPoints ? `+ ${score.penaltyPoints} penalty` : ''}
                </div>
                <div className="score-cards">
                  {score.cards.map((card, index) => (
                    <CardImage cardId={card.id} key={`${score.playerId}-${index}`} size="small" />
                  ))}
                </div>
              </section>
            ))}
        </div>

        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={onRestart} disabled={!canRestart}>
            {t('playAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}
