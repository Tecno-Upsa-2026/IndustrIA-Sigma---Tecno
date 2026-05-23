// ─────────────────────────────────────────────────────────────────────────────
// WebSocket broadcaster: manages all client connections and message dispatch.
// ─────────────────────────────────────────────────────────────────────────────

class Broadcaster {
  constructor() { this.wss = null; }

  init(wss) {
    this.wss = wss;
    wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      console.log(`  [ws] client connected — ${ip} (${wss.clients.size} total)`);

      ws.on('close', () =>
        console.log(`  [ws] client disconnected (${wss.clients.size} remaining)`)
      );

      // Handle messages from client (future: control commands)
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this._handleClientMessage(ws, msg);
        } catch { /* ignore malformed */ }
      });

      // Send handshake on connect
      ws.send(JSON.stringify({ type: 'CONNECTED', ts: Date.now() }));
    });
  }

  // Broadcast to all connected clients
  emit(payload) {
    if (!this.wss) return;
    const data = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {   // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  _handleClientMessage(ws, msg) {
    // Ping/pong keepalive
    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
    }
  }

  get clientCount() {
    return this.wss ? this.wss.clients.size : 0;
  }
}

export const broadcaster = new Broadcaster();
