import express from "express";
import http from "http";
import { Server } from "socket.io";
import socketHandler from "./socket/socket";
import passport from "passport";
import cookieParser from "cookie-parser";
import cors from "cors";
import errorMiddleware from "./middlewares/error.middleware";
import connectDB from "./config/db";

import "dotenv/config";
import "colors";
import "./config/passport";

import authRouter from "./routes/auth.route";
import oauthRouter from "./routes/oauth.route";
import userRouter from "./routes/user.route";
import emailRouter from "./routes/email.route";
import statsRouter from "./routes/userStats.route";

import sessionMiddleware from "./middlewares/session.middleware";
import { roomCleanupService } from "./socket/roomCleanupService";

import Avatar from "./models/Avatar.model";

connectDB();
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  allowEIO3: true,
});

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  }),
);

app.set("trust proxy", 1);

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.get("/debug-session", (req, res) => {
  res.json({ session: req.session, user: req.session?.user });
});

////////// ROUTES //////////
app.use("/api/auth", authRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api/users", userRouter);
app.use("/api/emails", emailRouter);
app.use("/api/stats", statsRouter);

////////// ERROR MIDDLEWARE //////////
app.use(errorMiddleware);

socketHandler(io);

roomCleanupService.start();

process.on("SIGTERM", () => {
  console.log(
    "SIGTERM recieved, shutting down gracefully...".red.underline.bold,
  );
  roomCleanupService.stop();
  server.close(() => {
    console.log("Server closed".red.underline.bold);
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log(
    "SIGINT recieved, shutting down gracefully...".red.underline.bold,
  );
  roomCleanupService.stop();
  server.close(() => {
    console.log("Server closed".red.underline.bold);
    process.exit(0);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is up and running on port ${PORT}`.cyan.underline.bold);
  console.log(
    `Room cleanup service configuration:`,
    roomCleanupService.getConfig(),
  );
});
