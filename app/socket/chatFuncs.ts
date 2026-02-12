// import { v4 as uuidv4 } from "uuid";
import { getRoom } from "./roomFuncs";
import redisClient from "../config/redisClient";
import { ChatMessage, ChatRoom, chatUser } from "../utils/interfaces.util";

export const createChat = async (roomId: string) => {
  const room = await getRoom(roomId);
  if (!room) return;

  const existingChat = await getChatByRoomId(roomId);
  if (existingChat) return;

  const chat: ChatRoom = {
    roomId,
    unreadMessages: {
      ...room.users.reduce(
        (acc: { [userId: string]: number }, user: chatUser) => {
          acc[user.id] = 0;
          return acc;
        },
        {},
      ),
    },
    messages: [],
    hasChatOpen: {
      ...room.users.reduce(
        (acc: { [userId: string]: boolean }, user: chatUser) => {
          acc[user.id] = false;
          return acc;
        },
        {},
      ),
    },
  };

  await redisClient.hset("chats", roomId, JSON.stringify(chat));
};

export const getChatByRoomId = async (roomId: string) => {
  const chat = await redisClient.hget("chats", roomId);
  return chat ? (JSON.parse(chat) as ChatRoom) : null;
};

export const addChatMessage = async (msg: ChatMessage, roomId: string) => {
  const chat = await getChatByRoomId(roomId);
  if (!chat) return;

  const updatedChat: ChatRoom = {
    ...chat,
    unreadMessages: {
      ...chat.unreadMessages,
      ...Object.keys(chat.hasChatOpen).reduce(
        (acc: { [userId: string]: number }, userId) => {
          if (userId === msg.sender.id) {
            acc[userId] = chat.unreadMessages[userId];
          } else {
            const isChatOpen = chat.hasChatOpen[userId];
            const currentCount = chat.unreadMessages[userId] ?? 0;
            const newCount = isChatOpen ? currentCount : currentCount + 1;

            acc[userId] = newCount;
          }
          return acc;
        },
        {},
      ),
    },
    messages: [...chat.messages, msg],
  };
  await redisClient.hset("chats", roomId, JSON.stringify(updatedChat));
};

export const toggleChatOpen = async (roomId: string, userId: string) => {
  const chat = await getChatByRoomId(roomId);
  if (!chat) return;

  const isCurrentlyOpen = chat.hasChatOpen[userId];

  const updatedChat: ChatRoom = {
    ...chat,
    unreadMessages: {
      ...chat.unreadMessages,
      [userId]: !isCurrentlyOpen ? 0 : chat.unreadMessages[userId],
    },
    hasChatOpen: {
      ...chat.hasChatOpen,
      [userId]: !isCurrentlyOpen,
    },
  };

  await redisClient.hset("chats", roomId, JSON.stringify(updatedChat));
};

export const destroyChat = async (roomId: string) => {
  await redisClient.hdel("chats", roomId);
};
