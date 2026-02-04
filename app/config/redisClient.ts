import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisConfig: any = {
  host: process.env.REDIS_HOST as string,
  port: Number(process.env.REDIS_PORT),
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

const redisClient = new Redis(redisConfig);

redisClient.on("connect", () =>
  console.log("Connect to Redis".magenta.underline.bold)
);
redisClient.on("error", (err) =>
  console.error("Redis error:".red.underline.bold, err)
);

export default redisClient;
