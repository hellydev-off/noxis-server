import { Request, Response } from "express";
import { MarketService } from "../../service/admin/market.service";

const marketService = new MarketService();

interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

export const createItem = async (req: Request, res: Response) => {
  try {
    // 1. Проверяем, пришел ли файл
    if (!req.file) {
      return res.status(400).json({ error: "Изображение не загружено" });
    }

    // 2. Достаем текстовые данные из body
    const { title, type, rarity, price, data } = req.body;

    // 3. Передаем файл и данные в сервис.
    // Мы передаем именно объект файла (req.file),
    // а сервис сам решит, как его сохранить через FileService.
    const result = await marketService.createItem(
      title,
      type,
      rarity,
      req.file,
      price,
      data ? JSON.parse(data) : {}, // Если data пришла как строка, парсим её
    );

    res.status(201).json(result);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

export const getAllItems = async (req: Request, res: Response) => {
  const { type } = req.query;
  try {
    const items = await marketService.findAll(type);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
