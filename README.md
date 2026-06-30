# RelayCode

A real-time collaborative coding interview platform. Interviewers create sessions, share a link with candidates, and both parties code together in a synchronized Monaco editor — with live presence, in-session chat, and one-click code execution.

## Features

- **Collaborative editor** — Yjs CRDT keeps every participant's cursor and keystrokes in sync with no conflicts
- **Code execution** — runs submissions through a self-hosted Judge0 engine via a RabbitMQ worker queue; results stream back to all participants in real time
- **Multi-language support** — JavaScript, TypeScript, Python, Java, C++, C, Go, Ruby
- **Guest access** — share a relay-token link; candidates join without an account
- **Presence indicators** — see who is currently in the session with avatars
- **Session lifecycle** — sessions move through `WAITING → ACTIVE → ENDED` states; start/end timestamps are recorded automatically
- **Problem bank** — attach a problem (title, description, starter code, test cases, difficulty) to a session
- **Session events** — every code run, language change, status change, and comment is persisted with a millisecond offset for replay
- **Configurable sessions** — toggle autocomplete and language switching per session
- **Auth0 authentication** — social login supported out of the box

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Editor | Monaco Editor + Yjs (y-monaco, y-websocket) |
| Backend | Express 5, Socket.io, TypeScript |
| Auth | Auth0 (`@auth0/nextjs-auth0`) |
| Database | PostgreSQL + Prisma ORM |
| Queue | RabbitMQ (amqplib) |
| Code execution | Judge0 (self-hosted) |
| State | Zustand, TanStack React Query |

## Project Structure

```
relay/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   │   ├── app/      # App Router pages and API routes
│   │   ├── components/Editor/   # Collaborative Monaco editor
│   │   ├── lib/      # Auth0 client, Prisma client, token helpers
│   │   └── vendor/   # Vendored packages (forge-ui, y-monaco)
│   └── api/          # Express backend (port 4000)
│       ├── src/
│       │   ├── routes/      # REST: /api/sessions, /api/problems
│       │   ├── socket/      # Socket.io: session room + Yjs server
│       │   ├── workers/     # RabbitMQ execution worker
│       │   ├── lib/         # DB, queue, Judge0, session helpers
│       │   └── middleware/  # Auth, error handling
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
├── infra/
│   └── judge0/       # Custom Judge0 job override
├── docker-compose.yml
└── package.json      # Workspace root
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) and Docker Compose
- An [Auth0](https://auth0.com/) account (free tier is sufficient)

## Local Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/jyorji/RelayCode.git
cd RelayCode
npm install
```

### 2. Start infrastructure services

All three services can be started together or individually.

**Start everything at once**
```bash
docker compose up -d
```

**Start services individually**
```bash
# PostgreSQL only (port 5432)
docker compose up -d postgres

# RabbitMQ only (ports 5672 + 15672 for management UI)
docker compose up -d rabbitmq

# Judge0 only — also starts its own postgres and redis automatically
docker compose up -d judge0
```

**Other useful Docker commands**
```bash
# Check which containers are running and healthy
docker compose ps

# Stream logs for a specific service
docker compose logs -f postgres
docker compose logs -f rabbitmq
docker compose logs -f judge0

# Stop all services (keeps volume data)
docker compose down

# Stop all services and wipe all data
docker compose down -v
```

Ports at a glance:

| Service | Port |
|---|---|
| PostgreSQL (app DB) | 5432 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ Management UI | 15672 |
| Judge0 API | 2358 |

### 3. Configure environment variables

**`apps/api/.env`**
```env
DATABASE_URL=postgresql://relay:relay@localhost:5432/relay_db
RABBITMQ_URL=amqp://relay:relay@localhost:5672
JUDGE0_URL=http://localhost:2358
JWT_SECRET=your-jwt-secret
PORT=4000
```

**`apps/web/.env.local`**
```env
AUTH0_SECRET=your-auth0-secret
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<your-auth0-client-id>
AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
NEXT_PUBLIC_API_URL=http://localhost:4000
JWT_SECRET=your-jwt-secret
```

> `JWT_SECRET` must match in both apps — the API issues tokens and the web app verifies them when generating relay (guest) links.

### 4. Run database migrations

```bash
cd apps/api
npm run db:migrate
```

### 5. Start the development servers

From the repo root:

```bash
npm run dev
```

This concurrently starts:
- **Web** → http://localhost:3000
- **API** → http://localhost:4000

## Environment Variables Reference

### API (`apps/api/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `JUDGE0_URL` | Base URL of the Judge0 instance |
| `JWT_SECRET` | Secret used to sign and verify relay tokens |
| `PORT` | API server port (default: `4000`) |

### Web (`apps/web/.env.local`)

| Variable | Description |
|---|---|
| `AUTH0_SECRET` | Long random string used to encrypt the session cookie |
| `AUTH0_BASE_URL` | Public URL of the web app |
| `AUTH0_ISSUER_BASE_URL` | Your Auth0 domain, e.g. `https://dev-xxx.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret |
| `NEXT_PUBLIC_API_URL` | Base URL of the API (exposed to the browser) |
| `JWT_SECRET` | Must match the API's `JWT_SECRET` |

## How It Works

### Real-time collaboration

The collaborative editor is powered by [Yjs](https://yjs.dev/). The API runs a Yjs WebSocket server alongside the Socket.io server on the same HTTP port. When a participant joins a session, the browser syncs the Yjs document over WebSocket — changes are merged automatically using CRDT conflict resolution, so concurrent edits never conflict.

### Code execution flow

1. A participant clicks **Run** in the editor.
2. The browser emits a `code:run` Socket.io event to the API.
3. The API publishes the job to a RabbitMQ queue (`execution_queue`).
4. The execution worker consumes the job, sends the code to Judge0, and waits for the result.
5. The result (stdout, stderr, status, timing) is persisted as a `SessionEvent` and broadcast to all participants in the session room via `code:run:result`.

### Guest access

Interviewers can share a relay-token URL. The token is a short-lived JWT (signed with `JWT_SECRET`) that lets a candidate join as a guest without an Auth0 account. The API validates the token on Socket.io connection, and the web app uses it for API calls.

## Database Schema

```
User ──< Account        (OAuth accounts per user)
User ──< Session        (sessions created by a user)
Session ──< SessionEvent (audit log: code runs, comments, status changes)
Session >── Problem     (optional problem attached to a session)
```

Key enums: `Role` (INTERVIEWER / CANDIDATE), `SessionStatus` (WAITING / ACTIVE / ENDED), `Difficulty` (EASY / MEDIUM / HARD), `EventType` (KEYSTROKE / CODE_RUN / STATUS_CHANGE / COMMENT / CURSOR / LANGUAGE_CHANGE).

## Useful Commands

```bash
# Start all services
npm run dev

# Run DB migrations
npm run db:migrate --workspace=apps/api

# Open Prisma Studio (DB GUI)
npm run db:studio --workspace=apps/api

# RabbitMQ management UI
open http://localhost:15672   # user: relay / pass: relay

# Build for production
npm run build
```
