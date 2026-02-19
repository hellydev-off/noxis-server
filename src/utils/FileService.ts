import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";

export class FileService {
  static saveFile(file: any): string {
    try {
      // Генерируем расширение и уникальное имя
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `${uuidv4()}.${fileExtension}`;

      // Путь к папке со статикой (убедись, что папка существует)
      const filePath = path.resolve(__dirname, "..", "..", "static");

      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath, { recursive: true });
      }

      // Сохраняем файл на диск
      fs.writeFileSync(path.join(filePath, fileName), file.buffer);

      // Возвращаем путь, который будет доступен по ссылке
      return fileName;
    } catch (e) {
      console.error("Ошибка при сохранении файла:", e);
      throw new Error("Ошибка при записи файла на диск");
    }
  }
}
