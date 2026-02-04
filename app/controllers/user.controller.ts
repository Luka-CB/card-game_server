import { RequestHandler } from "express";
import Avatar from "../models/Avatar.model";

export const getSessionUser: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("No session user!");

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const getAvatars: RequestHandler = async (req, res, next) => {
  try {
    const avatars = await Avatar.find({});
    if (!avatars) throw new Error("No avatars found");

    res.status(200).json(avatars);
  } catch (error) {
    next(error);
  }
};
