const API_BASE = '/api';

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export function createWsConnection(
  token: string,
  onMessage: (data: unknown) => void,
  onOpen: () => void,
  onClose: (code: number) => void,
  onError: (err: Event) => void
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = 3001; // WS server port
  const ws = new WebSocket(`${protocol}//localhost:${wsPort}?token=${encodeURIComponent(token)}`);

  ws.onopen = () => onOpen();
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };
  ws.onclose = (event) => onClose(event.code);
  ws.onerror = (err) => onError(err);

  return ws;
}

export function sendWsMessage(ws: WebSocket, type: string, payload: Record<string, unknown> = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}
