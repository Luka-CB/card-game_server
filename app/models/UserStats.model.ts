import mongoose from "mongoose";

export interface UserStatsIFace {
  _id: string;
  userId: string;
  jCoins: number;
  gamesPlayed: number;
  gamesFinished: {
    first: number;
    second: number;
    third: number;
    fourth: number;
  };
  gamesLeft: number;
  rating: number;
  ratingHistory: { rating: number; timestamp: Date }[];
  ratingTrend: "up" | "down" | "stable";
}

const userStatsSchema = new mongoose.Schema<UserStatsIFace>(
  {
    userId: mongoose.Schema.Types.ObjectId,
    jCoins: {
      type: Number,
      default: 0,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    gamesFinished: {
      first: {
        type: Number,
        default: 0,
      },
      second: {
        type: Number,
        default: 0,
      },
      third: {
        type: Number,
        default: 0,
      },
      fourth: {
        type: Number,
        default: 0,
      },
    },
    gamesLeft: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    ratingHistory: [
      {
        rating: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    ratingTrend: {
      type: String,
      enum: ["up", "down", "stable"],
      default: "stable",
    },
  },
  { timestamps: true },
);

export default mongoose.model<UserStatsIFace>("UserStats", userStatsSchema);
