import express from "express";
import { getSessionUser } from "../controllers/user.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/session-user", getSessionUser);

export default router;
