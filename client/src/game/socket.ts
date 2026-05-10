import { io, type Socket } from 'socket.io-client';

const defaultServerUrl = () => {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalDev && window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return window.location.origin;
};

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || defaultServerUrl();

export const createSocket = (): Socket =>
  io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: false
  });
