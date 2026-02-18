import "reflect-metadata";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { DataSource } from "typeorm";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { User } from "./entities/User";
import cors from "cors";

import TelegramBot from "node-telegram-bot-api";
const BOT_TOKEN = "8191176053:AAHYnQnuGSob3eFJvSoP72bPWv4qE_t1sfc";

const JWT_SECRET = process.env.JWT_SECRET || "noxis_premium_secret_key";

const TICK_RATE = 60;
const MAP_SIZE = 5000;

interface GamePlayer {
  id: string;
  dbId: string;
  username: string;
  x: number;
  y: number;
  mass: number;
  angle: number;
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// /start — отправляем кнопку, которая открывает мини‑приложение
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    "Добро пожаловать в NOXIS!\n\nНажми кнопку ниже, чтобы запустить игру.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Играть в NOXIS",
              web_app: { url: "https://noxis-frontend.onrender.com/" }, // замени на реальный URL мини‑аппа
            },
          ],
        ],
      },
    },
  );
});

const players = new Map<string, GamePlayer>();

function massToRadius(m: number): number {
  if (m < 0) return 0;
  return Math.min(Math.max(Math.sqrt(m) * 1.8, 14), 450);
}

function pelletRadius(mass: number): number {
  return Math.min(Math.max(Math.sqrt(mass) * 2.5, 4), 18);
}

function generatePelletId(): string {
  return `${Math.random().toString(36).substring(2)}${Date.now()}${Math.random().toString(36).substring(2)}`;
}

let pellets = Array.from({ length: 500 }, () => ({
  id: generatePelletId(),
  x: Math.random() * MAP_SIZE - MAP_SIZE / 2,
  y: Math.random() * MAP_SIZE - MAP_SIZE / 2,
  v: Math.floor(Math.random() * 30) + 5,
}));

const AppDataSource = new DataSource({
  type: "postgres",
  // 1. Используем URL из переменных окружения Render, если он есть,
  // иначе собираем из данных со скриншота
  url: process.env.DATABASE_URL,

  // Данные из вашего скриншота (для локальной отладки или если нет URL)
  host: process.env.DB_HOST || "dpg-d6anjqa48b3s73bee670-a",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "poster",
  password: process.env.DB_PASSWORD || "KbL31psgpgrcogXvzkgw85VX5dNlm3if",
  database: process.env.DB_NAME || "noxis",

  // 2. Сущности
  entities: [User],

  // 3. Синхронизация (создаст таблицу User при запуске)
  synchronize: true,
  logging: true,

  // 4. КРИТИЧНО ДЛЯ RENDER: Настройка SSL
  ssl: {
    rejectUnauthorized: false,
  },
});

const app = express();
app.use(express.json());
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

let dbInitialized = true;

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    db: dbInitialized ? "connected" : "not_required",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({ message: "NOXIS API работает! /health для проверки" });
});

// Auth endpoints
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  const repo = AppDataSource.getRepository(User);
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await repo.save(repo.create({ username, password: hashedPassword }));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "User exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await AppDataSource.getRepository(User).findOneBy({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    return res.json({ token, username: user.username });
  }
  res.status(401).json({ error: "Auth failed" });
});

async function initDB() {
  if (!dbInitialized) {
    try {
      console.log("Подключение к БД...");
      await AppDataSource.initialize();
      dbInitialized = true;
      console.log("✅ БД подключена");
    } catch (error) {
      console.error("❌ Ошибка БД:", error);
      dbInitialized = false;
    }
  }
  return dbInitialized;
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token"));

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return next(new Error("Authentication error: Invalid token"));
    (socket as any).userData = decoded;
    next();
  });
});

