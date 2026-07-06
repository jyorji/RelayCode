import type { Server as HttpServer } from "http";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { WebSocket, WebSocketServer } from "ws";

type RedisClient = ReturnType<typeof createClient>;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// Unique ID for this process — filters out our own pub/sub messages
const POD_ID = Math.random().toString(36).slice(2);

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  ready: Promise<void>;
}

const rooms = new Map<string, Room>();

function getRoom(sessionId: string, redis: RedisClient): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    const doc = new Y.Doc();
    // Expose the Redis load as a promise so connection handlers can await it
    // before sending syncStep1. Without this, the client sees an empty doc,
    // seeds with initialCode, then the Redis state arrives and Yjs merges both
    // → the same code appears twice.
    const ready = redis.get(`yjs-state:${sessionId}`).then((b64) => {
      if (b64) Y.applyUpdate(doc, Buffer.from(b64, "base64"), "redis");
    }).catch(() => {});
    room = { doc, awareness: new awarenessProtocol.Awareness(doc), conns: new Map(), ready };
    rooms.set(sessionId, room);

    // On every local update: publish delta for cross-pod sync + persist full state
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "redis") return; // avoid re-publishing Redis-sourced updates
      redis.publish(`yjs-pub:${sessionId}`, `${POD_ID}:${Buffer.from(update).toString("base64")}`).catch(() => {});
      // ponytail: full-state encode on each update; switch to incremental RPUSH + periodic compaction if doc size becomes a concern
      redis.set(`yjs-state:${sessionId}`, Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64")).catch(() => {});
    });
  }
  return room;
}

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(message, (err) => { if (err) ws.close(); });
}

const YJS_PATH_PREFIX = "/yjs/";

export async function attachYjsServer(httpServer: HttpServer, redis: RedisClient) {
  const sub = redis.duplicate();
  await sub.connect();

  // Receive Yjs doc updates from other pods
  await sub.pSubscribe("yjs-pub:*", (payload, channel) => {
    const sep = payload.indexOf(":");
    if (payload.slice(0, sep) === POD_ID) return;
    const sessionId = channel.slice("yjs-pub:".length);
    const room = rooms.get(sessionId);
    if (!room) return;
    Y.applyUpdate(room.doc, Buffer.from(payload.slice(sep + 1), "base64"), "redis");
  });

  // Receive awareness updates from other pods
  await sub.pSubscribe("yjs-awareness:*", (payload, channel) => {
    const sep = payload.indexOf(":");
    if (payload.slice(0, sep) === POD_ID) return;
    const sessionId = channel.slice("yjs-awareness:".length);
    const room = rooms.get(sessionId);
    if (!room) return;
    awarenessProtocol.applyAwarenessUpdate(room.awareness, Buffer.from(payload.slice(sep + 1), "base64"), "redis");
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "", "http://localhost").pathname;
    if (!pathname.startsWith(YJS_PATH_PREFIX)) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const sessionId = decodeURIComponent(url.pathname.slice(YJS_PATH_PREFIX.length));
    const token = url.searchParams.get("token");

    if (!sessionId || !token) { ws.close(1008, "Missing session or token"); return; }

    try {
      jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    const room = getRoom(sessionId, redis);
    room.conns.set(ws, new Set());
    ws.binaryType = "nodebuffer";

    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === ws) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      send(ws, encoding.toUint8Array(encoder));
    };
    room.doc.on("update", updateHandler);

    const awarenessChangeHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === ws) return;
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients));
      send(ws, encoding.toUint8Array(encoder));
    };
    room.awareness.on("update", awarenessChangeHandler);

    ws.on("message", (data: Buffer) => {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC:
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
          if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
          break;
        case MESSAGE_AWARENESS: {
          const awarenessUpdate = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(room.awareness, awarenessUpdate, ws);
          // Forward awareness to other pods (cursor positions, user presence)
          redis.publish(`yjs-awareness:${sessionId}`, `${POD_ID}:${Buffer.from(awarenessUpdate).toString("base64")}`).catch(() => {});
          break;
        }
      }
    });

    ws.on("close", () => {
      room.doc.off("update", updateHandler);
      room.awareness.off("update", awarenessChangeHandler);
      const clientIds = room.conns.get(ws);
      room.conns.delete(ws);
      if (clientIds && clientIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(clientIds), null);
      }
      if (room.conns.size === 0) rooms.delete(sessionId);
    });

    // Wait for Redis state to load before sending the initial state vector.
    // All handlers are registered above so no events are missed during the await.
    await room.ready;

    // Initial sync: send state vector so client can reply with missing updates
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, room.doc);
      send(ws, encoding.toUint8Array(encoder));
    }

    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys())));
      send(ws, encoding.toUint8Array(encoder));
    }
  });

  return wss;
}
