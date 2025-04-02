import { RequestHandler } from "express";

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ msg: "Not authorized, no token!" });
    return;
  }
};
