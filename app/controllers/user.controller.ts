import { RequestHandler } from "express";

export const getSessionUser: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("No session user!");

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};
