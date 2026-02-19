import { Router } from "express";

import { getUserInfo } from "../controllers/auth.controller";

const router = Router();

router.get("/auth/user", getUserInfo);

export default router;
