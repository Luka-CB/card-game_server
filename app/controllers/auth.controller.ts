import { RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/User.model";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util";
import bcrypt from "bcrypt";

export const getRefreshToken: RequestHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) throw new Error("Invalid refresh token");

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET!,
      async (err: jwt.VerifyErrors | null, user: any) => {
        if (err) throw new Error("Invalid refresh token");

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          sameSite: "strict",
          maxAge: 1000 * 60 * 60 * 24 * 7,
        });

        res.status(200).json({
          success: true,
          accessToken,
        });
      },
    );
  } catch (error) {
    next(error);
  }
};

export const signup: RequestHandler = async (req, res, next) => {
  try {
    const { username, email, avatar, password } = req.body;

    const existingUsername = await User.findOne({
      username: username.toLowerCase().trim(),
    });
    if (existingUsername) throw new Error("This username already exists");

    const existingUserEmail = await User.findOne({
      email: email.trim(),
    });
    if (existingUserEmail) {
      throw new Error("This email already exists");
    }

    const user = await User.create({
      username: username.toLowerCase(),
      originalUsername: username,
      email,
      avatar,
      password,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const userData = {
      _id: user._id,
      username: user.username,
      originalUsername: user.originalUsername,
      avatar: user.avatar,
      email: user.email,
      isVerified: user.isVerified,
    };

    req.session.user = userData;

    res.status(201).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const signin: RequestHandler = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      username: username.toLowerCase().trim(),
    });
    if (!user) throw new Error("Username is Incorrect!");
    if (!(await user.matchPasswords(password.trim())))
      throw new Error("Password is Incorrect!");

    const userData = {
      _id: user._id,
      username: user.username,
      originalUsername: user.originalUsername,
      avatar: user.avatar,
      email: user.email,
      isVerified: user.isVerified,
    };

    req.session.user = userData;

    res.status(201).json(userData);
  } catch (error) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    const { password, token } = req.body;
    const decoded = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const updatedUser = await User.updateOne(
      { _id: decoded.id },
      { password: hashedPassword },
    );
    if (!updatedUser) throw new Error("Request has failed!");

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = (req, res, next) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        throw new Error("Error destroing session: " + err);
      }
      res.clearCookie("sid");
      res.status(200).json({ msg: "success" });
    });
  } catch (error) {
    next(error);
  }
};
