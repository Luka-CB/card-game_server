import passport from "passport";
import express from "express";
import { UserIFace } from "../models/User.model";

const router = express.Router();

router.get(
  "/login/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    failureMessage: true,
  })
);

router.get(
  "/login/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/?auth=error",
    failureMessage: "Failed",
  }),
  (req, res) => {
    const user = req.user as UserIFace;
    req.session.user = {
      _id: user?._id,
      username: user?.username,
      avatar: user?.avatar,
      email: user?.email,
      isVerified: user?.isVerified,
    };
    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
        return res.status(500).redirect("http://localhost:3000/?auth=error");
      }
      res.redirect("http://localhost:3000/?auth=redirecting");
    });
  }
);

export default router;
