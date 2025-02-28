import { RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User, { UserIFace } from "../models/User.model";

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization?.startsWith("Bearer")
  ) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET as string
      ) as JwtPayload;

      const user = (await User.findById(decoded.id).select(
        "-password"
      )) as UserIFace;
      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ msg: "Not authorized, token failed!" });
      return;
    }
  } else {
    res.status(401).json({ msg: "Not authorized, no token!" });
    return;
  }
};