io.on("connection", (socket) => {
  const userData = (socket as any).userData;
  console.log(`User ${userData.username} connected`);

  socket.on("join-game", () => {
    players.set(socket.id, {
      id: socket.id,
      dbId: userData.id,
      username: userData.username,
      x: 0,
      y: 0,
      mass: 50,
      angle: 0,
    });
    socket.emit("init-world", { pellets });
  });

  socket.on("move", (data: { angle: number }) => {
    const p = players.get(socket.id);
    if (p) p.angle = data.angle;
  });

  socket.on(
    "eat-pellet",
    (
      data: {
        pelletId: string;
        playerX: number;
        playerY: number;
        pelletX: number;
        pelletY: number;
      },
      callback,
    ) => {
      console.log(
        `Received eat-pellet for ${data.pelletId} at player (${data.playerX.toFixed(1)}, ${data.playerY.toFixed(1)}) pellet (${data.pelletX.toFixed(1)}, ${data.pelletY.toFixed(1)})`,
      );

      const player = players.get(socket.id);
      if (!player) {
        return callback?.({ success: false, reason: "player_not_found" });
      }

      const pelletIndex = pellets.findIndex((p) => p.id === data.pelletId);
      if (pelletIndex === -1) {
        return callback?.({ success: false, reason: "pellet_not_found" });
      }

      const pellet = pellets[pelletIndex];

      const distPlayerToPellet = Math.hypot(
        data.playerX - data.pelletX,
        data.playerY - data.pelletY,
      );
      const eatDist = massToRadius(player.mass) + pelletRadius(pellet.v);
      const BUFFER = 10;
      if (distPlayerToPellet > eatDist + BUFFER) {
        console.log(
          `Distance too large: ${distPlayerToPellet.toFixed(1)} > ${(eatDist + BUFFER).toFixed(1)}`,
        );
        return callback?.({ success: false, reason: "too_far" });
      }

      const distServerToClientPellet = Math.hypot(
        pellet.x - data.pelletX,
        pellet.y - data.pelletY,
      );
      const MAX_DEVIATION = 150;
      if (distServerToClientPellet > MAX_DEVIATION) {
        console.log(
          `Pellet deviation too large: ${distServerToClientPellet.toFixed(1)} > ${MAX_DEVIATION}`,
        );
        return callback?.({ success: false, reason: "pellet_deviation" });
      }

      player.mass += pellet.v;
      pellets.splice(pelletIndex, 1);

      pellets.push({
        id: generatePelletId(),
        x: Math.random() * MAP_SIZE - MAP_SIZE / 2,
        y: Math.random() * MAP_SIZE - MAP_SIZE / 2,
        v: Math.floor(Math.random() * 30) + 5,
      });

      console.log(`Pellet eaten, new mass: ${player.mass}`);
      callback?.({ success: true });
    },
  );

  // Новый обработчик для респавна
  socket.on("respawn", () => {
    // Если игрок уже есть в игре, не создаём нового (можно добавить проверку)
    if (!players.has(socket.id)) {
      players.set(socket.id, {
        id: socket.id,
        dbId: userData.id,
        username: userData.username,
        x: 0,
        y: 0,
        mass: 50,
        angle: 0,
      });
      socket.emit("init-world", { pellets }); // повторно отправить мир
    }
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
  });
});

// Функция проверки поедания игроков
function checkPlayerCollisions() {
  const playerList = Array.from(players.values());
  playerList.sort((a, b) => b.mass - a.mass);

  for (let i = 0; i < playerList.length; i++) {
    const p1 = playerList[i];
    if (!players.has(p1.id)) continue;
    const r1 = massToRadius(p1.mass);
    for (let j = i + 1; j < playerList.length; j++) {
      const p2 = playerList[j];
      if (!players.has(p2.id)) continue;
      const r2 = massToRadius(p2.mass);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (p1.mass > p2.mass && dist < r1) {
        p1.mass += p2.mass;
        players.delete(p2.id);
        io.to(p2.id).emit("game-over", { reason: "eaten", by: p1.username });
        playerList.splice(j, 1);
        j--;
      } else if (p2.mass > p1.mass && dist < r2) {
        p2.mass += p1.mass;
        players.delete(p1.id);
        io.to(p1.id).emit("game-over", { reason: "eaten", by: p2.username });
        playerList.splice(i, 1);
        i--;
        break;
      }
    }
  }
}

const MASS_THRESHOLD = 1000;
const SPEED_AT_THRESHOLD = 700;

// Game loop
const FIXED_DT = 1 / TICK_RATE;

setInterval(() => {
  // Обновление позиций игроков
  players.forEach((p) => {
    let speed = 1000;
    if (p.mass <= MASS_THRESHOLD) {
      speed = SPEED_AT_THRESHOLD;
    } else {
      speed = SPEED_AT_THRESHOLD * Math.sqrt(MASS_THRESHOLD / p.mass);
    }
    const vx = Math.cos(p.angle) * speed;
    const vy = Math.sin(p.angle) * speed;
    p.x += vx * FIXED_DT;
    p.y += vy * FIXED_DT;

    const half = MAP_SIZE / 2;
    if (p.x > half) p.x = half;
    if (p.x < -half) p.x = -half;
    if (p.y > half) p.y = half;
    if (p.y < -half) p.y = -half;
  });

  // Проверка поедания игроков
  checkPlayerCollisions();

  // Отправка состояния всем
  io.emit("world_update", {
    players: Array.from(players.values()),
    pellets: pellets,
  });
}, 1000 / TICK_RATE);

const port = process.env.PORT || 3000;
async function startServer() {
  try {
    console.log("Подключение к базе данных...");
    await AppDataSource.initialize();
    console.log("✅ База данных подключена, таблицы проверены/созданы");

    httpServer.listen(port, () => {
      console.log(`🚀 Сервер запущен на порту ${port}`);
    });
  } catch (error) {
    console.error("❌ Ошибка при старте сервера:", error);
    process.exit(1); // Останавливаем процесс, если БД не доступна
  }
}

startServer();
