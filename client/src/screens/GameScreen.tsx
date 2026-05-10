import { Clock, Copy, Languages, ShieldAlert, Swords, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ActionPrompt, PrivatePlayerState, PublicCard, PublicGameState, PublicPlayer, RoundEndedPayload } from '../../../shared/types';
import { revealKey } from '../App';
import { CardImage } from '../components/CardImage';
import { ScoreboardModal } from '../components/ScoreboardModal';
import { playSound } from '../game/sounds';
import { reactions, type Language, type TFunction } from '../i18n';

interface GameScreenProps {
  socket: Socket;
  identity: { roomCode: string; playerId: string; nickname: string };
  game: PublicGameState;
  privateState: PrivatePlayerState;
  reveals: Record<string, { card: PublicCard; expiresAt: number }>;
  prompt: ActionPrompt | null;
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
  socket,
  identity,
  game,
  privateState,
  reveals,
  prompt,
  roundEnded,
  language,
  t,
  soundEnabled,
  onLanguageChange,
  onSoundToggle,
  onCloseScoreboard
}: GameScreenProps) {
  const [now, setNow] = useState(Date.now());
  const [handMode, setHandMode] = useState<HandMode>('idle');
  const [initialPeek, setInitialPeek] = useState<number[]>([]);
  const [peekAroundSelection, setPeekAroundSelection] = useState<number[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const lastTurnSignal = useRef<string>('');
  const lastReactionAt = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (privateState.drawnCardSource === 'ground' && privateState.drawnCard) {
      setHandMode('keep');
      return;
    }
    if (!privateState.drawnCard && handMode === 'keep') {
      setHandMode('idle');
    }
    if (!prompt) {
      setHandMode((mode) => (mode === 'peek-own' || mode === 'swap-own' ? 'idle' : mode));
      setPeekAroundSelection([]);
    }
  }, [handMode, privateState.drawnCard, privateState.drawnCardSource, prompt]);

  useEffect(() => {
    if (!game.turnReadyAt || game.turnReadyAt <= Date.now() || !game.currentPlayerId) {
      return;
    }

    const signal = `${game.currentPlayerId}:${game.turnReadyAt}`;
    if (lastTurnSignal.current === signal) {
      return;
    }

    lastTurnSignal.current = signal;
    playSound('turn');
  }, [game.currentPlayerId, game.turnReadyAt]);

  useEffect(() => {
    const latest = game.log.at(-1);
    if (!latest) {
      return;
    }

    const worthyMove = /swapped|kept|Thief|Screw|Basra|Peek|matched|ground|wins/i.test(latest);
    const readyForToast = Date.now() - lastReactionAt.current >= 8000;
    if (!worthyMove || !readyForToast) {
      return;
    }

    const pool = reactions[language];
    const next = pool[Math.floor(Math.random() * pool.length)];
    lastReactionAt.current = Date.now();
    setReactionMessage(next);
    window.setTimeout(() => setReactionMessage(null), 2600);
  }, [game.log, language]);

  const me = game.players.find((player) => player.id === identity.playerId);
  const otherPlayers = game.players.filter((player) => player.id !== identity.playerId);
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
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
  const canCallScrew = privateState.canCallScrew || (game.phase === 'playing' && !isTurnTransitioning && !game.finalRound && now >= (game.screwUnlockAt ?? Number.POSITIVE_INFINITY));

  const handCards = privateState.hand.map((slot) => ({
    ...slot,
    revealedCard: reveals[revealKey(identity.playerId, slot.index)]?.card ?? slot.card
  }));

  function handleOwnCard(index: number) {
    if (isInitialPeek) {
      const next = initialPeek.includes(index)
        ? initialPeek.filter((item) => item !== index)
        : initialPeek.length >= 2
          ? [initialPeek[1], index]
          : [...initialPeek, index];

      setInitialPeek(next);
      if (next.length === 2) {
        window.setTimeout(() => {
          socket.emit('chooseInitialPeek', { cardIndexes: next });
          setInitialPeek([]);
        }, 280);
      }
      return;
    }

    if (handMode === 'keep') {
      socket.emit('keepDrawnCard', { replaceIndex: index });
      playSound('swap');
      setHandMode('idle');
      return;
    }

    if (handMode === 'match') {
      socket.emit('matchDiscard', { cardIndex: index });
      setHandMode('idle');
      return;
    }

    if (prompt?.type === 'selectOwnCard') {
      socket.emit('chooseOwnCard', { cardIndex: index });
      return;
    }

    if (prompt?.type === 'confirmSwap' || handMode === 'swap-own') {
      socket.emit('confirmSwap', {
        swap: true,
        targetPlayerId: prompt?.targetPlayerId,
        targetCardIndex: prompt?.targetCardIndex,
        ownCardIndex: index
      });
      playSound('swap');
      setHandMode('idle');
      return;
    }

    if (handMode === 'peek-own' && prompt?.type === 'selectPeekAroundOption') {
      setPeekAroundSelection((current) => {
        const next = current.includes(index) ? current.filter((item) => item !== index) : [...current, index].slice(-2);
        if (next.length === 2) {
          socket.emit('chooseActionOption', { option: 'own', cardIndexes: next });
          setHandMode('idle');
          return [];
        }
        return next;
      });
    }
  }

  function handleOtherCard(playerId: string, cardIndex: number) {
    if (prompt?.type === 'selectTargetCard') {
      socket.emit('chooseTargetCard', { targetPlayerId: playerId, cardIndex });
    }
  }

  function drawFromDeck() {
    playSound('button');
    socket.emit('drawCard');
  }

  function takeFromGround() {
    playSound('button');
    socket.emit('takeGroundCard');
  }

  function copyRoom() {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${game.roomCode}`).catch(() => undefined);
    playSound('button');
  }

  return (
    <main className="game-table-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="table-hud">
        <div className="hud-pill">
          <span>{t('roomCode')}</span>
          <strong>{game.roomCode}</strong>
          <button className="hud-icon" type="button" onClick={copyRoom} aria-label={t('copyInvite')}>
            <Copy size={15} />
          </button>
        </div>
        <div className="hud-pill">
          <Clock size={16} />
          <strong>{game.screwUnlocked ? 'Screw' : formatTime(screwSeconds)}</strong>
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
          {canCallScrew ? (
            <button className="screw-hud-button" type="button" onClick={() => socket.emit('callScrew')}>
              <Swords size={16} /> {t('callScrew')}
            </button>
          ) : null}
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

            {privateState.drawnCard ? (
              <DrawnCardControls
                card={privateState.drawnCard}
                source={privateState.drawnCardSource}
                canAct={privateState.canAct}
                game={game}
                handMode={handMode}
                t={t}
                onUse={() => socket.emit('useDrawnCardAction')}
                onKeep={() => setHandMode('keep')}
                onDiscard={() => {
                  socket.emit('discardDrawnCard');
                  playSound('discard');
                }}
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

            {game.finalRound ? (
              <div className="final-round-banner table-final-banner">
                <ShieldAlert size={18} /> Final round: {game.players.find((player) => player.id === game.screwCallerId)?.nickname ?? t('winner')}
              </div>
            ) : null}
          </div>
        </div>

        <section className={needsReplacement ? 'player-hand-bar is-selecting' : 'player-hand-bar'}>
          <div className="player-hand-title">
            <span>{t('yourHand')}</span>
            <strong>{me?.nickname ?? identity.nickname}</strong>
          </div>

          <div className="player-hand-cards">
            {handCards.map((slot) => (
              <CardImage
                cardId={slot.revealedCard?.id}
                key={slot.index}
                hidden={!slot.revealedCard}
                selected={initialPeek.includes(slot.index) || peekAroundSelection.includes(slot.index)}
                selectable
                size="large"
                onClick={() => handleOwnCard(slot.index)}
              />
            ))}
          </div>

          <p className="table-hint">{handHint(game.phase, privateState, prompt, handMode, canDraw, canTakeGround, isTurnTransitioning, t)}</p>
        </section>

        {reactionMessage ? <div className="fun-toast">{reactionMessage}</div> : null}

        <div className="table-log-shell">
          <button className="log-toggle" type="button" onClick={() => setLogOpen((open) => !open)}>
            {t('log')}
          </button>
          {logOpen ? (
            <div className="compact-log">
              {game.log.slice(-8).map((entry, index) => (
                <p key={`${entry}-${index}`}>{entry}</p>
              ))}
            </div>
          ) : (
            <div className="table-log-ticker">{game.log.at(-1) ?? t('waiting')}</div>
          )}
        </div>
      </section>

      {game.phase === 'paused' ? <div className="pause-banner">{game.pausedReason ?? 'Round paused.'}</div> : null}

      <ScoreboardModal payload={roundEnded} onClose={onCloseScoreboard} onRestart={() => socket.emit('restartRound')} canRestart={isHost} t={t} />
    </main>
  );
}

function DrawnCardControls({
  card,
  source,
  canAct,
  game,
  handMode,
  t,
  onUse,
  onKeep,
  onDiscard
}: {
  card: PublicCard;
  source: 'deck' | 'ground' | null;
  canAct: boolean;
  game: PublicGameState;
  handMode: HandMode;
  t: TFunction;
  onUse: () => void;
  onKeep: () => void;
  onDiscard: () => void;
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

  const actionReason = getActionReason(card, source, canAct, game);

  return (
    <div className="drawn-floating">
      <CardImage cardId={card.id} size="large" />
      <div className="drawn-buttons">
        <button className="clean-action" type="button" disabled={!canAct} onClick={onKeep}>
          {handMode === 'keep' ? t('chooseCard') : t('keep')}
        </button>
        <button className="clean-action" type="button" disabled={!canAct} onClick={onDiscard}>
          {t('discard')}
        </button>
        <button className="clean-action" type="button" title={actionReason || t('useAction')} disabled={Boolean(actionReason)} onClick={onUse}>
          {t('useAction')}
        </button>
      </div>
    </div>
  );
}

function ActionPromptBubble({
  prompt,
  players,
  handMode,
  setHandMode,
  t,
  onTarget,
  onPeekOthers,
  onSkipSwap
}: {
  prompt: ActionPrompt;
  players: PublicPlayer[];
  handMode: HandMode;
  setHandMode: (mode: HandMode) => void;
  t: TFunction;
  onTarget: (targetPlayerId: string) => void;
  onPeekOthers: () => void;
  onSkipSwap: () => void;
}) {
  return (
    <div className="action-bubble">
      <strong>{prompt.message}</strong>
      {prompt.type === 'selectTargetPlayer' ? (
        <div className="bubble-buttons">
          {players.map((player) => (
            <button className="clean-action" key={player.id} type="button" onClick={() => onTarget(player.id)}>
              {player.nickname}
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
          <button className="clean-action" type="button" onClick={() => setHandMode('swap-own')}>
            {t('chooseCard')}
          </button>
          <button className="clean-action" type="button" onClick={onSkipSwap}>
            {t('discard')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OpponentSeat({
  player,
  position,
  isCurrent,
  reveals,
  onCardClick,
  t
}: {
  player: PublicPlayer;
  position: string;
  isCurrent: boolean;
  reveals: Record<string, { card: PublicCard; expiresAt: number }>;
  onCardClick: (playerId: string, cardIndex: number) => void;
  t: TFunction;
}) {
  const vertical = position === 'left' || position === 'right';

  return (
    <section className={['table-seat', `table-seat--${position}`, isCurrent ? 'is-current' : '', vertical ? 'is-side-seat' : ''].join(' ')}>
      <div className="table-seat-name">
        <strong>{player.nickname}</strong>
        <span>{player.handSize}</span>
      </div>
      <div className="table-seat-cards">
        {Array.from({ length: player.handSize }, (_, index) => {
          const revealed = reveals[revealKey(player.id, index)]?.card;
          return <CardImage cardId={revealed?.id} hidden={!revealed} key={`${player.id}-${index}`} onClick={() => onCardClick(player.id, index)} selectable size="small" />;
        })}
      </div>
      {!player.connected ? <em>{t('reserved')}</em> : null}
    </section>
  );
}

function seatPosition(index: number, count: number): string {
  const layouts: Record<number, string[]> = {
    1: ['top'],
    2: ['left', 'right'],
    3: ['top', 'left', 'right'],
    4: ['top-left', 'top-right', 'left', 'right'],
    5: ['top-left', 'top', 'top-right', 'left', 'right']
  };
  return (layouts[count] ?? layouts[5])[index] ?? 'top';
}

function getActionReason(card: PublicCard, source: 'deck' | 'ground' | null, canAct: boolean, game: PublicGameState): string | null {
  if (source !== 'deck') {
    return 'This card only works when drawn from deck.';
  }
  if (card.effectType === 'none') {
    return 'This card has no action.';
  }
  if (card.effectType === 'thief' && !game.finalRound) {
    return 'Thief only works after Screw.';
  }
  if (!canAct) {
    return 'This action is not allowed now.';
  }
  return null;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function phaseTitle(phase: string, isMyTurn: boolean, t: TFunction): string {
  if (phase === 'initialPeek') {
    return t('chooseCard');
  }
  if (phase === 'paused') {
    return t('waiting');
  }
  if (phase === 'roundEnded') {
    return t('scoreboard');
  }
  return isMyTurn ? t('yourTurn') : t('turn');
}

function handHint(
  phase: string,
  privateState: PrivatePlayerState,
  prompt: ActionPrompt | null,
  handMode: HandMode,
  canDraw: boolean,
  canTakeGround: boolean,
  isTurnTransitioning: boolean,
  t: TFunction
): string {
  if (phase === 'initialPeek' && privateState.needsInitialPeek) {
    return `${t('chooseCard')} x2`;
  }
  if (isTurnTransitioning) {
    return t('nextTurn');
  }
  if (privateState.drawnCardSource === 'ground') {
    return `${t('chooseCard')} - ${t('takeFromGround')}`;
  }
  if (privateState.drawnCard) {
    return `${t('keep')} / ${t('discard')} / ${t('useAction')}`;
  }
  if (handMode === 'keep') {
    return `${t('chooseCard')} - ${t('keep')}`;
  }
  if (handMode === 'match') {
    return t('chooseCard');
  }
  if (prompt) {
    return prompt.message;
  }
  return canDraw || canTakeGround ? `${t('drawFromDeck')} / ${t('takeFromGround')}` : t('waiting');
}
