import session from "express-session";
import { RedisStore } from "connect-redis";
import redisClient from "../config/redisClient";
import "dotenv/config";

const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET as string,
  resave: false,
  saveUninitialized: false,
  name: "sid",
  cookie: {
    secure: process.env.NODE_ENV !== "development",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "strict",
  },
});

export default sessionMiddleware;
