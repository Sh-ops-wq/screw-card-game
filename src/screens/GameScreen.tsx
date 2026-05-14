import { Clock, Copy, DoorOpen, Languages, ShieldAlert, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ActionPrompt, EmojiReaction, PeekMarker, PrivatePlayerState, PublicCard, PublicGameState, PublicPlayer, RoundEndedPayload } from '../../../shared/types';
import { revealKey } from '../App';
import { CardImage } from '../components/CardImage';
import { ScoreboardModal } from '../components/ScoreboardModal';
import { playSound } from '../game/sounds';
import { type Language, type TFunction } from '../i18n';

interface GameScreenProps {
  socket: Socket;
  identity: { roomCode: string; playerId: string; nickname: string };
  game: PublicGameState;
  privateState: PrivatePlayerState;
  reveals: Record<string, { card: PublicCard; expiresAt: number }>;
  prompt: ActionPrompt | null;
  emojiReactions: EmojiReaction[];
  roundEnded: RoundEndedPayload | null;
  language: Language;
  t: TFunction;
  soundEnabled: boolean;
  onLanguageChange: (language: Language) => void;
  onSoundToggle: () => void;
  onCloseScoreboard: () => void;
}

type HandMode = 'idle' | 'keep' | 'match' | 'peek-own' | 'swap-own';

