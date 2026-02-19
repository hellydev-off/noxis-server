import { Router } from "express";

import { addItem, getInventory } from "../controllers/operations.controller";

const router = Router();

router.post("/market/buy", addItem);
router.get("/inventory/get", getInventory);

export default router;
