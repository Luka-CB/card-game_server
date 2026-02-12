import express from "express";
import {
  getJCoins,
  getUserRating,
  getUserStats,
  updateJCoins,
  updateStats,
} from "../controllers/userStats.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/update-jCoins", isAuthenticated, updateJCoins);
router.get("/get-jCoins", isAuthenticated, getJCoins);

router.post("/update-stats", isAuthenticated, updateStats);
router.get("/get-stats", isAuthenticated, getUserStats);
router.get("/get-rating", isAuthenticated, getUserRating);

export default router;
