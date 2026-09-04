import { resolve } from 'node:path';
import { createMahjongServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const stateFile = process.env.MAHJONG_STATE_FILE ?? resolve(process.cwd(), 'data/rooms.json');
const server = await createMahjongServer({ host, port, stateFile });
const address = await server.listen();

process.stdout.write(`Mahjong server listening on ${address.httpUrl} (WebSocket ${address.webSocketUrl})\n`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
