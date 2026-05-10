# SCREW

Private online multiplayer implementation of the Egyptian card game Screw.

## Run Locally

```bash
npm install
npm run dev
```

Frontend: <http://localhost:5173>  
Backend: <http://localhost:3001>

Open the frontend in one to six desktop browser tabs or machines on the same network. Create a room, share the room code/link, enter nicknames, and start once 2 to 6 players are seated. A solo host can use "Fill empty seats with Bots" to test a table.

## Tests

```bash
npm test
```

The first version uses in-memory rooms only. Restarting the server clears all rooms.

## Public Deploy

The app is prepared for single-service hosting. In production, the Node server serves both:

- React frontend from `dist/client`
- Express + Socket.IO backend from the same public URL

Build and start:

```bash
npm install
npm run build
npm start
```

Recommended easy deploy: Render.

1. Push this project to a GitHub repository.
2. Go to Render and create a new Web Service from that repository.
3. Render can detect `render.yaml`, or use:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/health`
4. After deploy, share the Render public URL with friends.

Rooms are still in memory, so if the hosted server sleeps/restarts, current rooms disappear.

## Assets

Real card fronts are stored in `client/public/assets/cards`.

The purple desktop background is stored at `client/public/assets/lobby-bg.png`.

The card definitions point at fixed public asset paths, so future art updates can replace files in place.

## Notes

- The server is authoritative and never includes hidden hands in `publicGameState`.
- Temporary card reveals are emitted only to the acting player.
- Turns are simplified around two main choices: draw from the deck or take the visible ground card and swap it with one of your cards.
- Bots can fill empty seats before the round starts and use the same server-authoritative actions as players.
- Sound files live in `client/public/assets/sounds`; missing audio fails silently.
- Disconnected seats are held for 2 minutes and can be rejoined with the saved local player id.
- The Screw unlock timer is 600 seconds by default in `server/src/game/Constants.ts`.
