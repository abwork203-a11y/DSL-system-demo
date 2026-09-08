import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// Same cross-origin reality as api/client.js: in production the frontend
// (Vercel) and backend (Render) are different origins, so — unlike local dev,
// where the Vite proxy makes '/' resolve to the backend — we need the real
// backend URL here. Falls back to '' (same-origin) for local dev.
const SOCKET_URL = import.meta.env.VITE_API_URL || '/';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return undefined;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      withCredentials: true,
      // Start with polling and let it upgrade — some free-tier hosts/proxies
      // don't handle the initial websocket upgrade handshake cleanly, but
      // polling always works as a fallback, so this avoids a connection that
      // silently never establishes.
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const handle = (type) => (payload) => setLastEvent({ type, payload, at: Date.now() });
    socket.on('order:created', handle('order:created'));
    socket.on('order:updated', handle('order:updated'));
    socket.on('order:payment', handle('order:payment'));
    socket.on('order:cancelled', handle('order:cancelled'));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return <SocketContext.Provider value={{ lastEvent, connected }}>{children}</SocketContext.Provider>;
}

// Subscribe to live order/ledger events. Pass a callback that re-fetches
// whatever list is on screen — keeps components simple and decoupled from
// socket wiring details.
export function useLiveOrderEvents(onEvent) {
  const { lastEvent } = useContext(SocketContext) || {};
  useEffect(() => {
    if (lastEvent) onEvent?.(lastEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);
}

export function useSocketStatus() {
  const ctx = useContext(SocketContext);
  return ctx?.connected ?? false;
}
