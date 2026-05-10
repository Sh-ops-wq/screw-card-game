import type { Server, Socket } from 'socket.io';
import { BotService } from './game/BotService';
import { GameManager, type EngineResult } from './game/GameManager';
import { RoomManager } from './game/RoomManager';
import { VisibilityService } from './game/VisibilityService';
import type { GameRoom, ServerPlayer } from './game/Types';

interface ClientSession {
  roomCode: string;
  playerId: string;
}

const roomManager = new RoomManager();
const gameManager = new GameManager(roomManager);
const botService = new BotService(roomManager, gameManager);

export function registerSockets(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('createRoom', safe(socket, (payload: { nickname: string; playerId?: string }) => {
      const room = roomManager.createRoom(requireNickname(payload.nickname), socket.id, payload.playerId);
      attachSocket(socket, room, room.players[0]);
      emitResult(io, { room }, room.players[0].id, socket);
    }));

    socket.on('joinRoom', safe(socket, (payload: { roomCode: string; nickname: string; playerId?: string }) => {
      const room = roomManager.joinRoom(requireRoomCode(payload.roomCode), requireNickname(payload.nickname), socket.id, payload.playerId);
      const player = room.players.find((candidate) => candidate.socketId === socket.id);
      if (!player) {
        throw new Error('Could not seat player.');
      }
      attachSocket(socket, room, player);
      emitResult(io, { room }, player.id, socket);
    }));

    socket.on('startGame', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.startGame(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('chooseInitialPeek', safe(socket, (payload: { cardIndexes: number[] }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.chooseInitialPeek(session.roomCode, session.playerId, payload.cardIndexes), session.playerId, socket);
    }));

    socket.on('drawCard', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.drawCard(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('takeGroundCard', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.takeGroundCard(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('keepDrawnCard', safe(socket, (payload: { replaceIndex: number }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.keepDrawnCard(session.roomCode, session.playerId, payload.replaceIndex), session.playerId, socket);
    }));

    socket.on('discardDrawnCard', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.discardDrawnCard(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('useDrawnCardAction', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.useDrawnCardAction(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('chooseTargetPlayer', safe(socket, (payload: { targetPlayerId: string }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.chooseTargetPlayer(session.roomCode, session.playerId, payload.targetPlayerId), session.playerId, socket);
    }));

    socket.on('chooseTargetCard', safe(socket, (payload: { targetPlayerId: string; cardIndex: number }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.chooseTargetCard(session.roomCode, session.playerId, payload.targetPlayerId, payload.cardIndex), session.playerId, socket);
    }));

    socket.on('chooseOwnCard', safe(socket, (payload: { cardIndex: number }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.chooseOwnCard(session.roomCode, session.playerId, payload.cardIndex), session.playerId, socket);
    }));

    socket.on('chooseActionOption', safe(socket, (payload: { option: string; cardIndexes?: number[]; targets?: Array<{ targetPlayerId: string; cardIndex: number }> }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.chooseActionOption(session.roomCode, session.playerId, payload), session.playerId, socket);
    }));

    socket.on('confirmSwap', safe(socket, (payload: { swap: boolean; targetPlayerId?: string; targetCardIndex?: number; ownCardIndex?: number }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.confirmSwap(session.roomCode, session.playerId, payload), session.playerId, socket);
    }));

    socket.on('callScrew', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.callScrew(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('playThief', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.playThief(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('restartRound', safe(socket, () => {
      const session = requireSession(socket);
      emitResult(io, gameManager.restartRound(session.roomCode, session.playerId), session.playerId, socket);
    }));

    socket.on('fillBots', safe(socket, () => {
      const session = requireSession(socket);
      const room = roomManager.fillWithBots(session.roomCode, session.playerId);
      emitResult(io, { room }, session.playerId, socket);
    }));

    socket.on('matchDiscard', safe(socket, (payload: { cardIndex: number }) => {
      const session = requireSession(socket);
      emitResult(io, gameManager.matchDiscard(session.roomCode, session.playerId, payload.cardIndex), session.playerId, socket);
    }));

    socket.on('kickPlayer', safe(socket, (payload: { targetPlayerId: string }) => {
      const session = requireSession(socket);
      const room = roomManager.kickPlayer(session.roomCode, session.playerId, payload.targetPlayerId);
      emitResult(io, { room }, session.playerId, socket);
    }));

    socket.on('disconnect', () => {
      const room = roomManager.disconnect(socket.id);
      if (room) {
        emitResult(io, { room }, undefined, socket);
      }
    });
  });
}

function safe(socket: Socket, handler: (payload: any) => void) {
  return (payload: any) => {
    try {
      handler(payload ?? {});
    } catch (error) {
      socket.emit('errorMessage', error instanceof Error ? error.message : 'Unexpected server error.');
    }
  };
}

function attachSocket(socket: Socket, room: GameRoom, player: ServerPlayer): void {
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  socket.emit('playerIdentity', { roomCode: room.code, playerId: player.id, nickname: player.nickname });
}

function emitResult(io: Server, result: EngineResult, actorId?: string, actorSocket?: Socket): void {
  const room = result.room;
  const inviteUrl = `/ ?room=${room.code}`.replace('/ ?', '/?');
  io.to(room.code).emit('roomState', VisibilityService.roomState(room, inviteUrl));
  io.to(room.code).emit('publicGameState', VisibilityService.publicGameState(room, Date.now(), inviteUrl));
  io.to(room.code).emit('gameLog', room.game?.log.slice(-80) ?? []);

  for (const player of room.players) {
    if (!player.socketId) {
      continue;
    }
    io.to(player.socketId).emit('privatePlayerState', VisibilityService.privatePlayerState(room, player.id));
  }

  if (actorId) {
    const actor = room.players.find((player) => player.id === actorId);
    const actorTarget = actor?.socketId ? io.to(actor.socketId) : actorSocket;
    if (actorTarget && result.drawnCard) {
      actorTarget.emit('drawnCard', { card: result.drawnCard, source: result.drawnCardSource ?? 'deck' });
    }
    if (actorTarget && result.reveals?.length) {
      actorTarget.emit('privateCardReveal', {
        cards: result.reveals,
        expiresAt: Date.now() + 6500
      });
    }
    if (actorTarget && result.prompt) {
      actorTarget.emit('actionPrompt', result.prompt);
    }
  }

  if (result.roundEnded) {
    io.to(room.code).emit('roundEnded', result.roundEnded);
  }

  botService.schedule(room.code, (botResult, botActorId) => emitResult(io, botResult, botActorId));
}

function requireSession(socket: Socket): ClientSession {
  const roomCode = socket.data.roomCode;
  const playerId = socket.data.playerId;
  if (!roomCode || !playerId) {
    throw new Error('Join a room first.');
  }
  const room = roomManager.getRoom(roomCode);
  const player = room?.players.find((candidate) => candidate.id === playerId);
  if (!room || !player || player.socketId !== socket.id) {
    throw new Error('This seat is active in another tab. Rejoin from this tab to continue.');
  }
  return { roomCode, playerId };
}

function requireNickname(value: string): string {
  const nickname = String(value ?? '').trim();
  if (nickname.length < 2 || nickname.length > 18) {
    throw new Error('Nickname must be 2 to 18 characters.');
  }
  return nickname;
}

function requireRoomCode(value: string): string {
  const roomCode = String(value ?? '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(roomCode)) {
    throw new Error('Enter a valid 6-character room code.');
  }
  return roomCode;
}
