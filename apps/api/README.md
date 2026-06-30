# RelayCode — API

Express 5 backend for RelayCode. Exposes a REST API, a Socket.io server for real-time session events, a Yjs WebSocket server for collaborative editing, and a RabbitMQ worker that dispatches code to Judge0 for execution.

## Ports

| Server | Port |
|---|---|
| HTTP (REST + Socket.io + Yjs) | 4000 |

## Setup

### Environment variables

Create `apps/api/.env`:

```env
DATABASE_URL=postgresql://relay:relay@localhost:5432/relay_db
RABBITMQ_URL=amqp://relay:relay@localhost:5672
JUDGE0_URL=http://localhost:2358
JWT_SECRET=your-jwt-secret
PORT=4000
```

### Run

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build
npm run start
```

### Database

```bash
# Apply migrations
npm run db:migrate

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Run seed script
npm run db:seed
```

## REST API

All routes require a `Bearer` JWT in the `Authorization` header (issued by the web app after Auth0 login).

### Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions for the authenticated user |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/:id` | Get a single session with its problem |
| `PATCH` | `/api/sessions/:id` | Update title, language, problem, status, or notes |
| `DELETE` | `/api/sessions/:id` | Delete a session (owner only) |

**POST `/api/sessions` body**
```json
{
  "title": "System Design Round",
  "language": "javascript",
  "problemId": "optional-problem-id"
}
```

### Problems

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/problems` | List problems (filterable) | any |
| `GET` | `/api/problems/:id` | Get a single problem | any |
| `POST` | `/api/problems` | Create a problem | INTERVIEWER only |
| `PATCH` | `/api/problems/:id` | Update a problem | INTERVIEWER only |
| `DELETE` | `/api/problems/:id` | Delete a problem | INTERVIEWER only |

**GET `/api/problems` query params**

| Param | Type | Description |
|---|---|---|
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | Filter by difficulty |
| `tag` | string | Filter by tag |
| `search` | string | Case-insensitive title search |
| `take` | number | Page size (default 50, max 100) |
| `skip` | number | Offset for pagination |

## Socket.io Events

Connect with a `Bearer` JWT in `socket.handshake.auth.token`. Guests connect with a relay token (a short-lived JWT minted by the web app's `/api/relay-token` route).

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `session:join` | `{ sessionId }` | Join a session room and broadcast presence |
| `language:change` | `{ sessionId, language }` | Change the session language |
| `status:change` | `{ sessionId, status }` | Transition session status (`WAITING` / `ACTIVE` / `ENDED`) |
| `comment:add` | `{ sessionId, text }` | Add a comment to the session |
| `code:run` | `{ sessionId, code, language, stdin? }` | Queue a code execution job |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `session:joined` | `{ session }` | Confirmation after joining; includes full session object |
| `presence:update` | `{ users: [{ userId, name, image }] }` | Broadcast whenever someone joins or leaves |
| `language:changed` | `{ language }` | New language after a change |
| `status:changed` | `{ status, startedAt?, endedAt? }` | New status after a transition |
| `comment:added` | `{ id, userId, text, createdAt }` | New comment broadcast to the room |
| `code:run:queued` | `{ requestId }` | Immediate ACK that the job was queued |
| `code:run:result` | `{ requestId, result }` | Execution result from Judge0 (stdout, stderr, status, time, memory) |

## Code Execution Flow

1. Client emits `code:run`.
2. API publishes a job to the `execution_queue` in RabbitMQ.
3. The execution worker (`src/workers/executionWorker.ts`) picks up the job and calls Judge0.
4. Judge0 runs the code in an isolated sandbox and returns the result.
5. The worker persists a `CODE_RUN` `SessionEvent` and emits `code:run:result` to the session room.

**Supported languages**

| Language | Judge0 ID |
|---|---|
| JavaScript | 63 |
| TypeScript | 74 |
| Python | 71 |
| Java | 62 |
| C++ | 54 |
| C | 50 |
| Go | 60 |
| Ruby | 72 |

## Project Structure

```
apps/api/
├── src/
│   ├── index.ts              # Entry point — Express + Socket.io + Yjs server setup
│   ├── routes/
│   │   ├── sessions.ts       # CRUD for sessions
│   │   └── problems.ts       # CRUD for problems
│   ├── socket/
│   │   ├── sessionRoom.ts    # Socket.io: presence, language, status, comments, code:run
│   │   └── yjsServer.ts      # Yjs WebSocket server (collaborative editor sync)
│   ├── workers/
│   │   └── executionWorker.ts  # RabbitMQ consumer → Judge0 → emit result
│   ├── lib/
│   │   ├── db.ts             # Prisma client singleton
│   │   ├── judge0.ts         # Judge0 HTTP client
│   │   ├── queue.ts          # RabbitMQ publish/consume helpers
│   │   ├── errors.ts         # NotFoundError, ForbiddenError, etc.
│   │   └── sessionUtils.ts   # Room name helper, offset calculation
│   ├── middleware/
│   │   ├── auth.ts           # requireAuth / requireInterviewer guards
│   │   └── errorHandler.ts   # Global Express error handler
│   └── types/
│       └── express.d.ts      # Extends Request with userId
└── prisma/
    ├── schema.prisma
    ├── prisma.config.ts
    └── migrations/
```
