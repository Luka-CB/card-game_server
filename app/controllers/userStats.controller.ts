import { RequestHandler } from "express";
import UserStats from "../models/UserStats.model";
import { calculateRating } from "../utils/helper";

export const updateCredits: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    const { credits } = req.body;
    if (!user) throw new Error("Session user not found!");

    const userCredits = await UserStats.findOne({ userId: user._id });
    if (!userCredits) throw new Error("User stats not found!");

    const newCredits =
      credits > 0
        ? userCredits.credits + credits
        : userCredits.credits - credits;

    const updateUserStats = await UserStats.updateOne(
      { userId: user._id },
      { credits: newCredits },
    );
    if (!updateUserStats) throw new Error("Failed to update user credits!");

    res.status(200).json({ success: true, credits: newCredits });
  } catch (error) {
    next(error);
  }
};

export const getCredits: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const credits = await UserStats.findOne({ userId: user._id }).select(
      "credits",
    );
    if (!credits) throw new Error("User stats not found!");

    res.status(200).json({ success: true, credits: credits.credits });
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

    const updateUserStats = await UserStats.findOneAndUpdate(
      { userId: user._id },
      {
        ...newStats,
        rating: newRating,
      },
      { new: true },
    );

    if (!updateUserStats) throw new Error("Failed to update user stats!");

    res.status(200).json({ success: true, stats: updateUserStats });
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
