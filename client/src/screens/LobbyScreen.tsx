import { Bot, Clipboard, Crown, Languages, LogIn, Play, Plus, Users, Volume2, VolumeX } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { RoomState } from '../../../shared/types';
import { playSound } from '../game/sounds';
import type { Language, TFunction } from '../i18n';

interface LobbyScreenProps {
  socket: Socket;
  room: RoomState | null;
  identity: { roomCode: string; playerId: string; nickname: string } | null;
  initialRoomCode: string;
  savedNickname: string;
  savedPlayerId: string;
  savedRoomCode: string;
  language: Language;
  t: TFunction;
  soundEnabled: boolean;
  onLanguageChange: (language: Language) => void;
  onSoundToggle: () => void;
}

export function LobbyScreen({
  socket,
  room,
  identity,
  initialRoomCode,
  savedNickname,
  savedPlayerId,
  savedRoomCode,
  language,
  t,
  soundEnabled,
  onLanguageChange,
  onSoundToggle
}: LobbyScreenProps) {
  const [nickname, setNickname] = useState(savedNickname);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [copied, setCopied] = useState(false);

  const inviteLink = useMemo(() => {
    if (!room?.roomCode) {
      return '';
    }
    return `${window.location.origin}/?room=${room.roomCode}`;
  }, [room?.roomCode]);

  const canStart = Boolean(identity && room && room.hostId === identity.playerId && room.players.length >= room.minPlayers && room.players.length <= room.maxPlayers);
  const canFillBots = Boolean(identity && room && room.hostId === identity.playerId && room.phase === 'lobby' && room.players.length < room.minPlayers);
  const canRejoin = roomCode && savedPlayerId && savedRoomCode === roomCode.toUpperCase();

  function createRoom() {
    playSound('button');
    socket.emit('createRoom', { nickname });
  }

  function joinRoom() {
    playSound('button');
    socket.emit('joinRoom', {
      roomCode,
      nickname,
      playerId: canRejoin ? savedPlayerId : undefined
    });
  }

  function fillBots() {
    playSound('button');
    socket.emit('fillBots');
  }

  async function copyInvite() {
    if (!inviteLink) {
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
    playSound('button');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="lobby-screen" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="lobby-panel">
        <div className="settings-row settings-row--lobby">
          <button className="icon-text-button" type="button" onClick={() => onLanguageChange(language === 'en' ? 'ar' : 'en')}>
            <Languages size={17} /> {t('language')}: {language === 'en' ? 'EN' : 'عربي'}
          </button>
          <button className="icon-text-button" type="button" onClick={onSoundToggle}>
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />} {t('sound')}: {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <p className="eyebrow">{t('privateTable')}</p>
        <h1>SCREW</h1>
        <p className="lobby-subtitle">{t('egyptianChaos')}</p>

        <div className="lobby-form">
          <label>
            {t('nickname')}
            <input maxLength={18} minLength={2} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={language === 'ar' ? 'اسمك على الترابيزة' : 'Your table name'} />
          </label>

          <div className="lobby-actions">
            <button className="primary-button" type="button" onClick={createRoom} disabled={nickname.trim().length < 2}>
              <Plus size={18} /> {t('createRoom')}
            </button>
            <div className="join-row">
              <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6} />
              <button className="secondary-button" type="button" onClick={joinRoom} disabled={nickname.trim().length < 2 || roomCode.trim().length !== 6}>
                <LogIn size={18} /> {t('join')}
              </button>
            </div>
          </div>
        </div>

        {room ? (
          <section className="room-card">
            <div className="room-card__header">
              <div>
                <span>{t('roomCode')}</span>
                <strong>{room.roomCode}</strong>
              </div>
              <button className="icon-text-button" type="button" onClick={copyInvite}>
                <Clipboard size={17} /> {copied ? t('copied') : t('inviteLink')}
              </button>
            </div>

            <div className="player-count">
              <Users size={18} /> {room.players.length}/{room.maxPlayers} {t('players')}
            </div>

            <div className="lobby-player-list">
              {room.players.map((player) => (
                <div className={player.connected ? 'lobby-player' : 'lobby-player is-disconnected'} key={player.id}>
                  <span>{player.nickname}</span>
                  <div>
                    {player.isBot ? (
                      <em>
                        <Bot size={14} /> {t('bot')}
                      </em>
                    ) : null}
                    {player.isHost ? (
                      <em>
                        <Crown size={14} /> {t('host')}
                      </em>
                    ) : null}
                    {!player.connected ? <em>{t('reserved')}</em> : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="lobby-start-actions">
              <button className="secondary-button" type="button" onClick={fillBots} disabled={!canFillBots}>
                <Bot size={18} /> {t('fillBots')}
              </button>
              <button className="primary-button start-button" type="button" onClick={() => socket.emit('startGame')} disabled={!canStart}>
                <Play size={18} /> {t('startGame')}
              </button>
            </div>
            <p className="start-note">{room.players.length < room.minPlayers ? `${t('waiting')}: ${room.minPlayers - room.players.length}` : `${t('waiting')} - ${room.players.length}/${room.maxPlayers}`}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
