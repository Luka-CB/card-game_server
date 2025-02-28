import express from "express";
import {
  getRefreshToken,
  logout,
  sendVerificationEmail,
  signup,
  updateEmail,
  verifyEmail,
} from "../controllers/auth.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/send-email", isAuthenticated, sendVerificationEmail);
router.put("/verify", verifyEmail);
router.post("/refresh", getRefreshToken);
router.post("/signup", signup);
router.put("/change-email", isAuthenticated, updateEmail);
router.get("/logout", isAuthenticated, logout);

export default router;
