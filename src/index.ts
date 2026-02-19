import "reflect-metadata";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { User } from "./entities/User";
import cors from "cors";
import dotenv from "dotenv";
import { initBot } from "./bot/bot.index";
import * as path from "path";
import { AppDataSource, initDatabase } from "./config/db";
import MarketRoute from "./routes/admin/market.route";
import OperationsRoute from "./routes/operations.route";
import AuthRoute from "./routes/auth.route";
import InventoryRoute from "./routes/inventory.route";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "noxis_premium_secret_key";

const TICK_RATE = 60;
const MAP_SIZE = 5000;

// Константы
const SPLIT_COOLDOWN = 2000;
const EJECT_COOLDOWN = 1000;
const SHIELD_DURATION = 5000;
const TURBO_DURATION = 3000;
const MIN_SPLIT_MASS = 200;
const MERGE_COOLDOWN = 10000;

// ADDED FOR BOOSTS
const SPIKE_COOLDOWN = 3000; // 3 секунды
const FREEZE_COOLDOWN = 5000; // 5 секунд
const FREEZE_DURATION = 3000; // 3 секунды заморозки
const SPIKE_SPEED = 800; // скорость снаряда
const FREEZE_RADIUS = 400; // радиус действия заморозки

const REPULSION_FORCE = 0.5;
const REPULSION_DISTANCE_FACTOR = 1.2;

interface Cell {
  id: string;
  ownerId: string;
  username: string;
  x: number;
  y: number;
  mass: number;
  angle: number;
  speedFactor: number;
  shieldUntil?: number;
  turboUntil?: number;
  mergeBlockedUntil?: number;
  skinUrl?: string;
  frozenUntil?: number; // ADDED
}

const cells = new Map<string, Cell>();

interface Spike {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}
const spikes = new Map<string, Spike>();

interface Cooldowns {
  lastSplit: number;
  lastEject: number;
  lastShield: number;
  lastTurbo: number;
  lastSpike: number; // ADDED
  lastFreeze: number; // ADDED
}
const playerCooldowns = new Map<string, Cooldowns>();

let pellets: { id: string; x: number; y: number; v: number }[] = [];

// --- Вспомогательные функции ---
function generateCellId(): string {
  return `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generatePelletId(): string {
  return `${Math.random().toString(36).substring(2)}${Date.now()}${Math.random().toString(36).substring(2)}`;
}

function generateSpikeId(): string {
  return `spike_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function massToRadius(m: number): number {
  if (m < 0) return 0;
  return Math.min(Math.max(Math.sqrt(m) * 1.8, 14), 450);
}

function pelletRadius(mass: number): number {
  return Math.min(Math.max(Math.sqrt(mass) * 2.5, 4), 18);
}

function getPlayerCells(ownerId: string): Cell[] {
  return Array.from(cells.values()).filter((c) => c.ownerId === ownerId);
}

function getCooldowns(ownerId: string): Cooldowns {
  if (!playerCooldowns.has(ownerId)) {
    playerCooldowns.set(ownerId, {
      lastSplit: 0,
      lastEject: 0,
      lastShield: 0,
      lastTurbo: 0,
      lastSpike: 0,
      lastFreeze: 0,
    });
  }
  return playerCooldowns.get(ownerId)!;
}

function initPellets(count: number = 500) {
  pellets = Array.from({ length: count }, () => ({
    id: generatePelletId(),
    x: Math.random() * MAP_SIZE - MAP_SIZE / 2,
    y: Math.random() * MAP_SIZE - MAP_SIZE / 2,
    v: Math.floor(Math.random() * 30) + 5,
  }));
}
initPellets();

const app = express();
app.use(express.json());
app.use(cors());
app.use("/static", express.static(path.join(process.cwd(), "static")));

app.use("/api", MarketRoute);
app.use("/api", OperationsRoute);
app.use("/api", AuthRoute);
app.use("/api", InventoryRoute);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// --- Health checks ---
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    db: AppDataSource.isInitialized ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({ message: "NOXIS API работает! /health для проверки" });
});

// --- Auth endpoints ---
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
  const { user_id } = req.body;
  const user = await AppDataSource.getRepository(User).findOneBy({ user_id });
  if (user) {
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    return res.json({ token, username: user.username });
  }
  res.status(401).json({ error: "Auth failed" });
});

