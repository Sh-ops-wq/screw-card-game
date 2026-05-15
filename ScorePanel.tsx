/**
 * ScorePanel.tsx
 * بانيل النقاط اللي بيظهر بعد كل جيم
 * ضع في: client/src/components/ScorePanel.tsx
 *
 * الاستخدام في GameBoard:
 *   import { ScorePanel } from './ScorePanel';
 *   {showScores && (
 *     <ScorePanel
 *       players={players}
 *       gameScores={scoreData.gameScores}
 *       roundScores={scoreData.roundScores}
 *       gameHistory={scoreData.gameHistory}
 *       currentGame={scoreData.currentGame}
 *       totalGames={scoreData.totalGames}
 *       onContinue={() => setShowScores(false)}
 *     />
 *   )}
 */

import React from 'react';

interface Player {
  id: string;
  nickname: string;
  isBot?: boolean;
}

interface ScorePanelProps {
  players: Player[];
  gameScores: Record<string, number>;     // نقاط الجيم الأخير
  roundScores: Record<string, number>;    // مجموع نقاط الجولة
  gameHistory: Record<string, number[]>;  // تاريخ كل جيم
  currentGame: number;                    // رقم الجيم القادم
  totalGames: number;                     // 5
  isRoundOver?: boolean;
  onContinue: () => void;
}

