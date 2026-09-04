# Deployment and Operations

## Requirements

- Node.js 22 or newer;
- a persistent writable directory for the room-state file;
- TLS termination in front of the service for public deployments.

## Production build

```bash
npm ci --ignore-scripts
npm run quality
npm start
```

`npm run quality` produces:

- `dist/` — engine package;
- `dist-web/` — browser application;
- `dist-server/` — HTTP/WebSocket service.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` in CLI | Listen address |
| `PORT` | `8787` | HTTP and WebSocket port |
| `MAHJONG_STATE_FILE` | `./data/rooms.json` | Sensitive authoritative room-state file |

The WebSocket endpoint is `/ws`. Health probes are available at `/healthz` and `/readyz`.

## Docker Compose

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8787/healthz
```

The named `mahjong-data` volume contains `rooms.json`. Do not remove this volume during a normal upgrade.

## Reverse proxy

Terminate TLS at a reverse proxy and forward both HTTP and WebSocket traffic to the same service. A minimal Nginx location is:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Apply IP-level connection and request-rate limits at the proxy. The application also enforces per-connection message size, rate, revision and violation limits.

## State, backup and restore

The state file includes full walls, concealed hands, salted password digests and reconnect tokens. Treat it as a secret.

- The service writes it atomically with mode `0600`;
- store it on an encrypted persistent volume;
- back it up only while preserving file permissions;
- do not send it to clients or application-access logs;
- restore by stopping the service, replacing the file, checking ownership/permissions, and starting the same or a compatible application version.

On restart, previous sockets are considered disconnected. Seats remain reserved and clients reconnect with rotating recovery tokens.

## Graceful shutdown

The CLI handles `SIGINT` and `SIGTERM`, flushes state, closes WebSockets and then closes HTTP. Container orchestrators should provide at least a 10-second termination grace period.

## Scaling

The included server is a single authoritative process. Do not start multiple replicas against the same JSON file.

For horizontal scaling, route each room to exactly one authority and replace file persistence with a transactional shared store or an actor/durable-object model. Preserve protocol revision and idempotency semantics.

## Upgrade and rollback

1. Back up `rooms.json`;
2. deploy the new image without deleting the data volume;
3. wait for `/readyz` to return HTTP 200;
4. open the page and verify WebSocket reconnect;
5. if rollback is required, stop the new service, restore the matching state backup if its schema changed, and start the previous image.

Persistence structures are versioned. A process fails rather than silently accepting an unknown version.

## Production smoke checklist

- `/healthz` and `/readyz` return `status: ok`;
- the root page returns the CSP, frame-deny and no-sniff headers;
- a WebSocket can create a room and receive a private snapshot;
- a second connection receives a lobby update;
- reconnect works after closing one socket;
- the state file exists with mode `0600`;
- logs and monitoring do not contain passwords, reconnect tokens, walls or concealed hands.
