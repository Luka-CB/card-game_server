import express from "express";
import {
  sendChangePasswordEmail,
  sendVerificationEmail,
  updateEmail,
  verifyEmail,
} from "../controllers/email.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/send-email/verify-email", isAuthenticated, sendVerificationEmail);
router.post("/send-email/change-password", sendChangePasswordEmail);
router.put("/verify", verifyEmail);
router.put("/change-email", isAuthenticated, updateEmail);

export default router;
