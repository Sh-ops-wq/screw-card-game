/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH FILE — server/src/game/Constants.ts
 *  ابحث عن الثوابت دي وعدّل قيمها
 * ═══════════════════════════════════════════════════════════════
 */

// ─── server/src/game/Constants.ts ─────────────────────────────
export const MAX_BOTS = 4;            // ← كان 2
export const GAMES_PER_ROUND = 5;    // ← جديد
export const SCREW_UNLOCK_SECONDS = 600;
export const BOT_THINK_MS = 1200;    // وقت تفكير البوت
export const DISCONNECT_GRACE_MS = 120_000; // دقيقتين


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — server/src/game/GameRoom.ts  (أو اسمه عندك)
 *  أضف الـ RoundState وعدّل endGame
 * ═══════════════════════════════════════════════════════════════
 */

// ── أضف في نهاية imports أو types ────────────────────────────
export interface RoundState {
  currentGame: number;
  totalGames: number;
  roundScores: Record<string, number>;
  gameScores: Record<string, number[]>;
}

export function makeRoundState(playerIds: string[]): RoundState {
  return {
    currentGame: 1,
    totalGames: GAMES_PER_ROUND,
    roundScores: Object.fromEntries(playerIds.map(id => [id, 0])),
    gameScores:  Object.fromEntries(playerIds.map(id => [id, []])),
  };
}

// ── في endGame — أضف منطق الجولة ─────────────────────────────
/*
  عدّل الدالة اللي بتحسب نهاية الجيم:

  function endGame(room: Room, finalCardScores: Record<string, number>) {
    // ① أضف لنقاط الجولة
    const rs = room.roundState;
    for (const [id, pts] of Object.entries(finalCardScores)) {
      rs.roundScores[id] = (rs.roundScores[id] ?? 0) + pts;
      rs.gameScores[id].push(pts);
    }

    // ② أعلن نتيجة الجيم لكل اللاعبين
    io.to(room.id).emit('gameOver', {
      gameScores: finalCardScores,
      roundScores: rs.roundScores,
      gameHistory: rs.gameScores,
      currentGame: rs.currentGame,
      totalGames: rs.totalGames,
    });

    rs.currentGame++;

    // ③ لو انتهت الجولة
    if (rs.currentGame > rs.totalGames) {
      const sorted = Object.entries(rs.roundScores).sort((a, b) => a[1] - b[1]);
      io.to(room.id).emit('roundOver', {
        winner: sorted[0][0],
        finalScores: rs.roundScores,
        gameHistory: rs.gameScores,
      });
      room.roundState = makeRoundState(Object.keys(rs.roundScores));
      // setTimeout(() => startNewGame(room), 8000); // بعد 8 ثواني
    } else {
      // ④ ابدأ جيم جديد بعد delay
      setTimeout(() => startNewGame(room), 4000);
    }
  }
*/


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — server/src/game/BotLogic.ts
 * ═══════════════════════════════════════════════════════════════
 */

/*
  // ① رفع حد البوتات
  const MAX_BOT_COUNT = 4; // ← كان 2

  // ② فحص مهم قبل كل action
  function botTakeTurn(room: Room, botId: string) {
    if (!room) return;
    if (room.gameState?.phase !== 'playing') return;  // ← مهم
    if (room.gameState?.currentTurn !== botId) return; // ← مهم
    // ... باقي المنطق
  }
*/


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — client socket events (في useGameSocket.ts أو ما يشابهه)
 * ═══════════════════════════════════════════════════════════════
 */

/*
  // استقبل الـ events الجديدة
  socket.on('gameOver', (data: {
    gameScores: Record<string, number>;
    roundScores: Record<string, number>;
    gameHistory: Record<string, number[]>;
    currentGame: number;
    totalGames: number;
  }) => {
    setShowScorePanel(true);
    setScoreData(data);
  });

  socket.on('roundOver', (data: {
    winner: string;
    finalScores: Record<string, number>;
    gameHistory: Record<string, number[]>;
  }) => {
    setShowRoundOver(true);
    setRoundData(data);
  });
*/


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — تقليل عبارات التشجيع
 *  ابحث في الكود عن الأرايز دي وقللها
 * ═══════════════════════════════════════════════════════════════
 */

/*
  // ابحث عن:
  //   showToast(...)
  //   addNotification(...)
  //   playAnnouncement(...)
  // أو أي string arrays فيها مدح

  // احذف أو علّق كل ده:
  // "أحسنت!", "رائع!", "ممتاز!", "عبقري!", "برافو!", "جميل!", ...

  // سيب بس الإعلانات التشغيلية:
  const ANNOUNCEMENTS = {
    screwCalled: (name: string) => `${name} قال سكرو!`,
    gameWinner:  (name: string) => `${name} كسب الجيم`,
    roundWinner: (name: string) => `${name} كسب الجولة 🏆`,
    yourTurn: 'دورك',
    botThinking: '...',
  };
  // وشيل أي toast messages تانية غير ضرورية
*/


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — زر سكرو في GameBoard
 *  أضف الزرار ده بعد تحقق إن اللاعب عنده حق يقول سكرو
 * ═══════════════════════════════════════════════════════════════
 */

/*
  // في JSX:
  {isScrewUnlocked && !isMyTurnOver && (
    <button
      className="screw-btn"
      onClick={() => socket.emit('callScrew')}
    >
      SCREW
    </button>
  )}

  // CSS (أضف في ملف الـ CSS):
  .screw-btn {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 1.75rem;
    letter-spacing: 0.2em;
    padding: 1rem 3.5rem;
    border: 3px solid rgba(255,255,255,0.2);
    border-radius: 9999px;
    cursor: pointer;
    z-index: 100;
    animation: screw-pulse 1.5s ease-in-out infinite;
    -webkit-text-stroke: 1px rgba(0,0,0,0.3);
  }

  .screw-btn:active {
    transform: translateX(-50%) scale(0.95);
  }

  @keyframes screw-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(220,38,38,0.6),
                  0 8px 32px rgba(220,38,38,0.3);
    }
    50% {
      box-shadow: 0 0 0 12px rgba(220,38,38,0),
                  0 8px 48px rgba(220,38,38,0.5);
    }
  }
*/


/**
 * ═══════════════════════════════════════════════════════════════
 *  PATCH — إصلاح أخطاء الـ Memory Leaks
 * ═══════════════════════════════════════════════════════════════
 */

/*
  // في كل مكان بيعمل setTimeout أو setInterval:
  // احفظ الـ id واعمله clear لما الـ room تتحذف
  
  // مثال:
  const timers = new Map<string, NodeJS.Timeout>(); // خارج الدوال

  function scheduleBot(roomId: string, botId: string) {
    const t = setTimeout(() => botTakeTurn(roomId, botId), BOT_THINK_MS);
    timers.set(`${roomId}:${botId}`, t);
  }

  function cleanupRoom(roomId: string) {
    for (const [key, timer] of timers.entries()) {
      if (key.startsWith(roomId)) {
        clearTimeout(timer);
        timers.delete(key);
      }
    }
    rooms.delete(roomId);
  }
*/
