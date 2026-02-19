import { Request, Response } from "express";
import { OperationsService } from "../service/operations.service";

const operationsService = new OperationsService();

export const addItem = async (req: Request, res: Response) => {
  try {
    const { itemData, user_id } = req.body;

    const result = await operationsService.addItemToInventory(
      user_id,
      itemData,
    );

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
