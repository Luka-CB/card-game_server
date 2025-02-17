import { Server, Socket } from "socket.io";
import { onlineUsers } from "./socketData";

const socketHandler = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("User Connected:", socket.id);

    socket.on("disconnect", () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        onlineUsers.delete(socket.id);
        io.emit("onlineUsers", Array.from(onlineUsers.values()));
        console.log(`${user.username} left the room.`);
      }
    });
  });
};

export default socketHandler;
