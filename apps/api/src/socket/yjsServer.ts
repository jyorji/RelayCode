import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { WebSocket, WebSocketServer } from "ws";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, Room>();

function getRoom(sessionId: string): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    const doc = new Y.Doc();
    room = { doc, awareness: new awarenessProtocol.Awareness(doc), conns: new Map() };
    rooms.set(sessionId, room);
  }
  return room;
}

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(message, (err) => {
    if (err) ws.close();
  });
}

const YJS_PATH_PREFIX = "/yjs/";

export function attachYjsServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "", "http://localhost").pathname;
    if (!pathname.startsWith(YJS_PATH_PREFIX)) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const sessionId = decodeURIComponent(url.pathname.slice(YJS_PATH_PREFIX.length));
    const token = url.searchParams.get("token");

    if (!sessionId || !token) {
      ws.close(1008, "Missing session or token");
      return;
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    const room = getRoom(sessionId);
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
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
      );
      send(ws, encoding.toUint8Array(encoder));
    };
    room.awareness.on("update", awarenessChangeHandler);

    // Initial sync: send our state vector so the client can reply with what we're missing.
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
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys())),
      );
      send(ws, encoding.toUint8Array(encoder));
    }

    ws.on("message", (data: Buffer) => {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC:
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
          if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
          break;
        case MESSAGE_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
          break;
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
  });

  return wss;
}
