import redisClient from "../config/redisClient";

export interface Room {
  id: string;
  name: string;
  password: string | null;
  bett: string | null;
  type: "classic" | "nines" | "betting";
  status: "public" | "private";
  user: { id: string; username: string; avatar: string | null }[];
}

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

export const removeRoom = async (roomId: string) => {
  await redisClient.hdel("rooms", roomId);
};

export const leaveRoom = async (roomId: string, userId: string) => {
  const room = await getRoom(roomId);
  if (!room) return;

  const updatedUsers = room.users.filter(
    (user: { id: string }) => user.id !== userId
  );

  if (updatedUsers.length === 0) {
    await removeRoom(roomId);
  } else {
    const updatedRoom = { ...room, users: updatedUsers };
    await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));
  }
};

export const joinRoom = async (
  roomId: string,
  userId: string,
  userData: { id: string; username: string; avatar: string | null }
) => {
  const room = await getRoom(roomId);
  if (!room) return;

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
    avatar: userData.avatar || null,
  };

  const updatedUsers = [...room.users, userToAdd];
  const updatedRoom = { ...room, users: updatedUsers };
  await redisClient.hset("rooms", roomId, JSON.stringify(updatedRoom));
};
