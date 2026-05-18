import { Trophy, X } from 'lucide-react';
import type { MatchStandingLine, RoundEndedPayload } from '../../../shared/types';
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
  const champ = payload.matchWinnerId
    ? payload.matchStanding?.find((line) => line.playerId === payload.matchWinnerId)
    : undefined;

  const gamesPlayed = payload.matchGamesPlayed ?? 1;
  const gamesTotal = payload.gamesPerMatch ?? 5;
  const isMatchOver = Boolean(payload.matchWinnerId);
  const raceLine = t('raceToNWins').replace('{n}', String(gamesTotal));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="score-modal">
        {/* ── Header ── */}
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {t('game')} {gamesPlayed} / {gamesTotal} — {t('roundComplete')}
            </p>
            <h2>
              <Trophy size={24} /> {t('winner')}: {winner?.nickname ?? t('winner')}
            </h2>
            {isMatchOver && champ ? (
              <p className="score-match-banner">
                🏆 {t('matchChampion')}: {champ.nickname}
              </p>
            ) : null}
            <p className="score-race-caption">{raceLine}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close scoreboard">
            <X size={20} />
          </button>
        </div>

        {/* ── Match standings table (cumulative points) ── */}
        {payload.matchStanding && payload.matchStanding.length > 0 ? (
          <MatchTable standing={payload.matchStanding} gamesPlayed={gamesPlayed} t={t} />
        ) : null}

        {/* ── This round's card breakdown ── */}
        <div className="score-grid">
          {payload.scores
            .slice()
            .sort((a, b) => a.total - b.total)
            .map((score) => (
              <section
                className={score.isWinner ? 'score-line is-winner' : 'score-line'}
                key={score.playerId}
              >
                <div className="score-line__top">
                  <strong>{score.nickname}</strong>
                  <span>{score.total} pts</span>
                </div>
                <div className="score-line__meta">
                  {score.isScrewCaller ? 'Screw caller' : 'Player'}
                  {score.penaltyPoints ? ` · +${score.penaltyPoints} penalty` : ''}
                  {score.warningCount ? ` · ${score.warningCount} ${t('warnings')}` : ''}
                </div>
                <div className="score-cards">
                  {score.cards.map((card, index) => (
                    <CardImage cardId={card.id} key={`${score.playerId}-${index}`} size="small" />
                  ))}
                </div>
              </section>
            ))}
        </div>

        {/* ── Actions ── */}
        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={onRestart} disabled={!canRestart}>
            {isMatchOver ? `🔄 ${t('playAgain')}` : `▶ ${t('game')} ${gamesPlayed + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Match standings table component ──────────────────────────── */
function MatchTable({
  standing,
  gamesPlayed,
  t,
}: {
  standing: MatchStandingLine[];
  gamesPlayed: number;
  t: TFunction;
}) {
  return (
    <div className="match-standings">
      <p className="eyebrow">{t('matchStandings')}</p>
      <table className="match-table">
        <thead>
          <tr>
            <th>{t('players')}</th>
            {Array.from({ length: gamesPlayed }, (_, i) => (
              <th key={i}>G{i + 1}</th>
            ))}
            <th>{t('matchTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {standing.map((line, rank) => (
            <tr key={line.playerId} className={rank === 0 ? 'match-table__leader' : ''}>
              <td className="match-table__name">
                {rank === 0 ? '👑 ' : `${rank + 1}. `}
                {line.nickname}
              </td>
              {line.gamePoints.map((pts, i) => (
                <td
                  key={i}
                  className={pts === Math.min(...standing.map((s) => s.gamePoints[i] ?? 999)) ? 'match-table__best' : ''}
                >
                  {pts}
                </td>
              ))}
              {/* Fill empty cells if some players have fewer entries */}
              {Array.from({ length: gamesPlayed - line.gamePoints.length }, (_, i) => (
                <td key={`empty-${i}`}>—</td>
              ))}
              <td className="match-table__total">{line.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
