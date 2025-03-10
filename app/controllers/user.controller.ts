import { RequestHandler } from "express";
import { UserSession } from "../utils/interfaces.util";

export const getSessionUser: RequestHandler = async (req, res, next) => {
  try {
    const user = (req.session as UserSession).user;
    if (!user) throw new Error("No session user!");

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};
