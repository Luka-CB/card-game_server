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
import sessionMiddleware from "./middlewares/session.middleware";

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
  })
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

app.use(errorMiddleware);

socketHandler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server is up and running on port ${PORT}`.cyan.underline.bold)
);
