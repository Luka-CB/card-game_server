import mongoose from "mongoose";

export interface UserStatsIFace {
  _id: string;
  userId: string;
  credits: number;
  gamesPlayed: number;
  gamesFinished: {
    first: number;
    second: number;
    third: number;
    fourth: number;
  };
  gamesLeft: number;
  rating: number;
}

const userStatsSchema = new mongoose.Schema<UserStatsIFace>(
  {
    userId: mongoose.Schema.Types.ObjectId,
    credits: {
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
  },
  { timestamps: true },
);

export default mongoose.model<UserStatsIFace>("UserStats", userStatsSchema);
