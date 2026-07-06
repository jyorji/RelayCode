import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

import sessionRoutes from "./routes/sessions";
import problemRoutes from "./routes/problems";
import { registerSessionRoom } from "./socket/sessionRoom";
import { attachYjsServer } from "./socket/yjsServer";
import { startExecutionWorker } from "./workers/executionWorker";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const REQUIRED_ENV = ["CLIENT_ORIGIN", "JWT_SECRET", "DATABASE_URL", "RABBITMQ_URL", "JUDGE0_URL", "REDIS_URL"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN!;
const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.use("/api/sessions", sessionRoutes);
app.use("/api/problems", problemRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

(async () => {
  const pub = createClient({ url: process.env.REDIS_URL });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);

  io.adapter(createAdapter(pub, sub));

  registerSessionRoom(io);
  startExecutionWorker(io);
  await attachYjsServer(httpServer, pub);

  httpServer.listen(PORT, () => console.log(`API running on port ${PORT}`));
})();
