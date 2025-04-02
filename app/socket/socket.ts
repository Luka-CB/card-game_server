import { Server, Socket } from "socket.io";
import session from "express-session";
import sessionMiddleware from "../middlewares/session.middleware";
import { UserSessionData } from "../utils/interfaces.util";
import { IncomingMessage } from "http";
import {
  addRoom,
  getRooms,
  Room,
  removeRoom,
  leaveRoom,
  joinRoom,
} from "./socketData";

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

    socket.on("addRoom", async (data: Room, userId: string) => {
      if (data) {
        await addRoom(data);
        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
      } else {
        console.log("No data provided!");
      }
    });

    socket.on("removeRoom", async (roomId: string) => {
      if (roomId) {
        await removeRoom(roomId);
        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
      }
    });

    socket.on("leaveRoom", async (roomId: string, userId: string) => {
      if (roomId && userId) {
        await leaveRoom(roomId, userId);
        const updatedRooms = await getRooms();
        io.emit("getRooms", updatedRooms);
      }
    });

    socket.on(
      "joinRoom",
      async (
        roomId: string,
        userId: string,
        userData: { id: string; username: string; avatar: string | null }
      ) => {
        try {
          if (roomId && userId && userData) {
            await joinRoom(roomId, userId, userData);
            const updatedRooms = await getRooms();
            io.emit("getRooms", updatedRooms);
          }
        } catch (error: any) {
          socket.emit("error", error.message);
        }
      }
    );

    socket.on("disconnect", () => {});
  });
};

export default socketHandler;
