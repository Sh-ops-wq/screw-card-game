import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerSockets } from './socket';
import { DeckService } from './game/DeckService';

DeckService.assertDefinitions();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin not allowed: ${origin}`), false);
};

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'screw-server' });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticClientPath = path.resolve(__dirname, '../../dist/client');
app.use(express.static(staticClientPath));
app.get(/^(?!\/socket\.io|\/health).*/, (_req, res) => {
  res.sendFile(path.join(staticClientPath, 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true
  }
});

registerSockets(io);

httpServer.listen(port, () => {
  console.log(`Screw server listening on http://localhost:${port}`);
});
