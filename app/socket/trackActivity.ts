import { Server } from "socket.io";
import { getRooms, updateUserStatus } from "./roomFuncs";
import { Room, RoomUser } from "../utils/interfaces.util";
import { checkGameNeedsAction } from "./timer";

export const DISCONNECT_GRACE_MS = 1500;

export const presenceByRoom: Record<string, Record<string, Set<string>>> = {};
export const roomsBySocket: Record<string, Set<string>> = {};
export const pendingBusyByRoomUser: Record<string, NodeJS.Timeout> = {};

export const roomUserKey = (roomId: string, userId: string) =>
  `${roomId}:${userId}`;

export const trackJoinPresence = (
  roomId: string,
  userId: string,
  socketId: string
) => {
  if (!roomsBySocket[socketId]) roomsBySocket[socketId] = new Set();
  roomsBySocket[socketId].add(roomId);

  if (!presenceByRoom[roomId]) presenceByRoom[roomId] = {};
  if (!presenceByRoom[roomId][userId])
    presenceByRoom[roomId][userId] = new Set();
  presenceByRoom[roomId][userId].add(socketId);

  const k = roomUserKey(roomId, userId);
  const t = pendingBusyByRoomUser[k];
  if (t) {
    clearTimeout(t);
    delete pendingBusyByRoomUser[k];
  }
};

export const trackLeavePresence = (
  roomId: string,
  userId: string,
  socketId: string
) => {
  roomsBySocket[socketId]?.delete(roomId);
  if (roomsBySocket[socketId]?.size === 0) delete roomsBySocket[socketId];

  const set = presenceByRoom[roomId]?.[userId];
  if (!set) return;

  set.delete(socketId);
  if (set.size === 0) {
    delete presenceByRoom[roomId][userId];
    if (Object.keys(presenceByRoom[roomId]).length === 0)
      delete presenceByRoom[roomId];
  }
};

export const broadcastRoomUpdate = async (roomId: string, io: Server) => {
  const rooms = await getRooms();
  io.emit("getRooms", rooms);
  const found = rooms.find((r: Room) => r.id === roomId);
  if (found) io.to(roomId).emit("getRoom", found);
};

export const markBusyIfStillDisconnected = async (
  roomId: string,
  userId: string,
  io: Server
) => {
  if (presenceByRoom[roomId]?.[userId]?.size) return;

  const rooms = await getRooms();
  const room = rooms.find((r: Room) => r.id === roomId);
  if (!room) return;

  const user = room.users.find((u: RoomUser) => u.id === userId);
  if (!user) return;

  await updateUserStatus(roomId, userId, "busy");
  await broadcastRoomUpdate(roomId, io);
  await checkGameNeedsAction(roomId, io);
};
