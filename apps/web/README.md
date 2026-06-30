# RelayCode — Web

Next.js 16 frontend for RelayCode. Handles authentication, the session dashboard, and the real-time collaborative editor.

## Routes

| Path | Description |
|---|---|
| `/` | Landing / login page (unauthenticated) or session dashboard (authenticated) |
| `/session/[id]` | Live collaborative coding session |
| `/api/sessions` | Proxy route — creates/lists sessions via the API |
| `/api/sessions/[id]` | Proxy route — fetches a single session |
| `/api/relay-token` | Issues a guest JWT for sharing a session link |

## Tech

- **Next.js 16** with App Router and React 19
- **Auth0** (`@auth0/nextjs-auth0`) for authentication and session management
- **Monaco Editor** + **Yjs** (`y-monaco`, `y-websocket`) for the collaborative editor
- **Socket.io client** for presence, comments, code execution results, and session events
- **Prisma** (with `@prisma/adapter-pg`) for direct DB access from server components
- **Zustand** for client-side state, **TanStack React Query** for server-state caching
- **forge-ui** (vendored at `vendor/forge-ui-0.2.0.tgz`) for UI components
- **Tailwind CSS v4**

## Setup

### Environment variables

Create `apps/web/.env.local`:

```env
AUTH0_SECRET=your-long-random-string
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<your-auth0-client-id>
AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
NEXT_PUBLIC_API_URL=http://localhost:4000
JWT_SECRET=your-jwt-secret
```

> `JWT_SECRET` must match the value set in `apps/api/.env` — the web app uses it to mint relay tokens; the API uses it to verify them.

### Run

```bash
# From the repo root (runs web + api together)
npm run dev

# Or from this directory
npm run dev
```

App runs at **http://localhost:3000**.

## Key Files

```
apps/web/
├── app/
│   ├── page.tsx                    # Dashboard or login redirect
│   ├── layout.tsx                  # Root layout with providers
│   ├── providers.tsx               # Auth0 + React Query providers
│   ├── session/[id]/
│   │   ├── page.tsx                # Session page (server component)
│   │   └── editor-client.tsx       # Client wrapper for the editor
│   └── api/
│       ├── relay-token/route.ts    # Issues guest JWTs
│       └── sessions/               # Proxy routes to the API
├── components/
│   └── Editor/index.tsx            # CollaborativeEditor (Monaco + Yjs)
├── lib/
│   ├── auth0.ts                    # Auth0 server-side client
│   ├── db.ts                       # Prisma client singleton
│   ├── relayToken.ts               # JWT mint/verify helpers
│   └── syncUser.ts                 # Upserts Auth0 user into the DB
└── vendor/
    ├── forge-ui-0.2.0.tgz          # UI component library
    └── y-monaco-0.1.6.tgz          # Monaco ↔ Yjs binding
```
