import express from "express";
import {
  getCredits,
  getUserStats,
  updateCredits,
  updateStats,
} from "../controllers/userStats.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/update-credits", isAuthenticated, updateCredits);
router.get("/get-credits", isAuthenticated, getCredits);

router.post("/update-stats", isAuthenticated, updateStats);
router.get("/get-stats", isAuthenticated, getUserStats);

export default router;
