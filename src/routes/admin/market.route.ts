import { Router } from "express";
import multer from "multer"; // Импортируем multer
import {
  createItem,
  getAllItems,
} from "../../controllers/admin/market.controller";

const router = Router();

// Настраиваем временное хранилище (в оперативной памяти)
const upload = multer({ storage: multer.memoryStorage() });

// Добавляем upload.single('image')
// 'image' — это то же самое имя, которое ты указал в Vue (formData.append('image', ...))
router.post("/admin/market/create", upload.single("image"), createItem);
router.get("/market/all", getAllItems);

export default router;