export function GameScreen({
  socket, identity, game, privateState, reveals, prompt,
  emojiReactions, roundEnded, language, t, soundEnabled,
  onLanguageChange, onSoundToggle, onCloseScoreboard
}: GameScreenProps) {
  const [now, setNow] = useState(Date.now());
  const [handMode, setHandMode] = useState<HandMode>('idle');
  const [initialPeek, setInitialPeek] = useState<number[]>([]);
  const [peekAroundSelection, setPeekAroundSelection] = useState<number[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [showExitBtn, setShowExitBtn] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [eyeAnim, setEyeAnim] = useState(false);
  const [cardFlashIndex, setCardFlashIndex] = useState<number | null>(null);
  const lastTurnSignal = useRef<string>('');
  const gameStartTime = useRef<number>(Date.now());

  // Clock + exit button timer
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
      const elapsed = Date.now() - gameStartTime.current;
      if (elapsed > 90_000 && !showExitBtn) setShowExitBtn(true);
    }, 500);
    return () => window.clearInterval(interval);
  }, [showExitBtn]);

  // Reset game start time when game starts fresh
  useEffect(() => {
    if (game.phase === 'initialPeek') {
      gameStartTime.current = Date.now();
      setShowExitBtn(false);
    }
  }, [game.phase]);

  // Hand mode sync
  useEffect(() => {
    if (privateState.drawnCardSource === 'ground' && privateState.drawnCard) {
      setHandMode('keep');
      return;
    }
    if (!privateState.drawnCard && handMode === 'keep') setHandMode('idle');
    if (!prompt) {
      setHandMode((mode) => (mode === 'peek-own' || mode === 'swap-own' ? 'idle' : mode));
      setPeekAroundSelection([]);
    }
  }, [handMode, privateState.drawnCard, privateState.drawnCardSource, prompt]);

  // Sound on turn change
  useEffect(() => {
    if (!game.turnReadyAt || game.turnReadyAt <= Date.now() || !game.currentPlayerId) return;
    const signal = `${game.currentPlayerId}:${game.turnReadyAt}`;
    if (lastTurnSignal.current === signal) return;
    lastTurnSignal.current = signal;
    playSound('turn');
  }, [game.currentPlayerId, game.turnReadyAt]);

  // ── Auto-trigger mandatory action cards ───────────────────────────────
  useEffect(() => {
    if (!privateState.drawnCard || !privateState.canAct) return;
    if (privateState.drawnCardSource !== 'deck') return;
    const card = privateState.drawnCard;
    if (card.effectType === 'none' || card.effectType === 'thief') return;
    // Show card briefly then auto-trigger
    const timer = window.setTimeout(() => {
      socket.emit('useDrawnCardAction');
      playSound('button');
    }, 750);
    return () => window.clearTimeout(timer);
  }, [privateState.drawnCard, privateState.canAct, privateState.drawnCardSource, socket]);

  // ── Eye animation when peek action fires ─────────────────────────────
  useEffect(() => {
    if (game.phase === 'action') {
      setEyeAnim(true);
      const timer = window.setTimeout(() => setEyeAnim(false), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [game.phase]);

  // ── Flash card on reveal ──────────────────────────────────────────────
  useEffect(() => {
    const keys = Object.keys(reveals);
    const mine = keys.find((k) => k.startsWith(identity.playerId));
    if (mine) {
      const idx = parseInt(mine.split(':')[1], 10);
      setCardFlashIndex(idx);
      const t2 = window.setTimeout(() => setCardFlashIndex(null), 1000);
      return () => window.clearTimeout(t2);
    }
  }, [reveals, identity.playerId]);

  const me = game.players.find((p) => p.id === identity.playerId);
  const otherPlayers = game.players.filter((p) => p.id !== identity.playerId);
  const currentPlayer = game.players.find((p) => p.id === game.currentPlayerId);
  const screwSeconds = Math.max(0, Math.ceil(((game.screwUnlockAt ?? now) - now) / 1000));
  const isHost = game.hostId === identity.playerId;
  const isMyTurn = game.currentPlayerId === identity.playerId;
  const isInitialPeek = game.phase === 'initialPeek' && privateState.needsInitialPeek;
  const needsReplacement = handMode === 'keep' || privateState.drawnCardSource === 'ground';
  const isTurnTransitioning = Boolean(game.turnReadyAt && now < game.turnReadyAt && game.phase === 'playing');
  const turnStartsIn = Math.max(0, Math.ceil(((game.turnReadyAt ?? now) - now) / 1000));
  const canStartTurn = isMyTurn && !isTurnTransitioning && game.phase === 'playing' && !privateState.drawnCard && !prompt;
  const canDraw = privateState.canDraw || canStartTurn;
  const canTakeGround = privateState.canTakeGround || (canStartTurn && Boolean(game.discardTop));
  const canCallScrew = privateState.canCallScrew || (game.phase === 'playing' && !isTurnTransitioning && !game.finalRound && now >= (game.screwUnlockAt ?? 0));

  const handCards = privateState.hand.map((slot) => ({
    ...slot,
    revealedCard: reveals[revealKey(identity.playerId, slot.index)]?.card ?? slot.card
  }));

  // My peek markers (cards I've seen, or others have seen of mine)
  const myPeekMarkers = (game.peekMarkers ?? []).filter((m) => m.ownerId === identity.playerId);

  // Recent chat messages per player (last 30s)
  const recentChatByPlayer = (game.chatMessages ?? [])
    .filter((m) => Date.now() - m.createdAt < 30_000)
    .reduce<Record<string, string>>((acc, m) => { acc[m.playerId] = m.message; return acc; }, {});

  function handleOwnCard(index: number) {
    if (isInitialPeek) {
      const next = initialPeek.includes(index)
        ? initialPeek.filter((i) => i !== index)
        : initialPeek.length >= 2 ? [initialPeek[1], index] : [...initialPeek, index];
      setInitialPeek(next);
      if (next.length === 2) {
        window.setTimeout(() => { socket.emit('chooseInitialPeek', { cardIndexes: next }); setInitialPeek([]); }, 280);
      }
      return;
    }
    if (handMode === 'keep') { socket.emit('keepDrawnCard', { replaceIndex: index }); playSound('swap'); setHandMode('idle'); return; }
    if (handMode === 'match') { socket.emit('matchDiscard', { cardIndex: index }); setHandMode('idle'); return; }
    if (prompt?.type === 'selectOwnCard') { socket.emit('chooseOwnCard', { cardIndex: index }); return; }
    if (prompt?.type === 'confirmSwap' || handMode === 'swap-own') {
      socket.emit('confirmSwap', { swap: true, targetPlayerId: prompt?.targetPlayerId, targetCardIndex: prompt?.targetCardIndex, ownCardIndex: index });
      playSound('swap'); setHandMode('idle'); return;
    }
    if (handMode === 'peek-own' && prompt?.type === 'selectPeekAroundOption') {
      setPeekAroundSelection((cur) => {
        const next = cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index].slice(-2);
        if (next.length === 2) { socket.emit('chooseActionOption', { option: 'own', cardIndexes: next }); setHandMode('idle'); return []; }
        return next;
      });
      return;
    }
    if (!privateState.drawnCard && !prompt && game.phase === 'playing') { socket.emit('matchDiscard', { cardIndex: index }); playSound('button'); }
  }

  function handleOtherCard(playerId: string, cardIndex: number) {
    if (prompt?.type === 'selectTargetCard') socket.emit('chooseTargetCard', { targetPlayerId: playerId, cardIndex });
  }

  function drawFromDeck() { playSound('button'); socket.emit('drawCard'); }
  function takeFromGround() { playSound('button'); socket.emit('takeGroundCard'); }
  function copyRoom() { navigator.clipboard.writeText(`${window.location.origin}/?room=${game.roomCode}`).catch(() => undefined); playSound('button'); }
  function sendChat() {
    const message = chatDraft.trim();
    if (!message) return;
    socket.emit('sendChat', { message });
    setChatDraft('');
    playSound('button');
  }
  function sendReaction(emoji: string) { socket.emit('sendReaction', { emoji }); playSound('button'); }
  function leaveGame() { socket.disconnect(); window.location.reload(); }

  const isPeekAction = game.phase === 'action';

  return (
    <main className="game-table-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── Eye animation overlay ─────────────────────────── */}
      {eyeAnim && (
        <div className="eye-overlay" aria-hidden="true">
          <div className="eye-anim">👁</div>
        </div>
      )}

      {/* ── Exit confirm dialog ───────────────────────────── */}
      {showExitConfirm && (
        <div className="exit-confirm-overlay">
          <div className="exit-confirm-box">
            <h3>خروج من الجيم؟</h3>
            <p>لو خرجت دلوقتي هتتحسب عليك خسارة في الجولة.</p>
            <div className="exit-confirm-btns">
              <button className="exit-confirm-yes" onClick={leaveGame}>خروج</button>
              <button className="exit-confirm-no" onClick={() => setShowExitConfirm(false)}>رجوع</button>
            </div>
          </div>
        </div>
      )}

      <header className="table-hud">
        <div className="hud-pill">
          <span>{t('roomCode')}</span>
          <strong>{game.roomCode}</strong>
          <button className="hud-icon" type="button" onClick={copyRoom} aria-label={t('copyInvite')}>
            <Copy size={15} />
          </button>
        </div>
        <div className="hud-pill screw-word-pill">
          <strong>SCREW / سكرو</strong>
        </div>
        <div className={isMyTurn ? 'hud-pill hud-pill--turn' : 'hud-pill'}>
          <span>{isMyTurn ? t('yourTurn') : t('turn')}</span>
          <strong>{currentPlayer?.nickname ?? t('waiting')}</strong>
        </div>
        <div className="hud-actions">
          <button className="hud-icon" type="button" onClick={() => onLanguageChange(language === 'en' ? 'ar' : 'en')} aria-label={t('language')}>
            <Languages size={15} />
          </button>
          <button className="hud-icon" type="button" onClick={onSoundToggle} aria-label={t('sound')}>
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          {showExitBtn && (
            <button className="hud-icon hud-exit" type="button" onClick={() => setShowExitConfirm(true)} aria-label="خروج">
              <DoorOpen size={15} />
            </button>
          )}
        </div>
      </header>

      <section className="card-table-stage">
        <div className="felt-table">
          {otherPlayers.map((player, index) => (
            <OpponentSeat
              key={player.id}
              player={player}
              position={seatPosition(index, otherPlayers.length)}
              isCurrent={player.id === game.currentPlayerId}
              reveals={reveals}
              onCardClick={handleOtherCard}
              t={t}
              reactions={emojiReactions.filter((r) => r.playerId === player.id)}
              peekMarkers={(game.peekMarkers ?? []).filter((m) => m.ownerId === player.id)}
              recentChat={recentChatByPlayer[player.id]}
              isPeekTarget={isPeekAction && prompt?.targetPlayerId === player.id}
            />
          ))}

          <div className="center-play-area">
            <div className="table-state">
              <span>{isTurnTransitioning ? t('nextTurn') : phaseTitle(game.phase, isMyTurn, t)}</span>
              <strong>{currentPlayer?.nickname ?? t('waiting')}</strong>
            </div>

            <div className="center-piles">
              <div className={canDraw ? 'table-pile is-live' : 'table-pile'}>
                <CardImage hidden onClick={canDraw ? drawFromDeck : undefined} selectable={canDraw} size="medium" />
                <span>{t('drawFromDeck')}</span>
                <em>{game.drawPileCount} {t('cardsLeft')}</em>
              </div>
              <div className={canTakeGround ? 'table-pile is-live' : 'table-pile'}>
                <CardImage cardId={game.discardTop?.id} hidden={!game.discardTop} onClick={canTakeGround ? takeFromGround : undefined} selectable={canTakeGround} size="medium" />
                <span>{t('takeFromGround')}</span>
              </div>
            </div>

            {isTurnTransitioning ? (
              <div className="turn-transition-bubble">
                <span>{t('nextTurn')}</span>
                <strong>{currentPlayer?.nickname ?? t('waiting')}</strong>
                <em>{turnStartsIn}</em>
              </div>
            ) : null}

            {/* Auto-triggered cards — show brief loading state */}
            {privateState.drawnCard && privateState.canAct &&
             privateState.drawnCardSource === 'deck' &&
             privateState.drawnCard.effectType !== 'none' &&
             privateState.drawnCard.effectType !== 'thief' ? (
              <div className="drawn-floating drawn-floating--auto">
                <CardImage cardId={privateState.drawnCard.id} size="large" />
                <div className="auto-action-badge">⚡ أكشن تلقائي</div>
              </div>
            ) : privateState.drawnCard ? (
              <DrawnCardControls
                card={privateState.drawnCard}
                source={privateState.drawnCardSource}
                canAct={privateState.canAct}
                game={game}
                handMode={handMode}
                t={t}
                onUse={() => socket.emit('useDrawnCardAction')}
                onKeep={() => setHandMode('keep')}
                onDiscard={() => { socket.emit('discardDrawnCard'); playSound('discard'); }}
              />
            ) : null}

            {prompt ? (
              <ActionPromptBubble
                prompt={prompt}
                players={otherPlayers}
                handMode={handMode}
                setHandMode={setHandMode}
                t={t}
                onTarget={(targetPlayerId) => socket.emit('chooseTargetPlayer', { targetPlayerId })}
                onPeekOthers={() => socket.emit('chooseActionOption', { option: 'others' })}
                onSkipSwap={() => socket.emit('confirmSwap', { swap: false })}
              />
            ) : null}

            {game.finalRound && game.phase !== 'roundEnded' ? (
              <div className="final-round-banner table-final-banner">
                <ShieldAlert size={18} /> {t('roundClosedByScrew')}: {game.players.find((p) => p.id === game.screwCallerId)?.nickname ?? t('winner')}
              </div>
            ) : null}
          </div>
        </div>

        {/* ── My hand ──────────────────────────────────────── */}
        <section className={needsReplacement ? 'player-hand-bar is-selecting' : 'player-hand-bar'}>
          <div className="player-hand-title">
            <span>{t('yourHand')}</span>
            <strong>{me?.nickname ?? identity.nickname}</strong>
          </div>
          <div className="player-hand-cards">
            {handCards.map((slot) => {
              const hasPeek = myPeekMarkers.some((m) => m.index === slot.index);
              const isFlashing = cardFlashIndex === slot.index;
              return (
                <div key={slot.index} className={`card-slot-wrap ${isFlashing ? 'card-flip-anim' : ''}`}>
                  <CardImage
                    cardId={slot.revealedCard?.id}
                    hidden={!slot.revealedCard}
                    selected={initialPeek.includes(slot.index) || peekAroundSelection.includes(slot.index)}
                    selectable
                    size="large"
                    onClick={() => handleOwnCard(slot.index)}
                  />
                  {hasPeek && (
                    <div className="peek-eye-badge" title={myPeekMarkers.find(m => m.index === slot.index)?.peekerName}>
                      👁
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="table-hint">{handHint(game.phase, privateState, prompt, handMode, canDraw, canTakeGround, isTurnTransitioning, t)}</p>
        </section>

        {/* ── Chat + Log ───────────────────────────────────── */}
        <div className="table-log-shell">
          <div className="reaction-rail">
            {['🔥', '😂', '😈', '🧠', '👏', '💀', '👀', '⚡'].map((emoji) => (
              <button key={emoji} type="button" onClick={() => sendReaction(emoji)}>{emoji}</button>
            ))}
          </div>
          {emojiReactions.filter((r) => r.playerId === identity.playerId).map((r) => (
            <div className="reaction-pop reaction-pop--me" key={r.id}>{r.emoji}</div>
          ))}
          <button className="log-toggle" type="button" onClick={() => setChatOpen((o) => !o)}>
            {t('chat')} {Object.keys(recentChatByPlayer).length > 0 ? '💬' : ''}
          </button>
          {chatOpen ? (
            <div className="chat-panel">
              <div className="chat-messages">
                {(game.chatMessages ?? []).slice(-10).map((msg) => (
                  <p key={msg.id} className={msg.playerId === identity.playerId ? 'chat-mine' : ''}>
                    <strong>{msg.nickname}</strong> {msg.message}
                  </p>
                ))}
              </div>
              <div className="chat-compose">
                <input
                  value={chatDraft}
                  maxLength={160}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                  placeholder={t('chat')}
                />
                <button type="button" onClick={sendChat}>{t('send')}</button>
              </div>
            </div>
          ) : null}
          <button className="log-toggle" type="button" onClick={() => setLogOpen((o) => !o)}>
            {t('log')}
          </button>
          {logOpen ? (
            <div className="compact-log">
              {game.log.slice(-10).map((entry, i) => <p key={`${entry}-${i}`}>{entry}</p>)}
            </div>
          ) : (
            <div className="table-log-ticker">{game.log.at(-1) ?? t('waiting')}</div>
          )}
        </div>
      </section>

      {game.phase === 'paused' ? <div className="pause-banner">{game.pausedReason ?? 'متوقف.'}</div> : null}

      {/* ── BIG SCREW BUTTON ─────────────────────────────── */}
      {canCallScrew ? (
        <button
          className="screw-call-btn"
          type="button"
          onClick={() => { socket.emit('callScrew'); playSound('button'); }}
          aria-label={t('callScrew')}
        >
          {t('callScrew')}
        </button>
      ) : null}

      <ScoreboardModal payload={roundEnded} onClose={onCloseScoreboard} onRestart={() => socket.emit('restartRound')} canRestart={isHost} t={t} />
    </main>
  );
}

/* ─── DrawnCardControls ────────────────────────────────────────── */
function DrawnCardControls({ card, source, canAct, game, handMode, t, onUse, onKeep, onDiscard }: {
  card: PublicCard; source: 'deck' | 'ground' | null; canAct: boolean;
  game: PublicGameState; handMode: HandMode; t: TFunction;
  onUse: () => void; onKeep: () => void; onDiscard: () => void;
}) {
  if (source === 'ground') {
    return (
      <div className="drawn-floating drawn-floating--ground">
        <CardImage cardId={card.id} size="large" />
        <strong>{t('chooseCard')}</strong>
        <span>{t('takeFromGround')}</span>
      </div>
    );
  }
  const isMandatory = card.effectType !== 'none' && card.effectType !== 'thief';
  return (
    <div className="drawn-floating">
      <CardImage cardId={card.id} size="large" />
      {isMandatory ? (
        <div className="drawn-buttons">
          <button className="clean-action clean-action--highlight" type="button" disabled={!canAct} onClick={onUse}>
            ⚡ {t('useAction')}
          </button>
        </div>
      ) : (
        <div className="drawn-buttons">
          <button className="clean-action" type="button" disabled={!canAct} onClick={onKeep}>
            {handMode === 'keep' ? t('chooseCard') : t('keep')}
          </button>
          <button className="clean-action" type="button" disabled={!canAct} onClick={onDiscard}>
            {t('discard')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── ActionPromptBubble ───────────────────────────────────────── */
function ActionPromptBubble({ prompt, players, handMode, setHandMode, t, onTarget, onPeekOthers, onSkipSwap }: {
  prompt: ActionPrompt; players: PublicPlayer[]; handMode: HandMode;
  setHandMode: (m: HandMode) => void; t: TFunction;
  onTarget: (id: string) => void; onPeekOthers: () => void; onSkipSwap: () => void;
}) {
  return (
    <div className="action-bubble action-bubble--glow">
      <strong>{prompt.message}</strong>
      {prompt.type === 'selectTargetPlayer' ? (
        <div className="bubble-buttons">
          {players.map((p) => (
            <button className="clean-action" key={p.id} type="button" onClick={() => onTarget(p.id)}>
              {p.nickname}
            </button>
          ))}
        </div>
      ) : null}
      {prompt.type === 'selectPeekAroundOption' ? (
        <div className="bubble-buttons">
          <button className="clean-action" type="button" onClick={() => setHandMode(handMode === 'peek-own' ? 'idle' : 'peek-own')}>
            {t('chooseCard')} x2
          </button>
          <button className="clean-action" type="button" onClick={onPeekOthers}>
            {t('choosePlayer')}
          </button>
        </div>
      ) : null}
      {prompt.type === 'confirmSwap' ? (
        <div className="bubble-buttons">
          <button className="clean-action" type="button" onClick={() => setHandMode('swap-own')}>{t('chooseCard')}</button>
          <button className="clean-action" type="button" onClick={onSkipSwap}>{t('discard')}</button>
        </div>
      ) : null}
    </div>
  );
}

/* ─── OpponentSeat ─────────────────────────────────────────────── */
function OpponentSeat({ player, position, isCurrent, reveals, onCardClick, t, reactions, peekMarkers, recentChat, isPeekTarget }: {
  player: PublicPlayer; position: string; isCurrent: boolean;
  reveals: Record<string, { card: PublicCard; expiresAt: number }>;
  onCardClick: (playerId: string, cardIndex: number) => void;
  t: TFunction; reactions: EmojiReaction[];
  peekMarkers: PeekMarker[];
  recentChat?: string;
  isPeekTarget?: boolean;
}) {
  const vertical = position === 'left' || position === 'right';
  return (
    <section className={[
      'table-seat', `table-seat--${position}`,
      isCurrent ? 'is-current' : '',
      vertical ? 'is-side-seat' : '',
      isPeekTarget ? 'is-peek-target' : ''
    ].join(' ')}>
      <div className="table-seat-name">
        <strong>{player.nickname}</strong>
        <span>{player.handSize}</span>
      </div>

      {/* Chat bubble near this player */}
      {recentChat && (
        <div className="player-chat-bubble">
          {recentChat}
        </div>
      )}

      {reactions.map((r) => (
        <div className="reaction-pop" key={r.id}>{r.emoji}</div>
      ))}

      <div className="table-seat-cards">
        {Array.from({ length: player.handSize }, (_, index) => {
          const revealed = reveals[revealKey(player.id, index)]?.card;
          const hasPeek = peekMarkers.some((m) => m.index === index);
          const peekerName = peekMarkers.find((m) => m.index === index)?.peekerName;
          return (
            <div key={`${player.id}-${index}`} className="card-slot-wrap">
              <CardImage
                cardId={revealed?.id}
                hidden={!revealed}
                onClick={() => onCardClick(player.id, index)}
                selectable
                size="small"
              />
              {hasPeek && (
                <div className="peek-eye-badge" title={`${peekerName} شافها`}>👁</div>
              )}
            </div>
          );
        })}
      </div>
      {!player.connected ? <em>{t('reserved')}</em> : null}
    </section>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────── */
function seatPosition(index: number, count: number): string {
  const layouts: Record<number, string[]> = {
    1: ['top'], 2: ['left', 'right'], 3: ['top', 'left', 'right'],
    4: ['top-left', 'top-right', 'left', 'right'],
    5: ['top-left', 'top', 'top-right', 'left', 'right']
  };
  return (layouts[count] ?? layouts[5])[index] ?? 'top';
}

function phaseTitle(phase: string, isMyTurn: boolean, t: TFunction): string {
  if (phase === 'initialPeek') return t('chooseCard');
  if (phase === 'paused') return t('waiting');
  if (phase === 'roundEnded') return t('scoreboard');
  return isMyTurn ? t('yourTurn') : t('turn');
}

function handHint(phase: string, privateState: PrivatePlayerState, prompt: ActionPrompt | null, handMode: HandMode, canDraw: boolean, canTakeGround: boolean, isTurnTransitioning: boolean, t: TFunction): string {
  if (phase === 'initialPeek' && privateState.needsInitialPeek) return `${t('chooseCard')} x2`;
  if (isTurnTransitioning) return t('nextTurn');
  if (privateState.drawnCardSource === 'ground') return `${t('chooseCard')} - ${t('takeFromGround')}`;
  if (privateState.drawnCard) return `${t('keep')} / ${t('discard')} / ${t('useAction')}`;
  if (handMode === 'keep') return `${t('chooseCard')} - ${t('keep')}`;
  if (prompt) return prompt.message;
  return canDraw || canTakeGround ? `${t('drawFromDeck')} / ${t('takeFromGround')}` : t('waiting');
}
