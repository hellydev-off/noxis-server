import { Request, Response } from "express";
import { UserInventoryService } from "../service/inventory.service";

const userInventoryService = new UserInventoryService();

export const selectSkin = async (req: Request, res: Response) => {
  try {
    const { itemData, userId } = req.body;

    console.log(itemData);
    console.log(userId);

    const result = await userInventoryService.selectSkin(userId, itemData);

    res.status(201).json(result);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

export const getInventory = async (req: Request, res: Response) => {
  const { user_id } = req.query;
  try {
    const items = await operationsService.getUserInventory(user_id);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
