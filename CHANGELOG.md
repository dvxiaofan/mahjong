# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Local play now opens on a start panel: nothing is dealt and no AI moves until the player clicks 开始对局 (or 继续对局 for a saved game, with an option to discard the save);
- Online rooms now wait for an explicit host start: the room is created in a lobby state, the host sees a "开始牌局" button once four seats are filled, and no action or turn timer runs before it;
- Host-controlled bot seats: the host can fill empty seats with server-played bots (and remove them before the start); a joining human always takes over the newest bot's seat, and bots can also patch a seat vacated mid-match;
- New rooms get a random mahjong-flavoured Chinese name (e.g. 清一色茶楼, 杠上开花雀庄) with a one-click reshuffle, instead of the fixed `mahjong-room`; the nickname likewise defaults to a random tile or table-role alias (幺鸡, 红中, 杠精…) instead of `玩家`;
- The host is now visible everywhere: a crown badge and name on the seat, a "房主" line in the room bar, and a highlighted chip in the participant strip;
- Persistent hand preferences with touch-first selection and explicit discard confirmation, optional direct clicking and wrapped or scrollable hands;
- Bundled Mandarin announcements for public discards and table actions, with private draws/waits excluded and stale playback cancelled;
- Persistent master mute, separate voice/effect switches and volumes, preview and three generated table effects;
- Winning-hand explanations showing actual melds and the pair, using the same partition search as win detection and preferring the all-pungs scoring decomposition;
- An expandable own-hand explanation for incomplete shape, fortune/mouth requirements and turn restrictions, with remaining tiles and read-only replay context;
- Visually reviewed references for all 30 active tile faces, with image-content checks and four-seat action, visibility and tile-conservation regression coverage;
- Large central win, pong and kong notices follow the visible table without changing player panel heights or intercepting actions;
- All four final hands and meld tiles are revealed to players and spectators after a win, with one winning-tile marker and hidden hands restored in a new round;
- Clear discard-source notices with physical tile images, per-seat response progress and distinct action/waiting states;
- New discards float at the visible table center, stay enlarged during responses, then move and shrink into the owner's actual discard slot; replay, reconnect and reduced-motion modes retain accurate state;
- Visible four-player opening dice, tie-break rolls, dealer result and wall-opening details in local and online tables;
- A dedicated green `發` tile face and physical-tile layouts for circle and bamboo suits;
- Automatic local draw when `draw` is the player's only legal action, including replay-source metadata.

### Changed

- All 30 tile faces are fetched and decoded before the table is shown (with a 5 s fallback), so no tile ever appears blank while its image loads over a slow link;
- Static caching is tiered: hashed bundles are immutable for a year, tile and audio media are cached for a week, HTML is always revalidated;
- Compact table spacing with dealer details, response progress and recent events available on demand;
- A single main action prompt and stable win/pong/kong/mouth/pass positions, with replay events clearly marked as historical;
- Action controls and response prompts now sit below the player's own hand, with wrapping buttons and read-only replay/spectator views;
- Local restarts and following rounds now use fresh seeds while persisted games and replay retain their actual seed;
- Local first dealer is selected by four-player dice rolls; the previous winner deals next and a draw keeps the dealer;
- Local session persistence is versioned as v2 to retain the round number and dealer source;
- Multiplayer projections now include the public initial-dealer dice result.
- Tile faces now use local PNG crops from the reference sprite sheet instead of generated SVG artwork.

### Fixed

- The site now declares a favicon, so browsers no longer request `/favicon.ico` and log a 404 on every page load;
- The full-game bot simulation test now carries an explicit timeout, so a slow build machine can no longer fail the Docker image build;
- Disconnection reasons take priority over a pending submission message, while unavailable actions stay hidden;
- Winning-hand and wait detection now count concealed and meld tiles together, excluding impossible fifth copies and false mouth declarations;
- A concealed kong declared before the normal draw now finishes its replacement and then preserves the normal draw, including consecutive kongs and subsequent mouth declaration;
- Normal draw events now say “摸到”, while fortune and kong replacements retain “补摸”;
- Corrected the three-, five- and seven-bamboo images, their sprite crop metadata and cached image URLs so visible hands match the tile values used for win detection;
- Discard emphasis no longer stretches player panels; the compact target stays hidden until arrival, and claims, round completion or newer discards cancel stale overlays;
- Duplicate clicks are blocked while a multiplayer action awaits its matching acknowledgement; rejection, timeout and reconnect recover the controls safely;
- Reconnected games remain read-only until the fresh room snapshot arrives;
- Claimed or won tiles no longer risk being confused with earlier identical discards in the newest-tile presentation;
- Wall, turn and pending-discard information now occupy a dedicated top status bar, keeping player areas unobstructed;
- Player areas size to their content in a responsive grid, including crowded discard/meld states and narrow screens;
- Hands scroll within their own area, public tile backs shrink to fit, and player status/fortune content can wrap;
- Removed the fixed body minimum width that caused horizontal overflow at a 320px viewport with a scrollbar;
- Restored the full quality gate by formatting the tile-face component and tests.

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
