import { randomBytes, randomUUID } from 'node:crypto';
import { DISCONNECT_GRACE_MS, MAX_PLAYERS, MIN_PLAYERS, TURN_TIMEOUT_MS, TURN_TRANSITION_DELAY_MS } from './Constants';
import type { GameRoom, ServerPlayer } from './Types';

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly botNames = ['Bot Omar', 'Bot Ziad', 'Bot Karim', 'Bot Youssef', 'Bot Ali', 'Bot Mido'];

  createRoom(nickname: string, socketId: string, requestedPlayerId?: string): GameRoom {
    const roomCode = this.generateRoomCode();
    const playerId = requestedPlayerId || randomUUID();
    const player: ServerPlayer = {
      id: playerId,
      nickname: nickname.trim(),
      socketId,
      connected: true,
      isBot: false,
      isHost: true,
      penaltyPoints: 0,
      warningCount: 0,
      timeoutCount: 0,
      initialPeekDone: false
    };

    const room: GameRoom = {
      code: roomCode,
      hostId: playerId,
      players: [player],
      chatMessages: [],
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  joinRoom(roomCode: string, nickname: string, socketId: string, requestedPlayerId?: string): GameRoom {
    const room = this.requireRoom(roomCode);
    const normalizedName = nickname.trim();

    if (requestedPlayerId) {
      const existing = room.players.find((player) => player.id === requestedPlayerId);
      if (existing) {
        existing.nickname = normalizedName || existing.nickname;
        existing.socketId = socketId;
        existing.connected = true;
        existing.disconnectedAt = undefined;
        if (room.game?.phase === 'paused') {
          this.resumeIfPossible(room);
        }
        return room;
      }
    }

    if (room.players.length >= MAX_PLAYERS) {
      throw new Error('This room is full. Screw supports 2 to 6 players.');
    }

    if (room.game && room.game.phase !== 'roundEnded') {
      throw new Error('This round has already started. Rejoin with your saved player link instead.');
    }

    const player: ServerPlayer = {
      id: requestedPlayerId || randomUUID(),
      nickname: normalizedName,
      socketId,
      connected: true,
      isBot: false,
      isHost: false,
      penaltyPoints: 0,
      warningCount: 0,
      timeoutCount: 0,
      initialPeekDone: false
    };

    room.players.push(player);
    return room;
  }

  fillWithBots(roomCode: string, hostId: string): GameRoom {
    const room = this.requireRoom(roomCode);
    if (room.hostId !== hostId) {
      throw new Error('Only the host can add bots.');
    }
    if (room.game && room.game.phase !== 'lobby') {
      throw new Error('Bots can only be added before the round starts.');
    }
    if (room.players.length >= MAX_PLAYERS) {
      throw new Error('This room is already full.');
    }

    const needed = Math.max(0, MIN_PLAYERS - room.players.length);
    for (let index = 0; index < needed; index += 1) {
      const usedNames = new Set(room.players.map((player) => player.nickname));
      const name = this.botNames.find((candidate) => !usedNames.has(candidate)) ?? `Bot ${room.players.length + 1}`;
      room.players.push({
        id: randomUUID(),
        nickname: name,
        connected: true,
        isBot: true,
        isHost: false,
        penaltyPoints: 0,
        warningCount: 0,
        timeoutCount: 0,
        initialPeekDone: false
      });
    }

    return room;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  requireRoom(roomCode: string): GameRoom {
    const room = this.getRoom(roomCode);
    if (!room) {
      throw new Error('Room not found.');
    }
    return room;
  }

  findRoomByPlayer(playerId: string): GameRoom | undefined {
    return [...this.rooms.values()].find((room) => room.players.some((player) => player.id === playerId));
  }

  findRoomBySocket(socketId: string): GameRoom | undefined {
    return [...this.rooms.values()].find((room) => room.players.some((player) => player.socketId === socketId));
  }

  requirePlayer(room: GameRoom, playerId: string): ServerPlayer {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error('Player is not seated in this room.');
    }
    return player;
  }

  disconnect(socketId: string): GameRoom | undefined {
    const room = this.findRoomBySocket(socketId);
    if (!room) {
      return undefined;
    }

    const player = room.players.find((candidate) => candidate.socketId === socketId);
    if (!player) {
      return room;
    }

    player.connected = false;
    player.socketId = undefined;
    player.disconnectedAt = Date.now();

    if (!room.game || room.game.phase === 'lobby') {
      this.removeExpiredDisconnectedPlayers(room);
      this.transferHostIfNeeded(room);
      return room;
    }

    if (room.game.phase !== 'roundEnded') {
      room.game.pausedReason = `${player.nickname} disconnected. Seat is reserved for 2 minutes.`;
      room.game.phase = 'paused';
    }

    return room;
  }

  kickPlayer(roomCode: string, hostId: string, targetPlayerId: string): GameRoom {
    const room = this.requireRoom(roomCode);
    if (room.hostId !== hostId) {
      throw new Error('Only the host can kick players.');
    }

    const target = this.requirePlayer(room, targetPlayerId);
    if (target.connected) {
      throw new Error('Only disconnected players can be kicked in this MVP.');
    }

    room.players = room.players.filter((player) => player.id !== targetPlayerId);
    delete room.game?.playerStates[targetPlayerId];
    this.transferHostIfNeeded(room);
    return room;
  }

  resetPlayersForRound(room: GameRoom): void {
    for (const player of room.players) {
      player.initialPeekDone = false;
      player.penaltyPoints = 0;
      player.warningCount = 0;
      player.timeoutCount = 0;
    }
  }

  canStart(room: GameRoom): boolean {
    return room.players.length >= MIN_PLAYERS && room.players.length <= MAX_PLAYERS;
  }

  private resumeIfPossible(room: GameRoom): void {
    if (!room.game) {
      return;
    }
    const everyoneConnected = room.players.every((player) => player.connected || player.isBot);
    if (everyoneConnected && room.game.phase === 'paused') {
      room.game.phase = room.game.pendingAction ? 'action' : 'playing';
      room.game.pausedReason = undefined;
      room.game.turnReadyAt = Date.now() + TURN_TRANSITION_DELAY_MS;
      room.game.turnExpiresAt = room.game.turnReadyAt + TURN_TIMEOUT_MS;
    }
  }

  private removeExpiredDisconnectedPlayers(room: GameRoom, immediateLobbyRemoval = false): void {
    const now = Date.now();
    room.players = room.players.filter((player) => {
      if (player.connected) {
        return true;
      }
      if (immediateLobbyRemoval) {
        return false;
      }
      return !player.disconnectedAt || now - player.disconnectedAt < DISCONNECT_GRACE_MS;
    });
  }

  private transferHostIfNeeded(room: GameRoom): void {
    const host = room.players.find((player) => player.id === room.hostId && player.connected);
    if (host) {
      return;
    }
    const next = room.players.find((player) => player.connected) || room.players[0];
    if (!next) {
      this.rooms.delete(room.code);
      return;
    }
    room.hostId = next.id;
    for (const player of room.players) {
      player.isHost = player.id === next.id;
    }
  }

  private generateRoomCode(): string {
    let code = '';
    do {
      code = randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    return code;
  }
}
