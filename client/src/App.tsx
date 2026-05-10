import { useEffect, useMemo, useState } from 'react';
import type { ActionPrompt, PrivatePlayerState, PublicCard, PublicGameState, RevealedCard, RoomState, RoundEndedPayload } from '../../shared/types';
import { createSocket } from './game/socket';
import { getSoundEnabled, playSound, setSoundEnabled as persistSoundEnabled } from './game/sounds';
import { getT, type Language } from './i18n';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { Toast } from './components/Toast';

interface Identity {
  roomCode: string;
  playerId: string;
  nickname: string;
}

type RevealMap = Record<string, { card: PublicCard; expiresAt: number }>;

const PLAYER_ID_KEY = 'screw.playerId';
const ROOM_CODE_KEY = 'screw.roomCode';
const NICKNAME_KEY = 'screw.nickname';
const LANGUAGE_KEY = 'screw.language';

export default function App() {
  const socket = useMemo(() => createSocket(), []);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [publicGameState, setPublicGameState] = useState<PublicGameState | null>(null);
  const [privateState, setPrivateState] = useState<PrivatePlayerState | null>(null);
  const [reveals, setReveals] = useState<RevealMap>({});
  const [prompt, setPrompt] = useState<ActionPrompt | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [roundEnded, setRoundEnded] = useState<RoundEndedPayload | null>(null);
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem(LANGUAGE_KEY) === 'ar' ? 'ar' : 'en'));
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled);

  const initialRoomCode = useMemo(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '', []);
  const savedNickname = localStorage.getItem(NICKNAME_KEY) ?? '';
  const savedPlayerId = localStorage.getItem(PLAYER_ID_KEY) ?? '';
  const savedRoomCode = localStorage.getItem(ROOM_CODE_KEY) ?? '';
  const t = useMemo(() => getT(language), [language]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
  }

  function setSoundEnabled(nextValue: boolean) {
    setSoundEnabledState(nextValue);
    persistSoundEnabled(nextValue);
  }

  useEffect(() => {
    socket.on('playerIdentity', (payload: Identity) => {
      setIdentity(payload);
      localStorage.setItem(PLAYER_ID_KEY, payload.playerId);
      localStorage.setItem(ROOM_CODE_KEY, payload.roomCode);
      localStorage.setItem(NICKNAME_KEY, payload.nickname);
    });
    socket.on('roomState', setRoomState);
    socket.on('publicGameState', (payload: PublicGameState) => {
      setPublicGameState(payload);
      if (payload.phase !== 'action') {
        setPrompt(null);
      }
      if (payload.phase !== 'roundEnded') {
        setRoundEnded(null);
      }
    });
    socket.on('privatePlayerState', setPrivateState);
    socket.on('drawnCard', (payload?: { source?: 'deck' | 'ground' }) => playSound(payload?.source === 'ground' ? 'swap' : 'draw'));
    socket.on('privateCardReveal', (payload: { cards: RevealedCard[]; expiresAt: number }) => {
      setReveals((current) => {
        const next = { ...current };
        for (const reveal of payload.cards) {
          next[revealKey(reveal.ownerId, reveal.index)] = { card: reveal.card, expiresAt: payload.expiresAt };
        }
        return next;
      });
      playSound('reveal');
      window.setTimeout(() => {
        setReveals((current) => {
          const now = Date.now();
          return Object.fromEntries(Object.entries(current).filter(([, reveal]) => reveal.expiresAt > now));
        });
      }, Math.max(500, payload.expiresAt - Date.now() + 100));
    });
    socket.on('actionPrompt', setPrompt);
    socket.on('errorMessage', (message: string) => {
      setToast(message);
      playSound('error');
      window.setTimeout(() => setToast(null), 4500);
    });
    socket.on('roundEnded', (payload: RoundEndedPayload) => {
      setRoundEnded(payload);
      playSound('win');
    });
    socket.on('connect', () => {
      const playerId = localStorage.getItem(PLAYER_ID_KEY);
      const roomCode = localStorage.getItem(ROOM_CODE_KEY);
      const nickname = localStorage.getItem(NICKNAME_KEY);
      if (playerId && roomCode && nickname) {
        socket.emit('joinRoom', { roomCode, nickname, playerId });
      }
    });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'd' && privateState?.canDraw) {
        socket.emit('drawCard');
      }
      if (event.key.toLowerCase() === 's' && privateState?.canCallScrew) {
        socket.emit('callScrew');
        playSound('screw');
      }
      if (event.key === 'Escape') {
        setRoundEnded(null);
        setToast(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [privateState?.canCallScrew, privateState?.canDraw, socket]);

  const visibleState = publicGameState ?? roomState;
  const isGamePhase = publicGameState && publicGameState.phase !== 'lobby';

  return (
    <>
      {isGamePhase && identity && privateState ? (
        <GameScreen
          socket={socket}
          identity={identity}
          game={publicGameState}
          privateState={privateState}
          reveals={reveals}
          prompt={prompt}
          roundEnded={roundEnded}
          language={language}
          t={t}
          soundEnabled={soundEnabled}
          onLanguageChange={setLanguage}
          onSoundToggle={() => setSoundEnabled(!soundEnabled)}
          onCloseScoreboard={() => setRoundEnded(null)}
        />
      ) : (
        <LobbyScreen
          socket={socket}
          room={visibleState}
          identity={identity}
          initialRoomCode={initialRoomCode || savedRoomCode}
          savedNickname={savedNickname}
          savedPlayerId={savedPlayerId}
          savedRoomCode={savedRoomCode}
          language={language}
          t={t}
          soundEnabled={soundEnabled}
          onLanguageChange={setLanguage}
          onSoundToggle={() => setSoundEnabled(!soundEnabled)}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}

export function revealKey(ownerId: string, index: number): string {
  return `${ownerId}:${index}`;
}
