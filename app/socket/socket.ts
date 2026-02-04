import { Server, Socket } from "socket.io";
import session from "express-session";
import sessionMiddleware from "../middlewares/session.middleware";
import {
  Card,
  Game,
  PlayedCard,
  PlayingCard,
  Room,
  RoomUser,
  UserSessionData,
} from "../utils/interfaces.util";
import { IncomingMessage } from "http";
import {
  clearPlayedCards,
  createGameInfo,
  getGameInfo,
  getTrumpCard,
  removeCardFromHand,
  removeGameInfo,
  setPlayedCards,
  updateGameInfo,
  getRoundCount,
  setPlayRoundCount,
  removeRoundCount,
  chooseTrumpCard,
  setLastPlayedCards,
} from "./gameFuncs";
import {
  addRoom,
  destroyRoom,
  getRooms,
  handleRoomLeave,
  joinRoom,
  updateActiveRoomStatus,
  updateRoomActivity,
  updateUserStatus,
} from "./roomFuncs";
import {
  calculateAndUpdatePoints,
  createScoreBoard,
  updateBids,
  updateWins,
} from "./scoreBoardFuncs";
import { checkGameNeedsAction, removeTimer } from "./timer";
import {
  completeNineDealing,
  dealerRevealControllers,
  handleEndRound,
  handleGameState,
} from "./gameFlow";
import {
  broadcastRoomUpdate,
  DISCONNECT_GRACE_MS,
  markBusyIfStillDisconnected,
  pendingBusyByRoomUser,
  presenceByRoom,
  roomsBySocket,
  roomUserKey,
  trackJoinPresence,
  trackLeavePresence,
} from "./trackActivity";

declare module "http" {
  interface IncomingMessage {
    session: session.Session &
      Partial<session.SessionData> & {
        user?: UserSessionData;
      };
  }
}

declare module "socket.io" {
  interface Socket {
    request: IncomingMessage;
    user?: UserSessionData;
  }
}

export const trackActivity = async (roomId: string) => {
  if (roomId) {
    try {
      await updateRoomActivity(roomId);
    } catch (error) {
      console.log(`Error tracking activity for room ${roomId}:`, error);
    }
  }
};

