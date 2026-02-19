import TelegramBot from "node-telegram-bot-api";

import { AuthService } from "../service/auth.service";

const authService = new AuthService();

export const botHandlers = (bot: TelegramBot) => {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      // 1. ОБЯЗАТЕЛЬНО добавляем await
      const user = await authService.register(
        msg.from!.id,
        msg.from!.first_name,
        msg.from?.language_code || "en",
        msg.from?.username,
      );

      console.log("Пользователь зарегистрирован:", user);
    } catch (error) {
      // 2. Ловим ошибку "User already exists" и не даем ей уронить сервер
      console.log("Регистрация пропущена:", error.message);
    }

    // 3. Сообщение отправляем в любом случае (даже если юзер уже есть)
    bot.sendMessage(chatId, "Добро пожаловать в NOXIS!", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Играть",
              web_app: { url: "https://noxis-frontend.onrender.com/" },
            },
          ],
        ],
      },
    });
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Правила игры:\n1. Ешь планктон.\n2. Делись, чтобы атаковать.\n3. Стань самым большим!",
    );
  });

  bot.onText(/\/data/, (msg) => {
    console.log(msg.from);
    bot.sendMessage(msg.chat.id, `data ${msg}`);
  });

  bot.on("message", (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      bot.sendMessage(
        msg.chat.id,
        `Вы написали: "${msg.text}". Используйте меню для игры.`,
      );
    }
  });

  // Обработка ошибок
  bot.on("polling_error", (err) => console.log("Bot error:", err));
};
