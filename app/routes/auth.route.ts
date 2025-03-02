import express from "express";
import {
  changePassword,
  getRefreshToken,
  logout,
  signin,
  signup,
} from "../controllers/auth.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/refresh", getRefreshToken);
router.post("/signup", signup);
router.post("/signin", signin);
router.put("/change-password", changePassword);
router.get("/logout", isAuthenticated, logout);

export default router;