// --- Socket.io middleware ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token"));

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return next(new Error("Authentication error: Invalid token"));
    (socket as any).userData = decoded;
    next();
  });
});

// --- Socket handlers ---
io.on("connection", (socket) => {
  const userData = (socket as any).userData;
  console.log(`User ${userData.username} (${socket.id}) connected`);

  let currentSkinUrl: string | undefined;
  // Временное хранилище количества бонусов для игрока (позже будет в БД)
  let bonusCounts = {
    spike: 3,
    freeze: 2,
  };

  socket.on("join-game", (data?: { skinUrl?: string }) => {
    const skinUrl = data?.skinUrl;
    currentSkinUrl = skinUrl;

    const existing = getPlayerCells(socket.id);
    if (existing.length === 0) {
      const cellId = generateCellId();
      cells.set(cellId, {
        id: cellId,
        ownerId: socket.id,
        username: userData.username,
        x: 0,
        y: 0,
        mass: 50,
        angle: 0,
        speedFactor: 0,
        skinUrl: skinUrl,
      });
    }
    socket.emit("init-world", { pellets, bonusCounts });
  });

  socket.on("move", (data: { angle: number; factor: number }) => {
    const playerCells = getPlayerCells(socket.id);
    playerCells.forEach((cell) => {
      cell.angle = data.angle;
      cell.speedFactor = Math.max(0, Math.min(1, data.factor));
    });
  });

  socket.on("action", (data: { type: string }) => {
    const now = Date.now();
    const cooldown = getCooldowns(socket.id);
    const playerCells = getPlayerCells(socket.id);
    if (playerCells.length === 0) return;

    const biggestCell = playerCells.reduce(
      (max, cell) => (cell.mass > max.mass ? cell : max),
      playerCells[0],
    );

    switch (data.type) {
      case "split": {
        if (now - cooldown.lastSplit < SPLIT_COOLDOWN) return;
        if (biggestCell.mass < MIN_SPLIT_MASS) return;

        const halfMass = biggestCell.mass / 2;
        biggestCell.mass = halfMass;

        const angleVariation = (Math.random() - 0.5) * 0.5;
        const splitAngle = biggestCell.angle + angleVariation;

        const r1 = massToRadius(biggestCell.mass);
        const r2 = massToRadius(halfMass);
        const minDist = r1 + r2 + 10;
        const newX = biggestCell.x + Math.cos(splitAngle) * minDist;
        const newY = biggestCell.y + Math.sin(splitAngle) * minDist;

        const newCellId = generateCellId();
        const mergeBlockedUntil = now + MERGE_COOLDOWN;
        cells.set(newCellId, {
          id: newCellId,
          ownerId: socket.id,
          username: biggestCell.username,
          x: newX,
          y: newY,
          mass: halfMass,
          angle: splitAngle,
          speedFactor: biggestCell.speedFactor,
          shieldUntil: biggestCell.shieldUntil,
          turboUntil: biggestCell.turboUntil,
          frozenUntil: biggestCell.frozenUntil,
          mergeBlockedUntil,
          skinUrl: biggestCell.skinUrl,
        });
        biggestCell.mergeBlockedUntil = mergeBlockedUntil;

        cooldown.lastSplit = now;
        break;
      }

      case "eject": {
        if (now - cooldown.lastEject < EJECT_COOLDOWN) return;
        const ejectMass = Math.min(10, biggestCell.mass * 0.1);
        if (ejectMass < 1) return;

        biggestCell.mass -= ejectMass;

        const angle = biggestCell.angle;
        pellets.push({
          id: generatePelletId(),
          x: biggestCell.x + Math.cos(angle) * 25,
          y: biggestCell.y + Math.sin(angle) * 25,
          v: ejectMass,
        });

        cooldown.lastEject = now;
        break;
      }

      case "shield": {
        if (now - cooldown.lastShield < SHIELD_DURATION) return;
        playerCells.forEach((cell) => {
          cell.shieldUntil = now + SHIELD_DURATION;
        });
        cooldown.lastShield = now;
        break;
      }

      case "turbo": {
        if (now - cooldown.lastTurbo < TURBO_DURATION) return;
        playerCells.forEach((cell) => {
          cell.turboUntil = now + TURBO_DURATION;
        });
        cooldown.lastTurbo = now;
        break;
      }

      case "spike": {
        if (now - cooldown.lastSpike < SPIKE_COOLDOWN) return;
        if (playerCells.length === 0) return;
        if (bonusCounts.spike <= 0) {
          socket.emit("error", { message: "No spikes left" });
          return;
        }

        const sourceCell = biggestCell;

        const spikeId = generateSpikeId();
        const angle = sourceCell.angle;
        const speed = SPIKE_SPEED;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        spikes.set(spikeId, {
          id: spikeId,
          ownerId: socket.id,
          x: sourceCell.x,
          y: sourceCell.y,
          vx,
          vy,
          active: true,
        });

        bonusCounts.spike--;
        cooldown.lastSpike = now;
        socket.emit("bonus-update", bonusCounts); // отправляем обновлённые количества
        break;
      }

      case "freeze": {
        if (now - cooldown.lastFreeze < FREEZE_COOLDOWN) return;
        if (playerCells.length === 0) return;
        if (bonusCounts.freeze <= 0) {
          socket.emit("error", { message: "No freezes left" });
          return;
        }

        const freezeUntil = now + FREEZE_DURATION;
        playerCells.forEach((myCell) => {
          cells.forEach((cell) => {
            if (cell.ownerId !== socket.id) {
              const dist = Math.hypot(cell.x - myCell.x, cell.y - myCell.y);
              if (dist < FREEZE_RADIUS) {
                cell.frozenUntil = freezeUntil;
              }
            }
          });
        });

        bonusCounts.freeze--;
        cooldown.lastFreeze = now;
        socket.emit("bonus-update", bonusCounts);
        break;
      }
    }
  });

  socket.on("eat-pellet", (data, callback) => {
    const playerCells = getPlayerCells(socket.id);
    if (playerCells.length === 0) {
      return callback?.({ success: false, reason: "no_cells" });
    }

    let closestCell: Cell | null = null;
    let minDist = Infinity;
    for (const cell of playerCells) {
      const dist = Math.hypot(cell.x - data.pelletX, cell.y - data.pelletY);
      if (dist < minDist) {
        minDist = dist;
        closestCell = cell;
      }
    }
    if (!closestCell) return callback?.({ success: false });

    const pelletIndex = pellets.findIndex((p) => p.id === data.pelletId);
    if (pelletIndex === -1) {
      return callback?.({ success: false, reason: "pellet_not_found" });
    }

    const pellet = pellets[pelletIndex];
    const eatDist = massToRadius(closestCell.mass) + pelletRadius(pellet.v);
    if (minDist > eatDist + 10) {
      return callback?.({ success: false, reason: "too_far" });
    }

    closestCell.mass += pellet.v;
    pellets.splice(pelletIndex, 1);
    pellets.push({
      id: generatePelletId(),
      x: Math.random() * MAP_SIZE - MAP_SIZE / 2,
      y: Math.random() * MAP_SIZE - MAP_SIZE / 2,
      v: Math.floor(Math.random() * 30) + 5,
    });

    callback?.({ success: true });
  });

  socket.on("respawn", () => {
    if (getPlayerCells(socket.id).length === 0) {
      const cellId = generateCellId();
      cells.set(cellId, {
        id: cellId,
        ownerId: socket.id,
        username: userData.username,
        x: 0,
        y: 0,
        mass: 50,
        angle: 0,
        speedFactor: 0,
        skinUrl: currentSkinUrl,
      });
      // Сброс бонусов при респавне (позже брать из БД)
      bonusCounts = { spike: 3, freeze: 2 };
      socket.emit("init-world", { pellets, bonusCounts });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected`);
    const playerCells = getPlayerCells(socket.id);
    playerCells.forEach((cell) => cells.delete(cell.id));
    playerCooldowns.delete(socket.id);
    spikes.forEach((spike, spikeId) => {
      if (spike.ownerId === socket.id) spikes.delete(spikeId);
    });
  });
});

// --- Игровой цикл ---
const FIXED_DT = 1 / TICK_RATE;
const MASS_THRESHOLD = 1000;
const SPEED_AT_THRESHOLD = 700;

setInterval(() => {
  const now = Date.now();

  // 1. Движение с учётом speedFactor и frozen
  cells.forEach((cell) => {
    if (cell.frozenUntil && cell.frozenUntil > now) {
      return;
    }

    let baseSpeed = SPEED_AT_THRESHOLD;
    if (cell.mass > MASS_THRESHOLD) {
      baseSpeed = SPEED_AT_THRESHOLD * Math.sqrt(MASS_THRESHOLD / cell.mass);
    }
    if (cell.turboUntil && cell.turboUntil > now) {
      baseSpeed *= 1.5;
    }

    const effectiveSpeed = baseSpeed * cell.speedFactor;

    const vx = Math.cos(cell.angle) * effectiveSpeed;
    const vy = Math.sin(cell.angle) * effectiveSpeed;
    cell.x += vx * FIXED_DT;
    cell.y += vy * FIXED_DT;

    const half = MAP_SIZE / 2;
    const dist = Math.hypot(cell.x, cell.y);
    if (dist > half) {
      const angle = Math.atan2(cell.y, cell.x);
      cell.x = Math.cos(angle) * half;
      cell.y = Math.sin(angle) * half;
    }
  });

  // 2. Отталкивание
  const playerCellsMap = new Map<string, Cell[]>();
  cells.forEach((cell) => {
    if (!playerCellsMap.has(cell.ownerId)) playerCellsMap.set(cell.ownerId, []);
    playerCellsMap.get(cell.ownerId)!.push(cell);
  });

  for (const [ownerId, cellList] of playerCellsMap) {
    for (let i = 0; i < cellList.length; i++) {
      for (let j = i + 1; j < cellList.length; j++) {
        const a = cellList[i];
        const b = cellList[j];
        if (!cells.has(a.id) || !cells.has(b.id)) continue;

        const r1 = massToRadius(a.mass);
        const r2 = massToRadius(b.mass);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        const minDist = (r1 + r2) * REPULSION_DISTANCE_FACTOR;

        if (dist < minDist && dist > 0) {
          const force = REPULSION_FORCE * (1 - dist / minDist) * FIXED_DT * 10;
          const angle = Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * force;
          const pushY = Math.sin(angle) * force;
          a.x += pushX;
          a.y += pushY;
          b.x -= pushX;
          b.y -= pushY;
        }
      }
    }
  }

  // 3. Движение снарядов и проверка попаданий (разделение)
  spikes.forEach((spike, spikeId) => {
    if (!spike.active) {
      spikes.delete(spikeId);
      return;
    }

    spike.x += spike.vx * FIXED_DT;
    spike.y += spike.vy * FIXED_DT;

    const half = MAP_SIZE / 2;
    if (Math.abs(spike.x) > half || Math.abs(spike.y) > half) {
      spikes.delete(spikeId);
      return;
    }

    cells.forEach((cell) => {
      if (cell.ownerId === spike.ownerId) return;
      const r = massToRadius(cell.mass);
      const dist = Math.hypot(cell.x - spike.x, cell.y - spike.y);
      if (dist < r) {
        // Попадание: разделяем клетку, если она достаточно большая
        if (
          cell.mass >= MIN_SPLIT_MASS &&
          !(cell.shieldUntil && cell.shieldUntil > now)
        ) {
          const halfMass = cell.mass / 2;
          cell.mass = halfMass;

          // Угол разделения: в направлении полёта шипа + небольшой разброс
          const splitAngle =
            Math.atan2(spike.vy, spike.vx) + (Math.random() - 0.5) * 0.5;
          const r1 = massToRadius(cell.mass);
          const r2 = massToRadius(halfMass);
          const minDist = r1 + r2 + 10;
          const newX = cell.x + Math.cos(splitAngle) * minDist;
          const newY = cell.y + Math.sin(splitAngle) * minDist;

          const newCellId = generateCellId();
          cells.set(newCellId, {
            id: newCellId,
            ownerId: cell.ownerId,
            username: cell.username,
            x: newX,
            y: newY,
            mass: halfMass,
            angle: splitAngle,
            speedFactor: cell.speedFactor,
            shieldUntil: cell.shieldUntil,
            turboUntil: cell.turboUntil,
            frozenUntil: cell.frozenUntil,
            mergeBlockedUntil: now + MERGE_COOLDOWN,
            skinUrl: cell.skinUrl,
          });
        } else {
          // Если слишком маленькая или под щитом, просто уменьшаем
          cell.mass = Math.max(10, cell.mass - 20);
        }

        spikes.delete(spikeId);
        io.emit("spike-hit", {
          spikeId,
          targetId: cell.id,
          x: spike.x,
          y: spike.y,
        });
      }
    });
  });

  // 4. Поедание чужих клеток
  const cellList = Array.from(cells.values());
  for (let i = 0; i < cellList.length; i++) {
    const a = cellList[i];
    if (!cells.has(a.id)) continue;
    for (let j = i + 1; j < cellList.length; j++) {
      const b = cellList[j];
      if (!cells.has(b.id)) continue;
      if (a.ownerId === b.ownerId) continue;

      const r1 = massToRadius(a.mass);
      const r2 = massToRadius(b.mass);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);

      if (a.mass > b.mass && dist < r1) {
        if (a.shieldUntil && a.shieldUntil > now) continue;
        if (b.shieldUntil && b.shieldUntil > now) continue;

        a.mass += b.mass;
        cells.delete(b.id);
        io.to(b.ownerId).emit("cell-destroyed", {
          cellId: b.id,
          reason: "eaten",
          by: a.ownerId,
        });
        if (getPlayerCells(b.ownerId).length === 0) {
          io.to(b.ownerId).emit("game-over", {
            reason: "eaten",
            by: a.username,
          });
        }
      } else if (b.mass > a.mass && dist < r2) {
        if (b.shieldUntil && b.shieldUntil > now) continue;
        if (a.shieldUntil && a.shieldUntil > now) continue;

        b.mass += a.mass;
        cells.delete(a.id);
        io.to(a.ownerId).emit("cell-destroyed", {
          cellId: a.id,
          reason: "eaten",
          by: b.ownerId,
        });
        if (getPlayerCells(a.ownerId).length === 0) {
          io.to(a.ownerId).emit("game-over", {
            reason: "eaten",
            by: b.username,
          });
        }
      }
    }
  }

  // 5. Слияние своих клеток
  playerCellsMap.clear();
  cells.forEach((cell) => {
    if (!playerCellsMap.has(cell.ownerId)) playerCellsMap.set(cell.ownerId, []);
    playerCellsMap.get(cell.ownerId)!.push(cell);
  });

  for (const [ownerId, cellList] of playerCellsMap) {
    if (cellList.length < 2) continue;
    for (let i = 0; i < cellList.length; i++) {
      for (let j = i + 1; j < cellList.length; j++) {
        const a = cellList[i];
        const b = cellList[j];
        if (!cells.has(a.id) || !cells.has(b.id)) continue;

        const r1 = massToRadius(a.mass);
        const r2 = massToRadius(b.mass);
        const dist = Math.hypot(a.x - b.x, a.y - b.y);

        if (dist < r1 + r2) {
          if (
            (a.mergeBlockedUntil && a.mergeBlockedUntil > now) ||
            (b.mergeBlockedUntil && b.mergeBlockedUntil > now)
          ) {
            continue;
          }

          a.mass += b.mass;
          cells.delete(b.id);
          io.to(ownerId).emit("cell-destroyed", {
            cellId: b.id,
            reason: "merged",
          });
          break;
        }
      }
    }
  }

  // 6. Отправка состояния
  io.emit("world_update", {
    cells: Array.from(cells.values()),
    pellets: pellets,
    spikes: Array.from(spikes.values()),
  });
}, 1000 / TICK_RATE);

// --- Запуск сервера ---
const port = process.env.PORT || 3000;
async function startServer() {
  try {
    await initDatabase();
    console.log("✅ База данных подключена");

    initBot();

    httpServer.listen(port, () => {
      console.log(`🚀 Сервер запущен на порту ${port}`);
    });
  } catch (error) {
    console.error("❌ Ошибка при запуске сервера:", error);
    process.exit(1);
  }
}
startServer();
