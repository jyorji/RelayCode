
<div align="center">

# ⚡ RelayCode

**Real-time collaborative coding interviews — one link, one editor, zero setup for candidates.**

Interviewers spin up a session, share a link, and both sides land in the same synchronized Monaco editor with live presence, in-session chat, and one-click code execution across eight languages.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-queue-FF6600?logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Judge0](https://img.shields.io/badge/Judge0-self--hosted-informational)](https://judge0.com/)
[![Auth0](https://img.shields.io/badge/Auth0-social_login-EB5424?logo=auth0&logoColor=white)](https://auth0.com/)

</div>

<p align="center">
  <img src="docs/screenshots/session-editor.png" alt="RelayCode collaborative session editor" width="820">
</p>

<p align="center"><sub>A live session — problem prompt, synchronized Monaco editor, and per-case test runner, side by side.</sub></p>

<br>

## 📋 Contents

- [Overview](#-overview)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure)
- [Getting started](#-getting-started)
- [Environment variables](#-environment-variables-reference)
- [How it works](#-how-it-works)
- [Database schema](#-database-schema)
- [Useful commands](#-useful-commands)

## 🔭 Overview

RelayCode replaces the screen-share-and-pray approach to coding interviews. An interviewer creates a session, sends a single relay link, and the candidate drops straight into a shared Monaco editor — no account required on their end. Every keystroke, run, and status change is synced live and logged for later replay.

## 📸 Screenshots

<details open>
<summary><b>Sign in</b> — Auth0-backed authentication behind a clean, minimal shell</summary>
<br>
<p align="center"><img src="docs/screenshots/login-screen.png" alt="RelayCode sign-in screen" width="700"></p>
</details>

<details>
<summary><b>Sessions dashboard</b> — every interview session, its language, and its live status at a glance</summary>
<br>
<p align="center"><img src="docs/screenshots/sessions-list.png" alt="RelayCode sessions dashboard" width="820"></p>
</details>

<details>
<summary><b>Problem library</b> — reusable problems tagged by topic and difficulty, ready to attach to a session</summary>
<br>
<p align="center"><img src="docs/screenshots/problem-library.png" alt="RelayCode problem library" width="820"></p>
</details>

<details>
<summary><b>Session editor</b> — the collaborative Monaco editor with the problem prompt, test cases, and run output</summary>
<br>
<p align="center"><img src="docs/screenshots/session-editor.png" alt="RelayCode session editor with test cases" width="820"></p>
</details>

<div align="right"><a href="#-relaycode">↑ back to top</a></div>

## ✨ Features

<table>
<tr><td>🧑‍🤝‍🧑</td><td><b>Collaborative editor</b></td><td>Yjs CRDT keeps every participant's cursor and keystrokes in sync with no conflicts</td></tr>
<tr><td>▶️</td><td><b>Code execution</b></td><td>Runs submissions through a self-hosted Judge0 engine via a RabbitMQ worker queue; results stream back to everyone in real time</td></tr>
<tr><td>🌐</td><td><b>Multi-language support</b></td><td>JavaScript, TypeScript, Python, Java, C++, C, Go, Ruby</td></tr>
<tr><td>🔗</td><td><b>Guest access</b></td><td>Share a relay-token link — candidates join without creating an account</td></tr>
<tr><td>👀</td><td><b>Presence indicators</b></td><td>See exactly who is in the session, with avatars</td></tr>
<tr><td>🔄</td><td><b>Session lifecycle</b></td><td>Sessions move through <code>WAITING → ACTIVE → ENDED</code>; start/end timestamps are recorded automatically</td></tr>
<tr><td>🧩</td><td><b>Problem bank</b></td><td>Attach a problem — title, description, starter code, test cases, difficulty — to any session</td></tr>
<tr><td>📼</td><td><b>Session events</b></td><td>Every code run, language change, status change, and comment is persisted with a millisecond offset for replay</td></tr>
<tr><td>⚙️</td><td><b>Configurable sessions</b></td><td>Toggle autocomplete and language switching per session</td></tr>
<tr><td>🔐</td><td><b>Auth0 authentication</b></td><td>Social login supported out of the box</td></tr>
</table>

<div align="right"><a href="#-relaycode">↑ back to top</a></div>

## 🧱 Tech stack

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

## 🗂️ Project structure

<details>
<summary>Click to expand the full directory tree</summary>

```
relay/
├── apps/
│ ├── web/ # Next.js frontend (port 3000)
│ │ ├── app/ # App Router pages and API routes
│ │ ├── components/Editor/ # Collaborative Monaco editor
│ │ ├── lib/ # Auth0 client, Prisma client, token helpers
│ │ └── vendor/ # Vendored packages (forge-ui, y-monaco)
│ └── api/ # Express backend (port 4000)
│ ├── src/
│ │ ├── routes/ # REST: /api/sessions, /api/problems
│ │ ├── socket/ # Socket.io: session room + Yjs server
│ │ ├── workers/ # RabbitMQ execution worker
│ │ ├── lib/ # DB, queue, Judge0, session helpers
│ │ └── middleware/ # Auth, error handling
│ └── prisma/
│ ├── schema.prisma
│ └── migrations/
├── infra/
│ └── judge0/ # Custom Judge0 job override
├── docker-compose.yml
└── package.json # Workspace root
```

</details>

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) and Docker Compose
- An [Auth0](https://auth0.com/) account (free tier is sufficient)

### 1. Clone and install

```bash
git clone https://github.com/jyorji/RelayCode.git
cd RelayCode
npm install
```

### 2. Start infrastructure services

```bash
# everything at once
docker compose up -d
```

<details>
<summary>Start services individually, or manage them one at a time</summary>

```bash
# PostgreSQL only (port 5432)
docker compose up -d postgres

# RabbitMQ only (ports 5672 + 15672 for management UI)
docker compose up -d rabbitmq

# Judge0 only — also starts its own postgres and redis automatically
docker compose up -d judge0
```

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

**Ports at a glance**

| Service | Port |
|---|---|
| PostgreSQL (app DB) | 5432 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ Management UI | 15672 |
| Judge0 API | 2358 |

</details>

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

> ⚠️ `JWT_SECRET` must match in both apps — the API issues tokens and the web app verifies them when generating relay (guest) links.

### 4. Run database migrations

```bash
cd apps/api
npm run db:migrate
```

### 5. Start the dev servers

```bash
npm run dev
```

This concurrently starts the **web** app on `http://localhost:3000` and the **API** on `http://localhost:4000`.

<div align="right"><a href="#-relaycode">↑ back to top</a></div>

## 🔧 Environment variables reference

<details>
<summary><b>API</b> — <code>apps/api/.env</code></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `JUDGE0_URL` | Base URL of the Judge0 instance |
| `JWT_SECRET` | Secret used to sign and verify relay tokens |
| `PORT` | API server port (default: `4000`) |

</details>

<details>
<summary><b>Web</b> — <code>apps/web/.env.local</code></summary>

| Variable | Description |
|---|---|
| `AUTH0_SECRET` | Long random string used to encrypt the session cookie |
| `AUTH0_BASE_URL` | Public URL of the web app |
| `AUTH0_ISSUER_BASE_URL` | Your Auth0 domain, e.g. `https://dev-xxx.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret |
| `NEXT_PUBLIC_API_URL` | Base URL of the API (exposed to the browser) |
| `JWT_SECRET` | Must match the API's `JWT_SECRET` |

</details>

## 🧠 How it works

### Real-time collaboration

The collaborative editor is powered by [Yjs](https://yjs.dev/). The API runs a Yjs WebSocket server alongside the Socket.io server on the same HTTP port. When a participant joins a session, the browser syncs the Yjs document over WebSocket — changes merge automatically via CRDT conflict resolution, so concurrent edits never conflict.

### Code execution flow

```mermaid
sequenceDiagram
    participant U as Participant
    participant W as Web (Next.js)
    participant A as API (Socket.io)
    participant Q as RabbitMQ
    participant J as Judge0

    U->>W: Click "Run"
    W->>A: code:run event
    A->>Q: publish job to execution_queue
    Q->>A: worker consumes job
    A->>J: submit code for execution
    J-->>A: stdout / stderr / status / timing
    A-->>W: code:run:result (broadcast to session room)
```

### Guest access

Interviewers can share a relay-token URL. The token is a short-lived JWT (signed with `JWT_SECRET`) that lets a candidate join as a guest without an Auth0 account. The API validates the token on Socket.io connection, and the web app uses it for API calls.

<div align="right"><a href="#-relaycode">↑ back to top</a></div>

## 🗄️ Database schema

```mermaid
erDiagram
    USER ||--o{ ACCOUNT : has
    USER ||--o{ SESSION : creates
    SESSION ||--o{ SESSION_EVENT : logs
    PROBLEM ||--o{ SESSION : "attached to"
```

Key enums: `Role` (INTERVIEWER / CANDIDATE), `SessionStatus` (WAITING / ACTIVE / ENDED), `Difficulty` (EASY / MEDIUM / HARD), `EventType` (KEYSTROKE / CODE_RUN / STATUS_CHANGE / COMMENT / CURSOR / LANGUAGE_CHANGE).

## 🛠️ Useful commands

```bash
# Start all services
npm run dev

# Run DB migrations
npm run db:migrate --workspace=apps/api

# Open Prisma Studio (DB GUI)
npm run db:studio --workspace=apps/api

# RabbitMQ management UI
open http://localhost:15672 # user: relay / pass: relay

# Build for production
npm run build
```

<div align="center">

<br>

**Built for engineers who'd rather demonstrate their code than describe it.**

<a href="#-relaycode">↑ back to top</a>

</div>
