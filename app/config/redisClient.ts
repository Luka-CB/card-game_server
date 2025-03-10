import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = new Redis({
  host: process.env.REDIS_HOST as string,
  port: Number(process.env.REDIS_PORT),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redisClient.on("connect", () =>
  console.log("Connect to Redis".magenta.underline.bold)
);
redisClient.on("error", (err) =>
  console.error("Redis error:".red.underline.bold, err)
);

export default redisClient;
