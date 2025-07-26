import { Server, Socket } from "socket.io";
import session from "express-session";
import sessionMiddleware from "../middlewares/session.middleware";
import {
  Card,
  Game,
  PlayedCard,
  PlayingCard,
  Room,
  UserSessionData,
} from "../utils/interfaces.util";
import { IncomingMessage } from "http";
import {
  clearPlayedCards,
  createGameInfo,
  dealCards,
  determineDealer,
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
  rejoinRoom,
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
import { getBotBid, integrateBotsWithGame } from "./bots";

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

const trackActivity = async (roomId: string) => {
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

  const dealerRevealControllers: Record<
    string,
    {
      sequence: { playerId: string; card: any }[];
      currentIndex: number;
      timeout?: NodeJS.Timeout;
      isActive: boolean;
      isInitialSequence?: boolean;
    }
  > = {};

  const startDealerReveal = (roomId: string, io: Server) => {
    const controller = dealerRevealControllers[roomId];
    if (!controller || controller.isActive) return;

    const initialDeley = controller.isInitialSequence ? 1000 : 0;
    controller.isActive = true;
    controller.currentIndex = 0;

    const sendNextCard = () => {
      if (controller.timeout) {
        clearTimeout(controller.timeout);
      }

      if (controller.currentIndex >= controller.sequence.length) {
        const dealerCard = controller.sequence.find(
          (s) => "rank" in s.card && s.card.rank === "A"
        );
        const dealerId =
          dealerCard?.playerId || controller.sequence[0]?.playerId || "";

        io.to(roomId).emit("dealerRevealDone", { dealerId });

        delete dealerRevealControllers[roomId];
        return;
      }

      const step = controller.sequence[controller.currentIndex];

      io.to(roomId).emit("dealerRevealStep", {
        targetPlayerId: step.playerId,
        card: step.card,
      });

      controller.currentIndex++;

      const deley = controller.currentIndex === 1 ? 1000 : 800;
      controller.timeout = setTimeout(sendNextCard, deley);
    };

    controller.timeout = setTimeout(sendNextCard, initialDeley);
  };

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

        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
        const updatedRoom = updatedRooms.find((r) => r.id === roomId);
        if (updatedRoom) {
          io.to(roomId).emit("getRoom", updatedRoom);
        }
      }
    });

    socket.on(
      "rejoinRoom",
      async (
        roomId: string,
        users: { id: string; username: string; avatar: string | null }[]
      ) => {
        try {
          if (roomId && users) {
            await rejoinRoom(roomId, users);

            socket.join(roomId);

            const updatedRooms = await getRooms();
            io.emit("getRooms", updatedRooms);
            const updatedRoom = updatedRooms.find((r) => r.id === roomId);
            if (updatedRoom) {
              io.to(roomId).emit("getRoom", updatedRoom);
            }
          }
        } catch (error: any) {
          console.log("rejoin room error", error);
          socket.emit("error", error.message);
        }
      }
    );

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
            await joinRoom(roomId, userId, userData);

            socket.join(roomId);

            const updatedRooms = await getRooms();
            io.emit("getRooms", updatedRooms);
          }
        } catch (error: any) {
          console.log("join room error", error);
          socket.emit("error", error.message);
        }
      }
    );

    socket.on("determineDealer", async (roomId: string) => {
      if (dealerRevealControllers[roomId]?.timeout) {
        clearTimeout(dealerRevealControllers[roomId].timeout);
      }

      const rooms = await getRooms();
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;

      await trackActivity(roomId);

      const playerIds = [...room.users]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((user: { id: string }) => user.id);

      const { revealSequence } = determineDealer(playerIds);

      dealerRevealControllers[roomId] = {
        sequence: revealSequence,
        currentIndex: 0,
        isActive: false,
        isInitialSequence: !dealerRevealControllers[roomId],
      };

      io.to(roomId).emit("dealerRevealPrepare");
      startDealerReveal(roomId, io);
    });

    socket.on("startRound", async (roomId: string, round: number) => {
      const rooms = await getRooms();
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;

      await trackActivity(roomId);

      const playerIds = room.users.map((user: { id: string }) => user.id);
      const cardsPerPlayer = round;

      const hands = dealCards(playerIds, cardsPerPlayer);

      const gameInfo = await getGameInfo(roomId);

      let newHands: {
        hand: Card[];
        playerId: string;
      }[] = [];

      for (let playerId of playerIds) {
        io.to(roomId).emit("dealCards", {
          hand: hands[playerId],
          playerId,
          round,
        });

        newHands.push({
          hand: hands[playerId],
          playerId,
        });
      }

      const hasEmptyHands =
        gameInfo?.hands === null ||
        gameInfo?.hands?.every((hand: any) => hand.hand.length === 0);

      if (hasEmptyHands) {
        if (gameInfo && newHands.length === 4) {
          await updateGameInfo(roomId, {
            ...gameInfo,
            hands: newHands,
          });
        }
      }
    });

    socket.on("getGameInfo", async (roomId: string) => {
      let gameInfo = await getGameInfo(roomId);
      if (!gameInfo) {
        gameInfo = await createGameInfo(roomId);
      }
      socket.emit("getGameInfo", gameInfo);
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

          await trackActivity(roomId);

          if (updatedBid) {
            const gameInfo = await getGameInfo(roomId);
            if (gameInfo) {
              io.to(roomId).emit("getGameInfo", gameInfo);
            }
          }
        }
      }
    );

    socket.on(
      "setBotBid",
      async (data: {
        roomId: string;
        playerId: string;
        hand: Card[];
        playerOrder: string[];
        currentBids: { [playerId: string]: number };
        nextPlayerId: string;
      }) => {
        if (
          data.roomId &&
          data.playerId &&
          data.hand &&
          data.playerOrder &&
          data.nextPlayerId
        ) {
          const game = await getGameInfo(data.roomId);
          if (game) {
            const gameState = integrateBotsWithGame(game);
            const botBid = getBotBid(
              data.playerId,
              data.hand,
              gameState,
              data.playerOrder,
              data.currentBids
            );
            if (botBid) {
              console.log("bot bid", botBid);
              await updateBids(data.roomId, {
                playerId: data.playerId,
                bid: botBid,
                gameHand: game.gameHand,
              });

              await updateGameInfo(data.roomId, {
                currentPlayerId: data.nextPlayerId,
                status: game.dealerId === data.playerId ? "playing" : "bid",
              });

              await updateUserStatus(data.roomId, data.playerId, "busy");

              const updatedGameInfo = await getGameInfo(data.roomId);
              if (updatedGameInfo) {
                io.to(data.roomId).emit("getGameInfo", updatedGameInfo);
              }

              const updatedRooms = await getRooms();
              if (updatedRooms) {
                io.emit("getRooms", updatedRooms);
                const foundRoom = updatedRooms.find(
                  (r) => r.id === data.roomId
                );
                if (foundRoom) {
                  io.to(data.roomId).emit("getRoom", foundRoom);
                }
              }
            }
          }
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
        if (gameInfo) {
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

      for (const roomId in dealerRevealControllers) {
        const controller = dealerRevealControllers[roomId];
        if (controller.timeout) {
          clearTimeout(controller.timeout);
        }
        delete dealerRevealControllers[roomId];
      }
    });
  });
};

export default socketHandler;
