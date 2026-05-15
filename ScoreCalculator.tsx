/**
 * ScoreCalculator.tsx
 * آلة حساب النقاط — مستوحاة من skrew-scores.vercel.app
 * ضع الملف في: client/src/components/ScoreCalculator.tsx
 * 
 * الاستخدام:
 *   import { ScoreCalculator } from './ScoreCalculator';
 *   <ScoreCalculator players={room.players} onClose={() => setShowCalc(false)} />
 */

import React, { useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Player {
  id: string;
  nickname: string;
  isBot?: boolean;
}

interface GameEntry {
  gameNum: number;
  scores: Record<string, number>;   // playerId → نقاط
  screwCallerId?: string;            // اللي قال سكرو
  screwPenalty?: boolean;            // اتضاعفت نقاطه؟
}

interface ScoreCalculatorProps {
  players: Player[];
  totalGames?: number;
  onClose?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sumScores(entries: GameEntry[], playerId: string): number {
  return entries.reduce((acc, e) => acc + (e.scores[playerId] ?? 0), 0);
}

function getRankIcon(rank: number): string {
  return rank === 0 ? '👑' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
}

// ── Main Component ─────────────────────────────────────────────────────────
export function ScoreCalculator({ players, totalGames = 5, onClose }: ScoreCalculatorProps) {
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [currentScores, setCurrentScores] = useState<Record<string, string>>(
    Object.fromEntries(players.map(p => [p.id, '']))
  );
  const [screwCaller, setScrewCaller] = useState<string>('');
  const [penaltyOn, setPenaltyOn] = useState(false);
  const [roundOver, setRoundOver] = useState(false);

  const gameNum = entries.length + 1;
  const isLastGame = gameNum > totalGames;

  // احسب المجاميع
  const totals = players.map(p => ({
    player: p,
    total: sumScores(entries, p.id),
  })).sort((a, b) => a.total - b.total);

  const handleAddGame = useCallback(() => {
    // Validate
    const parsed: Record<string, number> = {};
    for (const p of players) {
      const raw = currentScores[p.id];
      const val = parseInt(raw, 10);
      if (isNaN(val)) return; // مش هيضيف لو في قيمة فاضية
      let finalVal = val;
      // لو هو اللي قال سكرو وراح عليه العقوبة
      if (p.id === screwCaller && penaltyOn) {
        finalVal = val * 2;
      }
      parsed[p.id] = finalVal;
    }

    const newEntry: GameEntry = {
      gameNum,
      scores: parsed,
      screwCallerId: screwCaller || undefined,
      screwPenalty: penaltyOn,
    };

    const updated = [...entries, newEntry];
    setEntries(updated);
    setCurrentScores(Object.fromEntries(players.map(p => [p.id, ''])));
    setScrewCaller('');
    setPenaltyOn(false);

    if (updated.length >= totalGames) {
      setRoundOver(true);
    }
  }, [currentScores, screwCaller, penaltyOn, entries, gameNum, players, totalGames]);

  const handleReset = () => {
    setEntries([]);
    setCurrentScores(Object.fromEntries(players.map(p => [p.id, ''])));
    setScrewCaller('');
    setPenaltyOn(false);
    setRoundOver(false);
  };

  // ── Render: Round Over ─────────────────────────────────────────────────
  if (roundOver) {
    const winner = totals[0];
    return (
      <div style={styles.overlay}>
        <div style={styles.card}>
          <div style={styles.roundOverHeader}>
            <span style={styles.trophy}>🏆</span>
            <h2 style={styles.winnerName}>{winner.player.nickname}</h2>
            <p style={styles.winnerSub}>كسب الجولة بـ {winner.total} نقطة</p>
          </div>

          <div style={styles.finalTable}>
            {totals.map((t, idx) => (
              <div key={t.player.id} style={{
                ...styles.finalRow,
                background: idx === 0 ? 'rgba(251,191,36,0.1)' : 'transparent',
              }}>
                <span style={styles.rankIcon}>{getRankIcon(idx)}</span>
                <span style={styles.playerNameFinal}>{t.player.nickname}</span>
                <span style={{
                  ...styles.totalScore,
                  color: idx === 0 ? '#fbbf24' : '#e2e8f0',
                }}>{t.total}</span>
              </div>
            ))}
          </div>

          <div style={styles.buttonRow}>
            <button style={styles.resetBtn} onClick={handleReset}>جولة جديدة</button>
            {onClose && (
              <button style={styles.closeBtn} onClick={onClose}>إغلاق</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Input Form ─────────────────────────────────────────────────
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.gameTag}>جيم {gameNum} من {totalGames}</span>
          <h2 style={styles.title}>أدخل النقاط</h2>
          {onClose && (
            <button style={styles.xBtn} onClick={onClose} aria-label="إغلاق">✕</button>
          )}
        </div>

        {/* Score inputs */}
        <div style={styles.inputGrid}>
          {players.map(p => (
            <div key={p.id} style={styles.inputRow}>
              <label style={styles.label}>{p.nickname}</label>
              <input
                type="number"
                min={-1}
                max={99}
                style={styles.input}
                value={currentScores[p.id]}
                onChange={e => setCurrentScores(prev => ({
                  ...prev,
                  [p.id]: e.target.value,
                }))}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {/* Screw caller */}
        <div style={styles.screwSection}>
          <label style={styles.screwLabel}>مين قال سكرو؟</label>
          <select
            style={styles.select}
            value={screwCaller}
            onChange={e => setScrewCaller(e.target.value)}
          >
            <option value="">محدش</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.nickname}</option>
            ))}
          </select>

          {screwCaller && (
            <label style={styles.penaltyLabel}>
              <input
                type="checkbox"
                checked={penaltyOn}
                onChange={e => setPenaltyOn(e.target.checked)}
                style={{ marginLeft: 8 }}
              />
              عليه عقوبة؟ (نقاطه × 2)
            </label>
          )}
        </div>

        {/* Add button */}
        <button style={styles.addBtn} onClick={handleAddGame}>
          {gameNum === totalGames ? 'احسب النتيجة النهائية' : `أضف جيم ${gameNum}`}
        </button>

        {/* Scoreboard so far */}
        {entries.length > 0 && (
          <div style={styles.scoreboard}>
            <p style={styles.scoreboardTitle}>النتائج حتى الآن</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اللاعب</th>
                  {entries.map(e => (
                    <th key={e.gameNum} style={styles.th}>G{e.gameNum}</th>
                  ))}
                  <th style={styles.th}>المجموع</th>
                </tr>
              </thead>
              <tbody>
                {totals.map(({ player, total }) => (
                  <tr key={player.id}>
                    <td style={styles.td}>{player.nickname}</td>
                    {entries.map(e => {
                      const s = e.scores[player.id] ?? 0;
                      const isPenalty = e.screwCallerId === player.id && e.screwPenalty;
                      return (
                        <td key={e.gameNum} style={{
                          ...styles.td,
                          color: s === 0 ? '#34d399' : isPenalty ? '#f87171' : '#e2e8f0',
                          fontWeight: isPenalty ? 700 : 400,
                        }}>
                          {s}
                          {isPenalty && <span style={{ fontSize: '0.6rem' }}> ✱2</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...styles.td, fontWeight: 700, color: '#fbbf24' }}>
                      {total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, padding: '1rem',
  },
  card: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '1.25rem',
    padding: '1.5rem',
    width: '100%', maxWidth: 480,
    maxHeight: '90vh', overflowY: 'auto',
    color: '#e2e8f0',
    direction: 'rtl',
  },
  header: {
    display: 'flex', alignItems: 'center',
    gap: 12, marginBottom: '1.25rem',
    position: 'relative',
  },
  title: {
    margin: 0, fontSize: '1.2rem', fontWeight: 700, flex: 1,
    color: '#f8fafc',
  },
  gameTag: {
    background: '#7c3aed', color: 'white',
    fontSize: '0.75rem', fontWeight: 700,
    padding: '4px 10px', borderRadius: 999,
  },
  xBtn: {
    background: 'transparent', border: 'none',
    color: '#94a3b8', cursor: 'pointer',
    fontSize: '1rem', padding: '4px 8px',
  },
  inputGrid: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1rem' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontSize: '0.95rem', color: '#cbd5e1' },
  input: {
    width: 80, padding: '8px 12px',
    background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8, color: '#f8fafc', fontSize: '1rem',
    textAlign: 'center', outline: 'none',
  },
  screwSection: {
    background: '#1e293b', borderRadius: 10,
    padding: '0.75rem 1rem', marginBottom: '1rem',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  screwLabel: { fontSize: '0.85rem', color: '#94a3b8' },
  select: {
    background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8, color: '#f8fafc', padding: '6px 10px',
    fontSize: '0.9rem', width: '100%', outline: 'none',
  },
  penaltyLabel: { fontSize: '0.85rem', color: '#f87171', display: 'flex', alignItems: 'center', cursor: 'pointer' },
  addBtn: {
    width: '100%', padding: '0.85rem',
    background: '#7c3aed', color: 'white',
    border: 'none', borderRadius: 10,
    fontWeight: 700, fontSize: '1rem',
    cursor: 'pointer', marginBottom: '1rem',
    letterSpacing: '0.02em',
  },
  scoreboard: { marginTop: '0.5rem' },
  scoreboardTitle: { fontSize: '0.8rem', color: '#64748b', marginBottom: 8 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontSize: '0.75rem', color: '#64748b',
    padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)',
    textAlign: 'center',
  },
  td: {
    fontSize: '0.9rem', padding: '6px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    textAlign: 'center', color: '#e2e8f0',
  },
  // Round Over styles
  roundOverHeader: { textAlign: 'center', marginBottom: '1.5rem' },
  trophy: { fontSize: '3rem', display: 'block', marginBottom: 8 },
  winnerName: { margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24' },
  winnerSub: { margin: '4px 0 0', color: '#94a3b8', fontSize: '0.9rem' },
  finalTable: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.5rem' },
  finalRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.07)',
  },
  rankIcon: { fontSize: '1.1rem', minWidth: 28, textAlign: 'center' },
  playerNameFinal: { flex: 1, fontSize: '0.95rem', color: '#e2e8f0' },
  totalScore: { fontWeight: 700, fontSize: '1.2rem' },
  buttonRow: { display: 'flex', gap: 10 },
  resetBtn: {
    flex: 1, padding: '0.75rem',
    background: '#7c3aed', color: 'white',
    border: 'none', borderRadius: 10,
    fontWeight: 700, cursor: 'pointer',
  },
  closeBtn: {
    padding: '0.75rem 1.25rem',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, cursor: 'pointer',
  },
};

export default ScoreCalculator;
