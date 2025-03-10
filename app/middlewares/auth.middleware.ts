import { RequestHandler } from "express";
import { UserSession } from "../utils/interfaces.util";

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (req.session && (req.session as UserSession).user) {
    next();
  } else {
    res.status(401).json({ msg: "Not authorized, no token!" });
    return;
  }
};
