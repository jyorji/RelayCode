# Relay — Project Setup Instructions for Claude Code

> Run these instructions with Claude Code from your WSL Ubuntu terminal.
> Claude Code will create the full folder structure, config files, and install all dependencies.

---

## PHASE 1 — Project Bootstrap

> From here, you can paste everything into Claude Code and let it run.
> Start Claude Code with: `claude` in your WSL terminal inside the relay folder.

### 1.1 — Create the monorepo root

```bash
mkdir -p ~/relay && cd ~/relay
git init
```

Create `package.json`:

```json
{
  "name": "relay",
  "private": true,
  "workspaces": [
    "apps/web",
    "apps/api"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=apps/web\" \"npm run dev --workspace=apps/api\"",
    "build": "npm run build --workspace=apps/web && npm run build --workspace=apps/api"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

---

## PHASE 2 — Folder Structure

```bash
mkdir -p apps/web/app/\(auth\)/login
mkdir -p apps/web/app/\(auth\)/register
mkdir -p apps/web/app/dashboard
mkdir -p "apps/web/app/session/[id]"
mkdir -p "apps/web/app/replay/[id]"
mkdir -p apps/web/components/Editor
mkdir -p apps/web/components/Console
mkdir -p apps/web/components/ProblemPanel
mkdir -p apps/web/components/Toolbar
mkdir -p apps/web/components/Presence
mkdir -p apps/web/lib
mkdir -p apps/web/types
mkdir -p apps/web/public

mkdir -p apps/api/src/routes
mkdir -p apps/api/src/socket
mkdir -p apps/api/src/workers
mkdir -p apps/api/src/lib
mkdir -p apps/api/src/middleware
mkdir -p apps/api/src/types
mkdir -p apps/api/prisma/migrations
mkdir -p apps/api/prisma/seed

mkdir -p infra/ecs
mkdir -p infra/rds
```

---

## PHASE 3 — Next.js Web App

```bash
cd ~/relay/apps/web
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-git
```

### Web dependencies

```bash
# Editor + real-time sync
npm install @monaco-editor/react yjs y-websocket

# Auth
npm install next-auth@beta

# State management
npm install @reduxjs/toolkit react-redux

# WebSocket client
npm install socket.io-client

# UI utilities
npm install lucide-react clsx tailwind-merge

# Data fetching
npm install @tanstack/react-query axios

# Utilities
npm install date-fns
```

### Web dev dependencies

```bash
npm install -D @types/node @types/react @types/react-dom
```

---

## PHASE 4 — Node/Express API

```bash
cd ~/relay/apps/api
npm init -y
```

Update `apps/api/package.json` to include these scripts:

```json
{
  "name": "@relay/api",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed/index.ts",
    "db:studio": "prisma studio"
  }
}
```

### API dependencies

```bash
# Server
npm install express cors helmet dotenv

# WebSocket
npm install socket.io

# Message queue
npm install amqplib

# ORM
npm install @prisma/client prisma

# Auth
npm install jsonwebtoken bcryptjs

# HTTP client (for Judge0)
npm install axios

# Validation
npm install zod

# Logging
npm install pino pino-pretty
```

### API dev dependencies

```bash
npm install -D \
  typescript \
  tsx \
  @types/express \
  @types/node \
  @types/cors \
  @types/amqplib \
  @types/jsonwebtoken \
  @types/bcryptjs \
  ts-node
