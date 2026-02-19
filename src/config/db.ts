import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Market } from "../entities/Market";
import dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "dpg-d6anjqa48b3s73bee670-a",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "poster",
  password: process.env.DB_PASSWORD || "KbL31psgpgrcogXvzkgw85VX5dNlm3if",
  database: process.env.DB_NAME || "noxis",
  entities: [User, Market],
  synchronize: true,
  logging: true,
});

export const initDatabase = async () => {
  try {
    await AppDataSource.initialize();
    console.log("✅ База данных подключена");
  } catch (error) {
    console.error("❌ Ошибка при подключении к БД:", error);
    process.exit(1);
  }
};
