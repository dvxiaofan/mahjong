# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-09-05

### Added

- Complete 120-tile custom Mahjong rules engine with deterministic replay;
- Fortune-tile replacement draws, pong/kong actions, mouth declaration and settlement;
- React/Vite local table with responsive vector Mahjong tiles;
- Three deterministic, explainable AI difficulty levels and simulation reports;
- Local persistence, event history and step-by-step replay;
- Multi-round matches with dice/dealer/wall-opening rules;
- Versioned multiplayer protocol, authoritative rooms and per-seat privacy projection;
- Password rooms, spectators, reconnect tokens, trustee AI and timeout handling;
- HTTP/WebSocket server with atomic state persistence and browser online mode;
- Abuse protection, CI, coverage thresholds, repository hygiene and deployment assets.

### Security

- Server-controlled seats, actions, scoring and hidden state;
- Request revisions and idempotency protection;
- Message size/rate limits, violation bans and redacted audits;
- Salted password digests and rotating reconnect tokens;
- Restricted state-file permissions and production security headers.