const socketHandler = (io: Server) => {
  io.use((socket, next) => {
    sessionMiddleware(socket.request as any, {} as any, (err?: any) => {
      if (err) {
        console.error("Session middleware error:", err);
        return next(new Error("Session middleware error"));
      }

      next();
    });
  });

  io.use((socket, next) => {
    const req = socket.request as IncomingMessage;
    if (req.session?.user) {
      socket.user = req.session.user;
      next();
    } else {
      console.warn("Unauthorized socket connection attempt!");
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("getRooms", async () => {
      const rooms = await getRooms();
      if (rooms) {
        io.emit("getRooms", rooms);
      }
    });

    socket.on("getRoom", async (roomId: string) => {
      if (roomId) {
        const room = await getRooms();
        socket.join(roomId);

        await trackActivity(roomId);

        const foundRoom = room.find((r) => r.id === roomId);
        if (foundRoom) {
          await updateActiveRoomStatus(roomId, true);

          const userId = socket.user?._id;
          const inThisRoom =
            !!userId && foundRoom.users.some((u: RoomUser) => u.id === userId);

          if (userId && inThisRoom) {
            trackJoinPresence(roomId, userId, socket.id);

            const currentStatus = foundRoom.users.find(
              (u: RoomUser) => u.id === userId
            )?.status;
            if (currentStatus !== "active") {
              await updateUserStatus(roomId, userId, "active");
              await broadcastRoomUpdate(roomId, io);
              return;
            }
          }

          socket.emit("getRoom", foundRoom);
        } else {
          socket.emit("error", "Room not found");
        }
      }
    });

    socket.on("addRoom", async (data: Room) => {
      if (data) {
        await addRoom(data);

        socket.join(data.id);

        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
      } else {
        console.log("No data provided!");
      }
    });

    socket.on(
      "updateUserStatus",
      async (
        roomId: string,
        userId: string,
        status: "active" | "busy" | "inactive" | "left"
      ) => {
        if (roomId && userId && status) {
          await updateUserStatus(roomId, userId, status);
          const updatedRooms = await getRooms();
          if (updatedRooms) {
            io.emit("getRooms", updatedRooms);
            const foundRoom = updatedRooms.find((r) => r.id === roomId);
            if (foundRoom) {
              io.to(roomId).emit("getRoom", foundRoom);
            }
          }
        }
      }
    );

    socket.on(
      "setPlayedCards",
      async (data: { roomId: string; playerId: string; playedCard: Card }) => {
        if (data) {
          await setPlayedCards(data.roomId, data.playerId, data.playedCard);

          await trackActivity(data.roomId);

          const updatedGameInfo = await getGameInfo(data.roomId);
          if (updatedGameInfo) {
            io.to(data.roomId).emit("getGameInfo", updatedGameInfo);
          }
        }
      }
    );

    socket.on(
      "setLastPlayedCards",
      async (roomId: string, playedCards: PlayedCard[]) => {
        if (roomId && playedCards) {
          await setLastPlayedCards(roomId, playedCards);

          await trackActivity(roomId);

          const updatedGameInfo = await getGameInfo(roomId);
          if (updatedGameInfo) {
            io.to(roomId).emit("getGameInfo", updatedGameInfo);
          }
        }
      }
    );

    socket.on("clearPlayedCards", async (roomId: string) => {
      if (roomId) {
        await clearPlayedCards(roomId);

        await trackActivity(roomId);

        const updatedGameInfo = await getGameInfo(roomId);
        if (updatedGameInfo) {
          io.to(roomId).emit("getGameInfo", updatedGameInfo);
        }
      }
    });

    socket.on(
      "removeCardFromHand",
      async (data: { roomId: string; playerId: string; card: Card }) => {
        if (data) {
          await removeCardFromHand(data.roomId, data.playerId, data.card);

          await trackActivity(data.roomId);

          const updatedGameInfo = await getGameInfo(data.roomId);
          if (updatedGameInfo) {
            io.to(data.roomId).emit("getGameInfo", updatedGameInfo);
          }
        }
      }
    );

    socket.on("leaveRoom", async (roomId: string, userId: string) => {
      if (roomId && userId) {
        await handleRoomLeave(roomId, userId);
        socket.leave(roomId);

        const k = roomUserKey(roomId, userId);
        if (pendingBusyByRoomUser[k]) {
          clearTimeout(pendingBusyByRoomUser[k]);
          delete pendingBusyByRoomUser[k];
        }
        trackLeavePresence(roomId, userId, socket.id);

        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
        const updatedRoom = updatedRooms.find((r) => r.id === roomId);
        if (updatedRoom) {
          io.to(roomId).emit("getRoom", updatedRoom);
        }
      }
    });

    socket.on(
      "joinRoom",
      async (
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
        try {
          if (roomId && userId && userData) {
            const newUserData = { ...userData, status: "active" as const };
            await joinRoom(roomId, userId, newUserData);

            socket.join(roomId);
            trackJoinPresence(roomId, userId, socket.id);

            await broadcastRoomUpdate(roomId, io);
          }
        } catch (error: any) {
          console.log("join room error", error);
          socket.emit("error", error.message);
        }
      }
    );

    socket.on("dealingAnimationDone", async (roomId: string) => {
      if (!roomId) return;

      const gi = await getGameInfo(roomId);
      if (!gi) return;

      if (gi.currentHand === 9) {
        const nextStatus = gi.trumpCard ? "bid" : "choosingTrump";
        await updateGameInfo(roomId, { status: nextStatus });
      } else {
        await updateGameInfo(roomId, { status: "trump" });
      }

      const updated = await getGameInfo(roomId);
      if (updated) io.to(roomId).emit("getGameInfo", updated);

      setTimeout(() => handleGameState(roomId, io), 0);
    });

    socket.on("getGameInfo", async (roomId: string) => {
      let gameInfo = await getGameInfo(roomId);
      if (!gameInfo) {
        console.log(`[getGameInfo] Creating new game for room ${roomId}`);
        gameInfo = await createGameInfo(roomId);
        io.to(roomId).emit("getGameInfo", gameInfo);
        // Start the game loop for the first time
        setTimeout(async () => {
          await handleGameState(roomId, io);
        }, 1000);
      } else {
        socket.emit("getGameInfo", gameInfo);

        // If game is in "dealing" with no dealer, try to restart the flow
        if (gameInfo.status === "dealing" && !gameInfo.dealerId) {
          console.log(
            `[getGameInfo] Game already exists but no dealer. Starting dealer determination.`
          );
          setTimeout(async () => {
            await handleGameState(roomId, io);
          }, 200);
        }
      }
    });

    socket.on("removeGameInfo", async (roomId: string) => {
      if (roomId) {
        await removeGameInfo(roomId);
      }
    });

    socket.on("updateGameInfo", async (roomId: string, gameInfo: Game) => {
      if (roomId && gameInfo) {
        await updateGameInfo(roomId, gameInfo);
        const updatedGameInfo = await getGameInfo(roomId);
        if (updatedGameInfo) {
          io.to(roomId).emit("getGameInfo", updatedGameInfo);
          // After any update, let the central handle decide what's next.
          await handleGameState(roomId, io);
        }
      }
    });

    socket.on(
      "updateBids",
      async (
        roomId: string,
        bid: {
          playerId: string;
          bid: number;
          gameHand: number;
        }
      ) => {
        if (roomId && bid) {
          const updatedBid = await updateBids(roomId, bid);

          if (updatedBid) {
            await trackActivity(roomId);
            removeTimer(roomId, updatedBid.playerId);

            const latest = await getGameInfo(roomId);
            if (!latest) return;
            io.to(roomId).emit("getGameInfo", latest);

            setTimeout(() => handleGameState(roomId, io), 0);
          }
        }
      }
    );

    socket.on(
      "playCard",
      async (data: { roomId: string; playerId: string; card: Card }) => {
        const { roomId, playerId, card } = data;
        if (!roomId || !playerId || !card) return;

        await removeCardFromHand(roomId, playerId, card);
        await setPlayedCards(roomId, playerId, card);
        removeTimer(roomId, playerId);
        await trackActivity(roomId);

        await new Promise((resolve) => setTimeout(resolve, 100));
        let latest = await getGameInfo(roomId);
        if (!latest) {
          console.error(
            `[playCard] Failed to fetch game info for room ${roomId}`
          );
          return;
        }

        if (latest.playedCards && latest.playedCards.length === 4) {
          await handleEndRound(roomId, latest, io);
        } else {
          const playerIndex =
            latest.players.findIndex((p: string) => p === playerId) || 0;
          const nextPlayerId =
            latest.players[(playerIndex + 1) % latest.players.length];

          await updateGameInfo(roomId, { currentPlayerId: nextPlayerId });

          latest = await getGameInfo(roomId);
          if (!latest) return;
          io.to(roomId).emit("getGameInfo", latest);

          setTimeout(() => handleGameState(roomId, io), 0);
        }
      }
    );

    socket.on(
      "updateWins",
      async (
        roomId: string,
        win: { playerId: string; win: number; gameHand: number }
      ) => {
        if (roomId && win) {
          const updatedWin = await updateWins(roomId, win);

          await trackActivity(roomId);

          if (updatedWin) {
            const gameInfo = await getGameInfo(roomId);
            if (gameInfo) {
              io.to(roomId).emit("getGameInfo", gameInfo);
            }
          }
        }
      }
    );

    socket.on("destroyRoom", async (roomId: string) => {
      if (roomId) {
        await destroyRoom(roomId);
        await removeRoundCount(roomId);
        socket.leave(roomId);
        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
      }
    });

    socket.on("removeTimer", (roomId: string, playerId: string) => {
      if (!roomId || !playerId) return;

      removeTimer(roomId, playerId);
    });

    socket.on("getTrumpCard", async (roomId: string) => {
      const trumpCard = await getTrumpCard(roomId);

      await trackActivity(roomId);

      if (trumpCard) {
        const gameInfo = await getGameInfo(roomId);
        if (gameInfo) {
          io.to(roomId).emit("getGameInfo", gameInfo);
        }
      }
    });

    socket.on(
      "chooseTrumpCard",
      async (roomId: string, trumpCard: PlayingCard) => {
        await chooseTrumpCard(roomId, trumpCard);
        await trackActivity(roomId);

        const gameInfo = await getGameInfo(roomId);
        if (!gameInfo) return;

        if (gameInfo.currentPlayerId) {
          removeTimer(roomId, gameInfo.currentPlayerId);
        }

        if (gameInfo.currentHand === 9) {
          await completeNineDealing(roomId, io);
        } else {
          io.to(roomId).emit("getGameInfo", gameInfo);
        }
      }
    );

    socket.on("getRoundCount", async (roomId: string) => {
      const roundCount = await getRoundCount(roomId);
      if (roundCount) {
        socket.emit("getRoundCount", roundCount);
      }
    });

    socket.on("setRoundCount", async (roomId: string, count: number) => {
      await setPlayRoundCount(roomId, count);
      const roundCount = await getRoundCount(roomId);
      if (roundCount) {
        socket.emit("getRoundCount", roundCount);
      }
    });

    socket.on("calculatePoints", async (roomId: string) => {
      await calculateAndUpdatePoints(roomId);
      const gameInfo = await getGameInfo(roomId);
      if (gameInfo) {
        io.to(roomId).emit("getGameInfo", gameInfo);
      }
    });

    socket.on("createScoreBoard", async (roomId: string) => {
      const scoreBoard = await createScoreBoard(roomId);
      if (scoreBoard) {
        const gameInfo = await getGameInfo(roomId);
        if (gameInfo) {
          io.to(roomId).emit("getGameInfo", gameInfo);
        }
      }
    });

    socket.on("disconnect", async () => {
      const userId = socket.user?._id;
      if (!userId) return;

      const joinedRooms = Array.from(roomsBySocket[socket.id] || []);
      for (const roomId of joinedRooms) {
        trackLeavePresence(roomId, userId, socket.id);

        const stillConnected = !!presenceByRoom[roomId]?.[userId]?.size;
        if (stillConnected) continue;

        const k = roomUserKey(roomId, userId);
        if (pendingBusyByRoomUser[k]) clearTimeout(pendingBusyByRoomUser[k]);

        pendingBusyByRoomUser[k] = setTimeout(() => {
          markBusyIfStillDisconnected(roomId, userId, io).catch(() => {});
        }, DISCONNECT_GRACE_MS);
      }
    });
  });
};

export default socketHandler;
