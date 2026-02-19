import TelegramBot from "node-telegram-bot-api";
import { botHandlers } from "./bot.handlers";

export function initBot() {
  const BOT_TOKEN =
    process.env.BOT_TOKEN || "8191176053:AAHYnQnuGSob3eFJvSoP72bPWv4qE_t1sfc";
  // if (!BOT_TOKEN) {
  //   console.error("❌ BOT_TOKEN не найден в .env");
  //   return;
  // }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

  // ОБЯЗАТЕЛЬНО добавьте это:
  bot.on("polling_error", (error) => {
    console.error("⚠️ Ошибка бота (polling):", error.message);
  });

  botHandlers(bot);
  console.log("🤖 Telegram Bot инициализирован");
  return bot;
}
