interface Player {
  id: string;
  username: string;
  x: number;
  y: number;
}

interface Room {
  id: string;
  players: Map<string, Player>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  joinRoom(roomId: string, player: Player) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { id: roomId, players: new Map() });
    }
    this.rooms.get(roomId)!.players.set(player.id, player);
    return this.rooms.get(roomId);
  }

  leaveRoom(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.players.delete(playerId);
      if (room.players.size === 0) this.rooms.delete(roomId);
    }
  }

  updatePosition(roomId: string, playerId: string, x: number, y: number) {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (player) {
      player.x = x;
      player.y = y;
    }
  }
}
