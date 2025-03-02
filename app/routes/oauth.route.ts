import passport from "passport";
import express from "express";

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
    scope: ["profile", "email"],
    failureRedirect: "http://localhost:3000/?auth=error",
    failureMessage: "Failed",
    successRedirect: "http://localhost:3000/?auth=redirecting",
    successMessage: "success",
  })
);

export default router;
