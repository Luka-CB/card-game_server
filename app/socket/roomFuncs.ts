import redisClient from "../config/redisClient";
import { Room } from "../utils/interfaces.util";

export const addRoom = async (room: Room) => {
  await redisClient.hset("rooms", room.id, JSON.stringify(room));
};

export const getRooms = async () => {
  const roomsData = await redisClient.hvals("rooms");
  return roomsData.map((room) => JSON.parse(room));
};

export const getRoom = async (roomId: string) => {
  const roomData = await redisClient.hget("rooms", roomId);
  return roomData ? JSON.parse(roomData) : null;
};

export const handleRoomLeave = async (roomId: string, userId: string) => {
  const room = await getRoom(roomId);
  if (!room) return;

  const updatedUsers = room.users.filter(
    (user: { id: string }) => user.id !== userId
  );

  if (updatedUsers.length === 0) {
    // If no users left, remove the room
    await redisClient.hdel("rooms", roomId);
  } else {
    // Otherwise update the room with remaining users
    const updatedRoom = { ...room, users: updatedUsers };
    await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));
  }
};

export const rejoinRoom = async (
  roomId: string,
  users: {
    id: string;
    username: string;
    avatar: string | null;
  }[]
) => {
  const room = await getRoom(roomId);

  const updatedRoom = { ...room, users };
  await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));

  return updatedRoom;
};

export const joinRoom = async (
  roomId: string,
  userId: string,
  userData: {
    id: string;
    username: string;
    status: "active" | "busy" | "inactive" | "left";
    avatar: string | null;
    botAvatar: string | null;
  }
) => {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Room no longer exists");

  // Check if room is full
  if (room.users.length >= 4) {
    throw new Error("Room is full");
  }

  // Check if user is already in a room
  const rooms = await getRooms();
  const roomUsers = rooms.map((room) => room.users).flat();
  if (roomUsers.some((user: { id: string }) => user.id === userId)) {
    throw new Error("You can't be in more than one room at the same time");
  }

  // Ensure user data is properly formatted
  const userToAdd = {
    id: userData.id,
    username: userData.username,
    status: userData.status || "active",
    avatar: userData.avatar || null,
    botAvatar: userData.botAvatar || null,
  };

  const updatedUsers = [...room.users, userToAdd];
  const updatedRoom = { ...room, users: updatedUsers };
  await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));
};

export const updateUserStatus = async (
  roomId: string,
  userId: string,
  status: "active" | "busy" | "inactive" | "left"
) => {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Room no longer exists");

  const updatedUsers = room.users.map(
    (user: { id: string; status: string }) => {
      if (user.id === userId) {
        return { ...user, status };
      }
      return user;
    }
  );

  const updatedRoom = { ...room, users: updatedUsers };
  await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));
};

export const destroyRoom = async (roomId: string) => {
  const room = await getRoom(roomId);
  if (!room) throw new Error("Room no longer exists");

  const gameInfo = await redisClient.hget("games", roomId);
  if (gameInfo) {
    await redisClient.hdel("games", roomId);
  }

  // Remove the room from Redis
  await redisClient.hdel("rooms", roomId);
};
