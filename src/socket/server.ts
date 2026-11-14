import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { authenticateSocket, type AuthenticatedSocketData } from "./auth.js";
import { registerMessageHandlers } from "./messageHandlers.js";
import { getAllowedFrontendOrigins, isAllowedFrontendOrigin } from "./config.js";
import type { SocketClientEvents, SocketServerEvents } from "./events.js";
import { userRoom } from "./conversationAccess.js";

export function createSocketServer(httpServer: HttpServer) {
  const allowedOrigins = getAllowedFrontendOrigins();
  const io = new Server<
    SocketClientEvents,
    SocketServerEvents,
    Record<string, never>,
    AuthenticatedSocketData
  >(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, isAllowedFrontendOrigin(origin));
    },
    maxHttpBufferSize: 16 * 1024,
  });

  io.use((socket, next) => {
    authenticateSocket(socket)
      .then(() => next())
      .catch(() => next(new Error("Unauthorized")));
  });

  io.on("connection", (socket) => {
    void socket.join(userRoom(socket.data.userId));
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.authExpiresAt - Date.now()),
    );
    expiryTimer.unref();
    socket.once("disconnect", () => clearTimeout(expiryTimer));
    registerMessageHandlers(socket);
  });

  return io;
}
