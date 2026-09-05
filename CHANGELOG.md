# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Visible four-player opening dice, tie-break rolls, dealer result and wall-opening details in local and online tables;
- A dedicated green `發` tile face and physical-tile layouts for circle and bamboo suits;
- Automatic local draw when `draw` is the player's only legal action, including replay-source metadata.

### Changed

- Local restarts and following rounds now use fresh seeds while persisted games and replay retain their actual seed;
- Local first dealer is selected by four-player dice rolls; the previous winner deals next and a draw keeps the dealer;
- Local session persistence is versioned as v2 to retain the round number and dealer source;
- Multiplayer projections now include the public initial-dealer dice result.

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
