import { RequestHandler } from "express";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util";
import { UserIFace } from "../models/User.model";

export const getSessionUser: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user as UserIFace;
    if (!user) throw new Error("No session user!");

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    res.status(200).json({
      _id: user._id,
      username: user.username,
      avatar: user.avatar,
      isVerified: user.isVerified,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};