```

---

## PHASE 5 — Prisma Setup

```bash
cd ~/relay/apps/api
npx prisma init --datasource-provider postgresql
```

Replace `apps/api/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  name      String?
  password  String?
  role      Role      @default(INTERVIEWER)
  sessions  Session[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Session {
  id          String         @id @default(cuid())
  title       String
  userId      String
  user        User           @relation(fields: [userId], references: [id])
  status      SessionStatus  @default(WAITING)
  language    String         @default("javascript")
  problemId   String?
  problem     Problem?       @relation(fields: [problemId], references: [id])
  events      SessionEvent[]
  notes       String?
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model SessionEvent {
  id        String    @id @default(cuid())
  sessionId String
  session   Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      EventType
  payload   Json
  offsetMs  Int
  createdAt DateTime  @default(now())

  @@index([sessionId, offsetMs])
}

model Problem {
  id          String     @id @default(cuid())
  title       String
  description String
  starterCode Json
  testCases   Json
  difficulty  Difficulty
  tags        String[]
  sessions    Session[]
  createdAt   DateTime   @default(now())
}

enum Role          { INTERVIEWER CANDIDATE }
enum SessionStatus { WAITING ACTIVE ENDED }
enum Difficulty    { EASY MEDIUM HARD }
enum EventType     { KEYSTROKE CODE_RUN STATUS_CHANGE COMMENT CURSOR LANGUAGE_CHANGE }
```

---

## PHASE 6 — TypeScript Config for API

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "prisma/seed/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## PHASE 7 — Environment Files

Create `apps/web/.env.local`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here-change-in-production
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

Create `apps/api/.env`:

```env
DATABASE_URL=postgresql://relay:relay@localhost:5432/relay_db
RABBITMQ_URL=amqp://relay:relay@localhost:5672
JUDGE0_URL=http://localhost:2358
JWT_SECRET=your-jwt-secret-change-in-production
PORT=4000
NODE_ENV=development
```

---

## PHASE 8 — Docker Compose

Create `docker-compose.yml` in `~/relay`:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: relay_postgres
    environment:
      POSTGRES_USER: relay
      POSTGRES_PASSWORD: relay
      POSTGRES_DB: relay_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U relay -d relay_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: relay_rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: relay
      RABBITMQ_DEFAULT_PASS: relay
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  judge0:
    image: judge0/judge0:1.13.1
    container_name: relay_judge0
    ports:
      - "2358:2358"
    privileged: true
    environment:
      REDIS_HOST: judge0_redis
      POSTGRES_HOST: judge0_postgres
      POSTGRES_DB: judge0
      POSTGRES_USER: judge0
      POSTGRES_PASSWORD: judge0
    depends_on:
      - judge0_postgres
      - judge0_redis

  judge0_postgres:
    image: postgres:13-alpine
    container_name: relay_judge0_postgres
    environment:
      POSTGRES_DB: judge0
      POSTGRES_USER: judge0
      POSTGRES_PASSWORD: judge0
    volumes:
      - judge0_postgres_data:/var/lib/postgresql/data

  judge0_redis:
    image: redis:7-alpine
    container_name: relay_judge0_redis

volumes:
  postgres_data:
  rabbitmq_data:
  judge0_postgres_data:
```

---

## PHASE 9 — API Entry Point

Create `apps/api/src/index.ts`:

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

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

// Routes (wire these up as you build them)
// app.use("/api/sessions", sessionRoutes);
// app.use("/api/problems", problemRoutes);
// app.use("/api/auth", authRoutes);

// Socket.IO (wire up as you build)
// registerSessionRoom(io);

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
```

---

## PHASE 10 — Root .gitignore

Create `.gitignore` in `~/relay`:

```
node_modules/
.pnp
.pnp.js
.next/
dist/
build/
out/
.env
.env.local
.env.*.local
apps/api/prisma/migrations/*.sql
*.log
npm-debug.log*
.DS_Store
Thumbs.db
.vscode/
.idea/
*.swp
*.override.yml
```

---

## PHASE 11 — Install Root Dependencies

```bash
cd ~/relay
npm install
```

---

## PHASE 12 — Start Everything

Open 4 WSL terminals (or use VS Code integrated terminal tabs):

```bash
# Terminal 1 — start Docker infrastructure
cd ~/relay
sudo service docker start
docker compose up -d

# Terminal 2 — run DB migration (wait for postgres to be healthy first)
cd ~/relay/apps/api
npx prisma migrate dev --name init

# Terminal 3 — start API
cd ~/relay/apps/api
npm run dev

# Terminal 4 — start web
cd ~/relay/apps/web
npm run dev
```

---

## Verify Everything Is Running

| Service | URL | Credentials |
|---|---|---|
| Next.js web | http://localhost:3000 | — |
| Express API | http://localhost:4000 | — |
| RabbitMQ UI | http://localhost:15672 | relay / relay |
| Judge0 | http://localhost:2358 | — |
| Prisma Studio | run `npm run db:studio` in apps/api | — |

---

## What to Build Next (in order)

1. `apps/api/src/routes/sessions.ts` — CRUD for sessions
2. `apps/api/src/routes/problems.ts` — problem library
3. `apps/api/src/socket/sessionRoom.ts` — Socket.IO room logic
4. `apps/web/components/Editor/index.tsx` — Monaco + Yjs
5. `apps/api/src/workers/executionWorker.ts` — RabbitMQ → Judge0
6. Session event recording
7. Replay scrubber UI
8. Auth (NextAuth)
9. Dashboard UI
10. AWS deployment
