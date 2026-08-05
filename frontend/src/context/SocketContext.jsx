import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    if (!user) return undefined;

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;

    const handle = (type) => (payload) => setLastEvent({ type, payload, at: Date.now() });
    socket.on('order:created', handle('order:created'));
    socket.on('order:updated', handle('order:updated'));
    socket.on('order:payment', handle('order:payment'));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return <SocketContext.Provider value={{ lastEvent }}>{children}</SocketContext.Provider>;
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
