import { Server } from "socket.io";
import { Game, GameTimer, Room } from "../utils/interfaces.util";
import { getRoom } from "./roomFuncs";
import { getGameInfo } from "./gameFuncs";
import { handleBotMoves } from "./bots";
import { trackActivity } from "./socket";

const gameTimers: Record<string, GameTimer> = {};

export const createTimer = (
  roomId: string,
  duration: number,
  type: GameTimer["type"],
  playerId?: string
): GameTimer => {
  const timerId = playerId ? `${roomId}-${playerId}` : roomId;

  const timer: GameTimer = {
    roomId,
    startTime: Date.now(),
    duration,
    isActive: true,
    type,
    playerId,
  };

  gameTimers[timerId] = timer;
  return timer;
};

export const getTimer = (
  roomId: string,
  playerId?: string
): GameTimer | null => {
  const timerId = playerId ? `${roomId}-${playerId}` : roomId;
  return gameTimers[timerId] || null;
};

export const stopTimer = (roomId: string, playerId?: string): void => {
  const timerId = playerId ? `${roomId}-${playerId}` : roomId;
  if (gameTimers[timerId]) gameTimers[timerId].isActive = false;
};

export const removeTimer = (roomId: string, playerId?: string): void => {
  const timerId = playerId ? `${roomId}-${playerId}` : roomId;
  delete gameTimers[timerId];
};

export const getRemainingTime = (timer: GameTimer): number => {
  if (!timer.isActive) return 0;

  const elapsed = (Date.now() - timer.startTime) / 1000;
  const remaining = Math.max(0, timer.duration - elapsed);
  return Math.ceil(remaining);
};

export const isTimerExpired = (timer: GameTimer): boolean => {
  return getRemainingTime(timer) <= 0;
};

export function clearRoomPlayingTimers(roomId: string) {
  for (const key of Object.keys(gameTimers)) {
    const t = gameTimers[key];
    if (t.roomId === roomId && t.type === "playing") {
      t.isActive = false;
      delete gameTimers[key];
    }
  }
}

// const activeGames: Record<string, NodeJS.Timeout> = {};

export const startServerTimer = async (
  roomId: string,
  playerId: string,
  io: Server,
  type: GameTimer["type"]
): Promise<void> => {
  if (!roomId || !type) return;

  try {
    await trackActivity(roomId);

    const room: Room = await getRoom(roomId);
    if (!room) {
      console.error(`[Timer] Room ${roomId} not found`);
      return;
    }

    const userStatus = room.users.find((user) => user.id === playerId)?.status;
    const duration = userStatus === "active" ? 20 : 3;

    removeTimer(roomId, playerId);

    const timer = createTimer(roomId, duration, type, playerId);

    io.to(roomId).emit("timerStarted", {
      timer,
      remainingTime: duration,
    });

    setTimeout(async () => {
      try {
        const currentTimer = getTimer(roomId, playerId);
        if (
          currentTimer &&
          currentTimer.isActive &&
          isTimerExpired(currentTimer)
        ) {
          stopTimer(roomId, playerId);
          io.to(roomId).emit("timerExpired", {
            roomId,
            type,
            playerId,
          });

          const gameInfo = await getGameInfo(roomId);

          if (gameInfo && gameInfo.currentPlayerId === playerId) {
            console.log(`[Timer] Executing bot move for ${playerId} (${type})`);
            await handleBotMoves(roomId, type, gameInfo, io, playerId);
          } else {
            console.log(
              `[Timer] Game state mismatch - currentPlayer: ${gameInfo?.currentPlayerId}, expected: ${playerId}`
            );
            setTimeout(() => checkGameNeedsAction(roomId, io), 1000);
          }
        }
      } catch (error) {
        console.warn(`[Timer] Error in timer callback for ${roomId}:`, error);
        // Failsafe: retry after 2 seconds
        setTimeout(() => {
          console.log(`[Timer] Retrying timer for ${roomId} - ${playerId}`);
          startServerTimer(roomId, playerId, io, type);
        }, 2000);
      }
    }, duration * 1000);
  } catch (error) {
    console.error(`[Timer] Error starting timer for ${roomId}:`, error);
  }
};

export const checkGameNeedsAction = async (
  roomId: string,
  io: Server
): Promise<void> => {
  const room: Room = await getRoom(roomId);
  const gameInfo: Game | null = await getGameInfo(roomId);

  if (!room || !gameInfo) return;

  // Check if currently someone's turn and they're not active
  if (gameInfo.currentPlayerId && gameInfo.status === "playing") {
    const currentPlayer = room.users.find(
      (user) => user.id === gameInfo.currentPlayerId
    );
    if (currentPlayer && currentPlayer.status !== "active") {
      // Start server-side timer for this player
      await startServerTimer(roomId, gameInfo.currentPlayerId, io, "playing");
    }
  }

  // Handle bidding phase
  if (gameInfo.currentPlayerId && gameInfo.status === "bid") {
    const currentPlayer = room.users.find(
      (user) => user.id === gameInfo.currentPlayerId
    );
    if (currentPlayer && currentPlayer.status !== "active") {
      await startServerTimer(roomId, gameInfo.currentPlayerId, io, "bid");
    }
  }

  // Handle trump phase
  if (gameInfo.currentPlayerId && gameInfo.status === "choosingTrump") {
    const currentPlayer = room.users.find(
      (user) => user.id === gameInfo.currentPlayerId
    );
    if (currentPlayer && currentPlayer.status !== "active") {
      await startServerTimer(roomId, gameInfo.currentPlayerId, io, "trump");
    }
  }
};
