import { Copy, DoorOpen, Eye, Languages, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
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

export function GameScreen({ socket, identity, game, privateState, reveals, prompt, emojiReactions, roundEnded, language, t, soundEnabled, onLanguageChange, onSoundToggle, onCloseScoreboard }: GameScreenProps) {
  const [now, setNow] = useState(Date.now());
  const [handMode, setHandMode] = useState<HandMode>('idle');
  const [initialPeek, setInitialPeek] = useState<number[]>([]);
  const [peekAroundSelection, setPeekAroundSelection] = useState<number[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [eyeAnim, setEyeAnim] = useState(false);
  const [cardFlashIndex, setCardFlashIndex] = useState<number | null>(null);
  const lastTurnSignal = useRef('');
  const gameStartTime = useRef(Date.now());

  /* ── Clock + exit button timer ── */
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (game.roundStartedAt) {
      gameStartTime.current = game.roundStartedAt;
      return;
    }
    if (game.phase === 'initialPeek') {
      gameStartTime.current = Date.now();
    }
  }, [game.phase, game.roundStartedAt]);

  /* ── Hand mode sync ── */
  useEffect(() => {
    if (privateState.drawnCardSource === 'ground' && privateState.drawnCard) { setHandMode('keep'); return; }
    if (!privateState.drawnCard && handMode === 'keep') setHandMode('idle');
    if (!prompt) { setHandMode(m => (m === 'peek-own' || m === 'swap-own' ? 'idle' : m)); setPeekAroundSelection([]); }
  }, [handMode, privateState.drawnCard, privateState.drawnCardSource, prompt]);

  /* ── Turn sound ── */
  useEffect(() => {
    if (!game.turnReadyAt || !game.currentPlayerId) return;
    const sig = `${game.currentPlayerId}:${game.turnReadyAt}`;
    if (lastTurnSignal.current === sig) return;
    lastTurnSignal.current = sig;
    playSound('turn');
  }, [game.currentPlayerId, game.turnReadyAt]);

  /* ── Auto-trigger mandatory action cards (client-side enforcement) ── */
  useEffect(() => {
    if (!privateState.drawnCard || !privateState.canAct || privateState.drawnCardSource !== 'deck') return;
    const e = privateState.drawnCard.effectType;
    if (e === 'none') return;
    const id = window.setTimeout(() => { socket.emit('useDrawnCardAction'); playSound('button'); }, 750);
    return () => window.clearTimeout(id);
  }, [privateState.drawnCard, privateState.canAct, privateState.drawnCardSource, socket]);

  /* ── Eye animation on action phase ── */
  useEffect(() => {
    if (game.phase !== 'action') return;
    setEyeAnim(true);
    const id = window.setTimeout(() => setEyeAnim(false), 1800);
    return () => window.clearTimeout(id);
  }, [game.phase]);

  /* ── Card flash on reveal ── */
  useEffect(() => {
    const mine = Object.keys(reveals).find(k => k.startsWith(identity.playerId + ':'));
    if (!mine) return;
    const idx = parseInt(mine.split(':')[1], 10);
    setCardFlashIndex(idx);
    const id = window.setTimeout(() => setCardFlashIndex(null), 900);
    return () => window.clearTimeout(id);
  }, [reveals, identity.playerId]);

  const me = game.players.find(p => p.id === identity.playerId);
  const otherPlayers = game.players.filter(p => p.id !== identity.playerId);
  const currentPlayer = game.players.find(p => p.id === game.currentPlayerId);
  const isHost = game.hostId === identity.playerId;
  const isMyTurn = game.currentPlayerId === identity.playerId;
  const isInitialPeek = game.phase === 'initialPeek' && privateState.needsInitialPeek;
  const isTurnTransitioning = Boolean(game.turnReadyAt && now < game.turnReadyAt && game.phase === 'playing');
  const turnStartsIn = Math.max(0, Math.ceil(((game.turnReadyAt ?? now) - now) / 1000));
  const canStartTurn = isMyTurn && !isTurnTransitioning && game.phase === 'playing' && !privateState.drawnCard && !prompt;
  const canDraw = privateState.canDraw || canStartTurn;
  const canTakeGround = (privateState.canTakeGround || (canStartTurn && Boolean(game.discardTop)));
  /* SCREW always unlocked (SCREW_UNLOCK_MS = 0) */
  const canCallScrew = privateState.canCallScrew || (game.phase === 'playing' && !isTurnTransitioning && !game.finalRound && now >= (game.screwUnlockAt ?? 0));
  const needsReplacement = handMode === 'keep' || privateState.drawnCardSource === 'ground';
  const showExitBtn = game.phase !== 'lobby' && now - gameStartTime.current >= 90_000;

  const handCards = privateState.hand.map(slot => ({ ...slot, revealedCard: reveals[revealKey(identity.playerId, slot.index)]?.card ?? slot.card }));
  const myPeekMarkers = (game.peekMarkers ?? []).filter(m => m.ownerId === identity.playerId);
  const recentChatByPlayer = (game.chatMessages ?? [])
    .filter(m => Date.now() - m.createdAt < 28_000)
    .reduce<Record<string, string>>((acc, m) => { acc[m.playerId] = m.message; return acc; }, {});

  function handleOwnCard(index: number) {
    if (isInitialPeek) {
      const next = initialPeek.includes(index) ? initialPeek.filter(i => i !== index) : initialPeek.length >= 2 ? [initialPeek[1], index] : [...initialPeek, index];
      setInitialPeek(next);
      if (next.length === 2) { window.setTimeout(() => { socket.emit('chooseInitialPeek', { cardIndexes: next }); setInitialPeek([]); }, 280); }
      return;
    }
    if (handMode === 'keep') { socket.emit('keepDrawnCard', { replaceIndex: index }); playSound('swap'); setHandMode('idle'); return; }
    if (handMode === 'match') { socket.emit('matchDiscard', { cardIndex: index }); setHandMode('idle'); return; }
    if (prompt?.type === 'selectOwnCard') { socket.emit('chooseOwnCard', { cardIndex: index }); return; }
    if (prompt?.type === 'confirmSwap' || handMode === 'swap-own') { socket.emit('confirmSwap', { swap: true, targetPlayerId: prompt?.targetPlayerId, targetCardIndex: prompt?.targetCardIndex, ownCardIndex: index }); playSound('swap'); setHandMode('idle'); return; }
    if (handMode === 'peek-own' && prompt?.type === 'selectPeekAroundOption') {
      setPeekAroundSelection(cur => {
        const next = cur.includes(index) ? cur.filter(i => i !== index) : [...cur, index].slice(-2);
        if (next.length === 2) { socket.emit('chooseActionOption', { option: 'own', cardIndexes: next }); setHandMode('idle'); return []; }
        return next;
      });
      return;
    }
    if (!privateState.drawnCard && !prompt && game.phase === 'playing') socket.emit('matchDiscard', { cardIndex: index });
  }

  function handleOtherCard(playerId: string, cardIndex: number) {
    if (prompt?.type === 'selectTargetCard') socket.emit('chooseTargetCard', { targetPlayerId: playerId, cardIndex });
  }

  function sendChat() {
    const msg = chatDraft.trim();
    if (!msg) return;
    socket.emit('sendChat', { message: msg });
    setChatDraft('');
    playSound('button');
  }

  function leaveGame() { socket.disconnect(); window.location.reload(); }

  return (
    <main className="game-table-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── 👁 Eye animation ── */}
      {eyeAnim && <div className="eye-overlay" aria-hidden><div className="eye-anim"><Eye size={54} /></div></div>}

      {/* ── 🚪 Exit confirm ── */}
      {showExitConfirm && (
        <div className="exit-confirm-overlay">
          <div className="exit-confirm-box">
            <h3>خروج من الجيم؟</h3>
            <p>{language === 'ar' ? 'هتطلع من الروم بعد التأكيد.' : 'Confirm before leaving the room.'}</p>
            <div className="exit-confirm-btns">
              <button className="exit-confirm-yes" onClick={leaveGame}>خروج</button>
              <button className="exit-confirm-no" onClick={() => setShowExitConfirm(false)}>رجوع</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HUD ── */}
      <header className="table-hud">
        <div className="hud-pill">
          <span>{t('roomCode')}</span><strong>{game.roomCode}</strong>
          <button className="hud-icon" type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?room=${game.roomCode}`).catch(() => undefined); playSound('button'); }} aria-label={t('copyInvite')}><Copy size={15} /></button>
        </div>
        <div className="hud-pill screw-word-pill"><strong>SCREW</strong></div>
        <div className={isMyTurn ? 'hud-pill hud-pill--turn' : 'hud-pill'}>
          <span>{isMyTurn ? t('yourTurn') : t('turn')}</span><strong>{currentPlayer?.nickname ?? t('waiting')}</strong>
        </div>
        <div className="hud-actions">
          <button className="hud-icon" type="button" onClick={() => onLanguageChange(language === 'en' ? 'ar' : 'en')} aria-label={t('language')}><Languages size={15} /></button>
          <button className="hud-icon" type="button" onClick={onSoundToggle} aria-label={t('sound')}>{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
          {showExitBtn && <button className="hud-icon hud-exit" type="button" onClick={() => setShowExitConfirm(true)} aria-label="خروج"><DoorOpen size={15} /></button>}
        </div>
      </header>

      <section className="card-table-stage">
        <div className="felt-table">
          {otherPlayers.map((player, idx) => (
            <OpponentSeat key={player.id} player={player}
              position={seatPosition(idx, otherPlayers.length)}
              isCurrent={player.id === game.currentPlayerId}
              reveals={reveals} onCardClick={handleOtherCard} t={t}
              reactions={emojiReactions.filter(r => r.playerId === player.id)}
              peekMarkers={(game.peekMarkers ?? []).filter(m => m.ownerId === player.id)}
              recentChat={recentChatByPlayer[player.id]}
              isPeekTarget={game.phase === 'action' && prompt?.targetPlayerId === player.id}
            />
          ))}

          <div className="center-play-area">
            <div className="table-state">
              <span>{phaseTitle(game.phase, isMyTurn, t)}</span>
              <strong>{currentPlayer?.nickname ?? t('waiting')}</strong>
            </div>

            <div className="center-piles">
              <div className={canDraw ? 'table-pile is-live' : 'table-pile'}>
                <CardImage hidden onClick={canDraw ? () => { playSound('button'); socket.emit('drawCard'); } : undefined} selectable={canDraw} size="medium" />
                <span>{t('drawFromDeck')}</span><em>{game.drawPileCount} {t('cardsLeft')}</em>
              </div>
              <div className={canTakeGround ? 'table-pile is-live' : 'table-pile'}>
                <CardImage cardId={game.discardTop?.id} hidden={!game.discardTop} onClick={canTakeGround ? () => { playSound('button'); socket.emit('takeGroundCard'); } : undefined} selectable={canTakeGround} size="medium" />
                <span>{t('takeFromGround')}</span>
              </div>
            </div>

            {isTurnTransitioning && (
              <div className="turn-transition-bubble">
                <span>{t('nextTurn')}</span><strong>{currentPlayer?.nickname ?? t('waiting')}</strong><em>{turnStartsIn}</em>
              </div>
            )}

            {/* Auto-triggered card action badge */}
            {privateState.drawnCard && privateState.canAct && privateState.drawnCardSource === 'deck' &&
             privateState.drawnCard.effectType !== 'none' ? (
              <div className="drawn-floating drawn-floating--auto drawn-floating--deck-pulse">
                <CardImage cardId={privateState.drawnCard.id} size="large" />
                <div className="auto-action-badge">⚡ {t('useAction')}</div>
              </div>
            ) : privateState.drawnCard ? (
              <DrawnCardControls card={privateState.drawnCard} source={privateState.drawnCardSource} canAct={privateState.canAct}
                handMode={handMode} t={t}
                onUse={() => socket.emit('useDrawnCardAction')}
                onKeep={() => setHandMode('keep')}
                onDiscard={() => { socket.emit('discardDrawnCard'); playSound('discard'); }}
              />
            ) : null}

            {prompt && (
              <ActionPromptBubble prompt={prompt} players={otherPlayers} handMode={handMode} setHandMode={setHandMode} t={t}
                onTarget={id => socket.emit('chooseTargetPlayer', { targetPlayerId: id })}
                onPeekOthers={() => socket.emit('chooseActionOption', { option: 'others' })}
                onSkipSwap={() => socket.emit('confirmSwap', { swap: false })}
              />
            )}

            {game.finalRound && game.phase !== 'roundEnded' && (
              <div className="final-round-banner table-final-banner">
                <ShieldAlert size={18} /> {t('roundClosedByScrew')}: {game.players.find(p => p.id === game.screwCallerId)?.nickname ?? t('winner')}
              </div>
            )}
          </div>
        </div>

        {/* ── My hand ── */}
        <section className={needsReplacement ? 'player-hand-bar is-selecting' : 'player-hand-bar'}>
          <div className="player-hand-title">
            <span>{t('yourHand')}</span><strong>{me?.nickname ?? identity.nickname}</strong>
            {recentChatByPlayer[identity.playerId] && <div className="player-chat-bubble player-chat-bubble--me">{recentChatByPlayer[identity.playerId]}</div>}
          </div>
          <div className="player-hand-cards">
            {handCards.map(slot => {
              const hasPeek = myPeekMarkers.some(m => m.index === slot.index);
              const peekerName = myPeekMarkers.find(m => m.index === slot.index)?.peekerName;
              const isFlashing = cardFlashIndex === slot.index;
              return (
                <div key={slot.index} className={`card-slot-wrap${isFlashing ? ' card-flip-anim' : ''}`}>
                  <CardImage cardId={slot.revealedCard?.id} hidden={!slot.revealedCard}
                    selected={initialPeek.includes(slot.index) || peekAroundSelection.includes(slot.index)}
                    selectable size="large" onClick={() => handleOwnCard(slot.index)} />
                  {hasPeek && <div className="peek-eye-badge" title={peekerName ? `${peekerName} saw this card` : 'Seen card'}><Eye size={15} /></div>}
                </div>
              );
            })}
          </div>
          <p className="table-hint">{handHint(game.phase, privateState, prompt, handMode, canDraw, canTakeGround, isTurnTransitioning, t)}</p>
        </section>

        {/* ── Chat & Log ── */}
        <div className="table-log-shell">
          <div className="reaction-rail">
            {['🔥','😂','😈','🧠','👏','💀','👀','⚡'].map(e => (
              <button key={e} type="button" onClick={() => { socket.emit('sendReaction', { emoji: e }); playSound('button'); }}>{e}</button>
            ))}
          </div>
          <button className="log-toggle" type="button" onClick={() => setChatOpen(o => !o)}>{t('chat')} {Object.keys(recentChatByPlayer).length > 0 ? '💬' : ''}</button>
          {chatOpen && (
            <div className="chat-panel">
              <div className="chat-messages">
                {(game.chatMessages ?? []).slice(-12).map(msg => (
                  <p key={msg.id} className={msg.playerId === identity.playerId ? 'chat-mine' : ''}>
                    <strong>{msg.nickname}:</strong> {msg.message}
                  </p>
                ))}
              </div>
              <div className="chat-compose">
                <input value={chatDraft} maxLength={160} onChange={e => setChatDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder={t('chat')} />
                <button type="button" onClick={sendChat}>{t('send')}</button>
              </div>
            </div>
          )}
          <button className="log-toggle" type="button" onClick={() => setLogOpen(o => !o)}>{t('log')}</button>
          {logOpen ? (
            <div className="compact-log">{game.log.slice(-10).map((e, i) => <p key={i}>{e}</p>)}</div>
          ) : (
            <div className="table-log-ticker">{game.log.at(-1) ?? t('waiting')}</div>
          )}
        </div>
      </section>

      {game.phase === 'paused' && <div className="pause-banner">{game.pausedReason ?? 'متوقف.'}</div>}

      {/* ══ BIG SCREW BUTTON ══ */}
      {canCallScrew && (
        <button className="screw-call-btn" type="button"
          onClick={() => { socket.emit('callScrew'); playSound('button'); }}
          aria-label={t('callScrew')}>
          {t('callScrew')}
        </button>
      )}

      <ScoreboardModal payload={roundEnded} onClose={onCloseScoreboard}
        onRestart={() => socket.emit('restartRound')} canRestart={isHost} t={t} />
    </main>
  );
}

/* ── DrawnCardControls ── */
function DrawnCardControls({ card, source, canAct, handMode, t, onUse, onKeep, onDiscard }: {
  card: PublicCard; source: 'deck' | 'ground' | null; canAct: boolean;
  handMode: HandMode; t: TFunction; onUse: () => void; onKeep: () => void; onDiscard: () => void;
}) {
  if (source === 'ground') return (
    <div className="drawn-floating drawn-floating--ground">
      <CardImage cardId={card.id} size="large" />
      <strong>{t('chooseCard')}</strong><span>{t('takeFromGround')}</span>
    </div>
  );
  const isMandatory = source === 'deck' && card.effectType !== 'none';
  return (
    <div className="drawn-floating">
      <CardImage cardId={card.id} size="large" />
      <div className="drawn-buttons">
        {isMandatory ? (
          <button className="clean-action clean-action--highlight" type="button" disabled={!canAct} onClick={onUse}>⚡ {t('useAction')}</button>
        ) : (
          <>
            <button className="clean-action" type="button" disabled={!canAct} onClick={onKeep}>{handMode === 'keep' ? t('chooseCard') : t('keep')}</button>
            <button className="clean-action" type="button" disabled={!canAct} onClick={onDiscard}>{t('discard')}</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── ActionPromptBubble ── */
function ActionPromptBubble({ prompt, players, handMode, setHandMode, t, onTarget, onPeekOthers, onSkipSwap }: {
  prompt: ActionPrompt; players: PublicPlayer[]; handMode: HandMode; setHandMode: (m: HandMode) => void; t: TFunction;
  onTarget: (id: string) => void; onPeekOthers: () => void; onSkipSwap: () => void;
}) {
  return (
    <div className="action-bubble action-bubble--glow">
      <strong>{prompt.message}</strong>
      {prompt.type === 'selectTargetPlayer' && (
        <div className="bubble-buttons">{players.map(p => <button className="clean-action" key={p.id} type="button" onClick={() => onTarget(p.id)}>{p.nickname}</button>)}</div>
      )}
      {prompt.type === 'selectPeekAroundOption' && (
        <div className="bubble-buttons">
          <button className="clean-action" type="button" onClick={() => setHandMode(handMode === 'peek-own' ? 'idle' : 'peek-own')}>{t('chooseCard')} x2</button>
          <button className="clean-action" type="button" onClick={onPeekOthers}>{t('choosePlayer')}</button>
        </div>
      )}
      {prompt.type === 'confirmSwap' && (
        <div className="bubble-buttons">
          <button className="clean-action" type="button" onClick={() => setHandMode('swap-own')}>{t('chooseCard')}</button>
          <button className="clean-action" type="button" onClick={onSkipSwap}>{t('discard')}</button>
        </div>
      )}
    </div>
  );
}

/* ── OpponentSeat ── */
function OpponentSeat({ player, position, isCurrent, reveals, onCardClick, t, reactions, peekMarkers, recentChat, isPeekTarget }: {
  player: PublicPlayer; position: string; isCurrent: boolean;
  reveals: Record<string, { card: PublicCard; expiresAt: number }>;
  onCardClick: (playerId: string, cardIndex: number) => void; t: TFunction;
  reactions: EmojiReaction[]; peekMarkers: PeekMarker[]; recentChat?: string; isPeekTarget?: boolean;
}) {
  return (
    <section className={['table-seat', `table-seat--${position}`, isCurrent ? 'is-current' : '', position === 'left' || position === 'right' ? 'is-side-seat' : '', isPeekTarget ? 'is-peek-target' : ''].filter(Boolean).join(' ')}>
      <div className="table-seat-name"><strong>{player.nickname}</strong><span>{player.handSize}</span></div>
      {recentChat && <div className="player-chat-bubble">{recentChat}</div>}
      {reactions.map(r => <div className="reaction-pop" key={r.id}>{r.emoji}</div>)}
      <div className="table-seat-cards">
        {Array.from({ length: player.handSize }, (_, index) => {
          const revealed = reveals[revealKey(player.id, index)]?.card;
          const hasPeek = peekMarkers.some(m => m.index === index);
          const peekerName = peekMarkers.find(m => m.index === index)?.peekerName;
          return (
            <div key={index} className="card-slot-wrap">
              <CardImage cardId={revealed?.id} hidden={!revealed} onClick={() => onCardClick(player.id, index)} selectable size="small" />
              {hasPeek && <div className="peek-eye-badge" title={peekerName ? `${peekerName} saw this card` : 'Seen card'}><Eye size={13} /></div>}
            </div>
          );
        })}
      </div>
      {!player.connected && <em>{t('reserved')}</em>}
    </section>
  );
}

/* ── Helpers ── */
function seatPosition(index: number, count: number): string {
  const layouts: Record<number, string[]> = { 1:['top'], 2:['left','right'], 3:['top','left','right'], 4:['top-left','top-right','left','right'], 5:['top-left','top','top-right','left','right'] };
  return (layouts[count] ?? layouts[5])[index] ?? 'top';
}
function phaseTitle(phase: string, isMyTurn: boolean, t: TFunction) {
  if (phase === 'initialPeek') return t('chooseCard');
  if (phase === 'paused') return t('waiting');
  if (phase === 'roundEnded') return t('scoreboard');
  return isMyTurn ? t('yourTurn') : t('turn');
}
function handHint(phase: string, ps: PrivatePlayerState, prompt: ActionPrompt | null, handMode: HandMode, canDraw: boolean, canTakeGround: boolean, isTT: boolean, t: TFunction) {
  if (phase === 'initialPeek' && ps.needsInitialPeek) return `${t('chooseCard')} x2`;
  if (isTT) return t('nextTurn');
  if (ps.drawnCardSource === 'ground') return `${t('chooseCard')} ← ${t('takeFromGround')}`;
  if (ps.drawnCardSource === 'deck' && ps.drawnCard?.effectType !== 'none') return t('useAction');
  if (ps.drawnCard) return `${t('keep')} / ${t('discard')} / ${t('useAction')}`;
  if (handMode === 'keep') return `${t('chooseCard')} ← ${t('keep')}`;
  if (prompt) return prompt.message;
  return canDraw || canTakeGround ? `${t('drawFromDeck')} / ${t('takeFromGround')}` : t('waiting');
}
