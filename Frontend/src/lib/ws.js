// WebSocket client with automatic reconnection.
// Connects directly to the backend so Vite does not need to proxy the socket.

const WS_URL = import.meta.env.VITE_WS_BASE
  || `${location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:3001/ws`;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

class WSClient {
  constructor() {
    this._ws         = null;
    this._handlers   = {};       // type → Set<fn>
    this._delay      = RECONNECT_DELAY;
    this._stopped    = false;
    this._retryTimer = null;
  }

  connect() {
    this._stopped = false;
    this._open();
  }

  disconnect() {
    this._stopped = true;
    clearTimeout(this._retryTimer);
    if (this._ws) { this._ws.close(); this._ws = null; }
  }

  on(type, fn) {
    if (!this._handlers[type]) this._handlers[type] = new Set();
    this._handlers[type].add(fn);
    return () => this._handlers[type].delete(fn);   // returns unsubscribe fn
  }

  send(payload) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(payload));
    }
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  _open() {
    if (this._stopped) return;
    try {
      const ws = new WebSocket(WS_URL);
      this._ws = ws;

      ws.onopen = () => {
        this._delay = RECONNECT_DELAY;
        this._emit('_connected', {});
        ws.send(JSON.stringify({ type: 'PING' }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this._emit(msg.type, msg);
          this._emit('*', msg);
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => { /* handled in onclose */ };

      ws.onclose = () => {
        this._ws = null;
        this._emit('_disconnected', {});
        if (!this._stopped) this._scheduleReconnect();
      };
    } catch {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    this._retryTimer = setTimeout(() => {
      this._delay = Math.min(this._delay * 1.5, MAX_RECONNECT_DELAY);
      this._open();
    }, this._delay);
  }

  _emit(type, msg) {
    this._handlers[type]?.forEach(fn => { try { fn(msg); } catch { /* ignore */ } });
  }
}

export const ws = new WSClient();
