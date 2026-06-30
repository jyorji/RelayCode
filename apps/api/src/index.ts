import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";

import sessionRoutes from "./routes/sessions";
import problemRoutes from "./routes/problems";
import { registerSessionRoom } from "./socket/sessionRoom";
import { attachYjsServer } from "./socket/yjsServer";
import { startExecutionWorker } from "./workers/executionWorker";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/sessions", sessionRoutes);
app.use("/api/problems", problemRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

registerSessionRoom(io);
startExecutionWorker(io);
attachYjsServer(httpServer);

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
