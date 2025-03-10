import express from "express";
import http from "http";
import { Server } from "socket.io";
import socketHandler from "./socket/socket";
import passport from "passport";
import cookieParser from "cookie-parser";
import session from "express-session";
import cors from "cors";
import { RedisStore } from "connect-redis";
import redisClient from "./config/redisClient";
import errorMiddleware from "./middlewares/error.middleware";
import connectDB from "./config/db";

import "dotenv/config";
import "colors";
import "./config/passport";

import authRouter from "./routes/auth.route";
import oauthRouter from "./routes/oauth.route";
import userRouter from "./routes/user.route";
import emailRouter from "./routes/email.route";

connectDB();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

app.set("trust proxy", 1);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    name: "sid",
    cookie: {
      secure: process.env.NODE_ENV !== "development",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "strict",
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

////////// ROUTES //////////
app.use("/api/auth", authRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api/users", userRouter);
app.use("/api/emails", emailRouter);

app.use(errorMiddleware);

socketHandler(io);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server is up and running on port ${PORT}`.cyan.underline.bold)
);
