import { Router } from "express";

import { selectSkin } from "../controllers/inventory.controller";

const router = Router();

router.post("/inventory/selectSkin", selectSkin);

export default router;
