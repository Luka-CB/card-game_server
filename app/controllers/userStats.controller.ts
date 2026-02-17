import { RequestHandler } from "express";
import UserStats from "../models/UserStats.model";
import { calculateRating, calculateRatingTrend } from "../utils/helper";

export const updateJCoins: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    const { jCoins } = req.body;
    if (!user) throw new Error("Session user not found!");

    const userJCoins = await UserStats.findOne({ userId: user._id });
    if (!userJCoins) throw new Error("User stats not found!");

    const newJCoins =
      jCoins > 0 ? userJCoins.jCoins + jCoins : userJCoins.jCoins - jCoins;

    const updateUserStats = await UserStats.updateOne(
      { userId: user._id },
      { jCoins: newJCoins },
    );
    if (!updateUserStats) throw new Error("Failed to update user jCoins!");

    res.status(200).json({ success: true, jCoins: newJCoins });
  } catch (error) {
    next(error);
  }
};

export const getJCoins: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const UserStat = await UserStats.findOne({ userId: user._id }).select(
      "jCoins",
    );
    if (!UserStat) throw new Error("User stats not found!");

    const formatCoins = (coins: number): string => {
      if (coins >= 1000) {
        const thousands = coins / 1000;
        return thousands % 1 === 0
          ? `${thousands}k`
          : `${thousands.toFixed(1)}k`;
      }
      return coins.toFixed();
    };

    res.status(200).json({
      success: true,
      jCoins: formatCoins(UserStat.jCoins),
      rawJCoins: UserStat.jCoins,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStats: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const {
      gameFinished,
      leftGame,
    }: { gameFinished: number; leftGame: boolean } = req.body;

    const userStats = await UserStats.findOne({ userId: user._id });
    if (!userStats) throw new Error("User stats not found!");

    const newStats = {
      gamesPlayed: userStats.gamesPlayed + 1,
      gameFinished: {
        first:
          gameFinished === 1
            ? userStats.gamesFinished.first + 1
            : userStats.gamesFinished.first,
        second:
          gameFinished === 2
            ? userStats.gamesFinished.second + 1
            : userStats.gamesFinished.second,
        third:
          gameFinished === 3
            ? userStats.gamesFinished.third + 1
            : userStats.gamesFinished.third,
        fourth:
          gameFinished === 4
            ? userStats.gamesFinished.fourth + 1
            : userStats.gamesFinished.fourth,
      },
      gamesLeft: leftGame ? userStats.gamesLeft + 1 : userStats.gamesLeft,
    };

    const newRating = calculateRating({
      ...userStats.toObject(),
      ...newStats,
    });

    const newRatingHistory = [
      ...userStats.ratingHistory,
      { rating: newRating, timestamp: new Date() },
    ];

    const trimmedHistory = newRatingHistory.slice(-20);
    const trend = calculateRatingTrend(trimmedHistory);

    const updateUserStats = await UserStats.findOneAndUpdate(
      { userId: user._id },
      {
        ...newStats,
        rating: newRating,
        ratingHistory: trimmedHistory,
        ratingTrend: trend,
      },
      { new: true },
    );

    if (!updateUserStats) throw new Error("Failed to update user stats!");

    res.status(200).json({
      success: true,
      stats: updateUserStats,
      ratingChange: newRating - userStats.rating,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserStats: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const stats = await UserStats.findOne({ userId: user._id });
    if (!stats) throw new Error("User stats not found!");

    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

export const getUserRating: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const stats = await UserStats.findOne({ userId: user._id }).select(
      "rating ratingTrend",
    );
    if (!stats) throw new Error("User stats not found!");

    res
      .status(200)
      .json({ success: true, rating: stats.rating, trend: stats.ratingTrend });
  } catch (error) {
    next(error);
  }
};