export function ScorePanel({
  players, gameScores, roundScores, gameHistory,
  currentGame, totalGames, isRoundOver = false, onContinue,
}: ScorePanelProps) {
  // رتّب حسب أقل نقاط (الأحسن)
  const sorted = [...players].sort(
    (a, b) => (roundScores[a.id] ?? 0) - (roundScores[b.id] ?? 0)
  );

  const completedGames = currentGame - 1;
  const winner = sorted[0];

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>

        {/* ── Header ── */}
        <div style={S.header}>
          {isRoundOver ? (
            <>
              <div style={S.crownWrap}>👑</div>
              <p style={S.winnerText}>{winner.nickname}</p>
              <p style={S.subtitle}>كسب الجولة بـ {roundScores[winner.id]} نقطة</p>
            </>
          ) : (
            <>
              <div style={S.progress}>
                {Array.from({ length: totalGames }, (_, i) => (
                  <div key={i} style={{
                    ...S.dot,
                    background: i < completedGames
                      ? '#7c3aed'
                      : i === completedGames - 1
                        ? '#a855f7'
                        : 'rgba(255,255,255,0.15)',
                  }} />
                ))}
              </div>
              <p style={S.gameLabel}>
                انتهى جيم {completedGames} — باقي {totalGames - completedGames} جيمات
              </p>
            </>
          )}
        </div>

        {/* ── Score Table ── */}
        <div style={S.tableWrap}>
          <div style={S.tableHeader}>
            <span style={S.colName}>اللاعب</span>
            {Array.from({ length: completedGames }, (_, i) => (
              <span key={i} style={S.colGame}>G{i + 1}</span>
            ))}
            <span style={S.colTotal}>المجموع</span>
          </div>

          {sorted.map((p, rank) => {
            const history = gameHistory[p.id] ?? [];
            const total = roundScores[p.id] ?? 0;
            const lastScore = gameScores[p.id] ?? 0;

            return (
              <div key={p.id} style={{
                ...S.row,
                background: rank === 0
                  ? 'rgba(251,191,36,0.08)'
                  : rank % 2 === 0
                    ? 'rgba(255,255,255,0.03)'
                    : 'transparent',
              }}>
                <span style={S.colName}>
                  {rank === 0 && <span style={S.rankBadge}>1</span>}
                  {rank === 1 && <span style={{ ...S.rankBadge, background: '#475569' }}>2</span>}
                  {rank === 2 && <span style={{ ...S.rankBadge, background: '#78350f' }}>3</span>}
                  <span style={{ color: rank === 0 ? '#fbbf24' : '#e2e8f0' }}>
                    {p.nickname}
                    {p.isBot && <span style={S.botTag}> BOT</span>}
                  </span>
                </span>

                {history.map((s, i) => (
                  <span key={i} style={{
                    ...S.colGame,
                    color: s === 0 ? '#34d399'
                      : i === completedGames - 1 ? '#a78bfa'
                        : '#94a3b8',
                    fontWeight: i === completedGames - 1 ? 700 : 400,
                  }}>
                    {s}
                  </span>
                ))}

                <span style={{
                  ...S.colTotal,
                  color: rank === 0 ? '#fbbf24' : '#f8fafc',
                  fontWeight: 700,
                }}>
                  {total}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Legend ── */}
        <div style={S.legend}>
          <span style={S.legendItem}>
            <span style={{ color: '#34d399' }}>■</span> صفر (مكسبت الجيم)
          </span>
          <span style={S.legendItem}>
            <span style={{ color: '#a78bfa' }}>■</span> الجيم الأخير
          </span>
        </div>

        {/* ── Action Button ── */}
        <button
          style={isRoundOver ? S.btnPrimary : S.btnContinue}
          onClick={onContinue}
        >
          {isRoundOver ? '🔄 جولة جديدة' : `ابدأ جيم ${currentGame} ←`}
        </button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 250, padding: '1rem',
    direction: 'rtl',
  },
  panel: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '1.25rem',
    padding: '1.5rem',
    width: '100%', maxWidth: 460,
    color: '#e2e8f0',
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    textAlign: 'center', marginBottom: '1.25rem', paddingBottom: '1rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  crownWrap: { fontSize: '2.5rem', marginBottom: 4 },
  winnerText: { margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24' },
  subtitle: { margin: 0, fontSize: '0.9rem', color: '#94a3b8' },
  progress: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: '50%', transition: 'background 0.3s' },
  gameLabel: { margin: 0, fontSize: '0.9rem', color: '#94a3b8' },
  tableWrap: { marginBottom: '0.75rem' },
  tableHeader: {
    display: 'flex', alignItems: 'center',
    padding: '4px 8px', marginBottom: 4,
    fontSize: '0.75rem', color: '#475569',
    fontWeight: 600, letterSpacing: '0.05em',
  },
  row: {
    display: 'flex', alignItems: 'center',
    padding: '8px',
    borderRadius: 8, marginBottom: 2,
    transition: 'background 0.2s',
  },
  colName: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '0.9rem', minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  colGame: {
    width: 32, textAlign: 'center',
    fontSize: '0.85rem', color: '#94a3b8',
    flexShrink: 0,
  },
  colTotal: {
    width: 52, textAlign: 'center',
    fontSize: '1rem', flexShrink: 0,
  },
  rankBadge: {
    background: '#7c3aed', color: 'white',
    fontSize: '0.65rem', fontWeight: 700,
    padding: '1px 5px', borderRadius: 4,
    flexShrink: 0,
  },
  botTag: {
    fontSize: '0.65rem', color: '#475569',
    background: 'rgba(255,255,255,0.08)',
    padding: '1px 4px', borderRadius: 3,
  },
  legend: {
    display: 'flex', gap: 16, justifyContent: 'center',
    fontSize: '0.75rem', color: '#64748b',
    marginBottom: '1rem',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  btnContinue: {
    width: '100%', padding: '0.875rem',
    background: '#7c3aed', color: 'white',
    border: 'none', borderRadius: 10,
    fontWeight: 700, fontSize: '1rem',
    cursor: 'pointer', letterSpacing: '0.02em',
    transition: 'background 0.15s',
  },
  btnPrimary: {
    width: '100%', padding: '0.875rem',
    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
    color: 'white', border: 'none', borderRadius: 10,
    fontWeight: 700, fontSize: '1.05rem',
    cursor: 'pointer', letterSpacing: '0.02em',
  },
};

export default ScorePanel;
