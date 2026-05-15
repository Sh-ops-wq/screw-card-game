# Screw Card Game — كل التعديلات المطلوبة

## ملخص التغييرات
1. زر سكرو يقفل اللعبة ويحسب النقاط
2. نظام جولات (5 جيمات للجولة)
3. 4 بوتات بدل 2
4. تقليل عبارات التشجيع
5. Score calculator مستوحى من skrew-scores.vercel.app
6. إصلاح الأخطاء العامة

---

## 1. server/src/game/Constants.ts — عدّل الأرقام دي

```typescript
// قبل
export const MAX_BOTS = 2;
export const GAMES_PER_ROUND = 1; // أو مفيش

// بعد
export const MAX_BOTS = 4;
export const GAMES_PER_ROUND = 5;
export const SCREW_UNLOCK_SECONDS = 600;
```

---

## 2. server/src/game/GameRoom.ts — أضف منطق الجولات والسكور

أضف في نهاية الـ interface أو type للـ Room:

```typescript
interface RoundState {
  currentGame: number;      // 1..5
  totalGames: number;       // = 5
  roundScores: Record<string, number>;  // playerId → مجموع النقاط في الجولة
  gameScores: Record<string, number[]>; // playerId → نقاط كل جيم
}
```

في دالة `endGame` (أو ما يعادلها) عدّل:

```typescript
function endGame(room: Room) {
  // احسب النقاط
  const scores = calculateScores(room);
  
  // أضف للجولة
  for (const [playerId, pts] of Object.entries(scores)) {
    room.roundState.roundScores[playerId] = 
      (room.roundState.roundScores[playerId] ?? 0) + pts;
    room.roundState.gameScores[playerId].push(pts);
  }
  
  room.roundState.currentGame++;
  
  if (room.roundState.currentGame > GAMES_PER_ROUND) {
    // انتهت الجولة — أرسل النتيجة النهائية
    io.to(room.id).emit('roundOver', {
      roundScores: room.roundState.roundScores,
      gameScores: room.roundState.gameScores,
      winner: getWinner(room.roundState.roundScores),
    });
    resetRound(room);
  } else {
    // ابدأ جيم جديد
    io.to(room.id).emit('gameOver', {
      scores,
      currentGame: room.roundState.currentGame,
      totalGames: GAMES_PER_ROUND,
      roundScores: room.roundState.roundScores,
    });
    startNewGame(room);
  }
}

function getWinner(scores: Record<string, number>): string {
  return Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
}
```

---

## 3. server/src/game/BotLogic.ts — رفع الحد لـ 4 بوتات

```typescript
// قبل
const MAX_BOT_COUNT = 2;

// بعد  
const MAX_BOT_COUNT = 4;
```

---

## 4. client/src/components/GameBoard.tsx — زر سكرو + نقاط

### زر سكرو الكبير
```tsx
// أضف الزرار ده في مكان واضح في اللعبة
{canCallScrew && (
  <button
    onClick={handleScrewCall}
    className="screw-btn"
    aria-label="اعلن سكرو"
  >
    SCREW
  </button>
)}
```

```css
/* في ملف الـ CSS أو styled component */
.screw-btn {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: #dc2626;
  color: white;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  padding: 1rem 3rem;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(220, 38, 38, 0.4);
  transition: transform 0.15s, box-shadow 0.15s;
  z-index: 100;
  animation: pulse-screw 2s infinite;
}

.screw-btn:hover {
  transform: translateX(-50%) scale(1.06);
  box-shadow: 0 8px 32px rgba(220, 38, 38, 0.5);
}

@keyframes pulse-screw {
  0%, 100% { box-shadow: 0 4px 24px rgba(220,38,38,0.4); }
  50%       { box-shadow: 0 4px 36px rgba(220,38,38,0.7); }
}
```

