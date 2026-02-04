import express from "express";
import { getAvatars, getSessionUser } from "../controllers/user.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/session-user", getSessionUser);
router.get("/avatars", getAvatars);

export default router;