### Score Panel بعد كل جيم
```tsx
// component جديد ScorePanel.tsx
interface ScorePanelProps {
  scores: Record<string, number>;
  roundScores: Record<string, number>;
  gameScores: Record<string, number[]>;
  currentGame: number;
  totalGames: number;
  players: Player[];
  onNextGame: () => void;
}

export function ScorePanel({
  scores, roundScores, gameScores,
  currentGame, totalGames, players, onNextGame
}: ScorePanelProps) {
  const sorted = [...players].sort(
    (a, b) => (roundScores[a.id] ?? 0) - (roundScores[b.id] ?? 0)
  );

  return (
    <div className="score-overlay">
      <div className="score-card">
        <div className="score-header">
          <span>جيم {currentGame - 1} من {totalGames}</span>
          <h2>النتيجة</h2>
        </div>

        <table className="score-table">
          <thead>
            <tr>
              <th>اللاعب</th>
              {Array.from({ length: currentGame - 1 }, (_, i) => (
                <th key={i}>G{i + 1}</th>
              ))}
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => (
              <tr key={p.id} className={idx === 0 ? 'winner-row' : ''}>
                <td>{idx === 0 ? '👑 ' : ''}{p.nickname}</td>
                {(gameScores[p.id] ?? []).map((s, i) => (
                  <td key={i} className={s === 0 ? 'zero-score' : ''}>{s}</td>
                ))}
                <td className="total-score">{roundScores[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {currentGame <= totalGames ? (
          <button className="next-btn" onClick={onNextGame}>
            جيم {currentGame} ←
          </button>
        ) : (
          <div className="round-winner">
            🏆 {sorted[0].nickname} كسب الجولة!
          </div>
        )}
      </div>
    </div>
  );
}
```

```css
.score-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}
.score-card {
  background: #1a1a2e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 1rem;
  padding: 2rem;
  min-width: 360px;
  color: white;
}
.score-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
.score-table th, .score-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  text-align: center;
}
.score-table th { color: rgba(255,255,255,0.5); font-size: 0.8rem; }
.winner-row td { color: #fbbf24; font-weight: 700; }
.zero-score { color: #34d399; }
.total-score { font-weight: 700; font-size: 1.1rem; }
.next-btn {
  width: 100%; padding: 0.75rem;
  background: #7c3aed; color: white;
  border: none; border-radius: 0.5rem;
  font-size: 1rem; cursor: pointer;
  margin-top: 1rem;
}
.round-winner {
  text-align: center; font-size: 1.5rem;
  font-weight: 800; color: #fbbf24;
  margin-top: 1rem; padding: 1rem;
}
```

---

## 5. client/src/components/messages — تقليل عبارات التشجيع

ابحث في الكود عن الأرايز دي وقللها:

```typescript
// قبل — أرايز طويلة
const encouragements = [
  "رائع!", "أحسنت!", "ممتاز!", "عبقري!", "جميل!", "بارع!", ...
];

// بعد — 3 عبارات بس أو شيل الموضوع خالص
const encouragements = [
  "كويس", "ناجح", "تمام"
];

// أو شيل كل الـ toast messages التشجيعية
// وسيب بس الإعلانات المهمة زي: "سكرو!", "خسرت", "كسبت"
```

ابحث عن: `toast`, `notification`, `announcement`, `encouragement`, `celebrate`
واشيل أي messages مش ضرورية تشغيلياً.

---

## 6. إصلاح الأخطاء الشائعة

### Race condition في البوت
```typescript
// في BotLogic.ts — تأكد إن البوت ميعملش action لو الجيم انتهى
function botTakeTurn(room: Room, botId: string) {
  if (room.gameState.phase !== 'playing') return; // ← أضف الفحص ده
  if (room.gameState.currentTurn !== botId) return;
  // ... باقي المنطق
}
```

### Socket disconnect مع البوت
```typescript
// تأكد إن البوتات مش محتاجة reconnect
room.players = room.players.map(p => ({
  ...p,
  disconnectedAt: p.isBot ? null : p.disconnectedAt, // البوتات مش بتقطع
}));
```

### Memory leak في timers
```typescript
// في cleanup الـ room
function destroyRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.screwTimer);    // ← مهم
  clearInterval(room.botInterval);  // ← مهم
  rooms.delete(roomId);
}
```

---

## 7. ملف جديد: client/src/components/ScoreCalculator.tsx
(مستوحى من skrew-scores.vercel.app — شغال standalone جوه اللعبة)

انظر الملف المرفق `ScoreCalculator.tsx`
