# Changelog

## Unreleased
- add weekly leaderboard rewards: on-chain reward pool, admin-approve/player-withdraw flow, backend tally + routes, and player/admin UIs (see note-92)
- add admin reward reconciliation endpoint + "Refresh from chain" action to re-sync stale reward status from on-chain state after a failed follow-up write
- add MongoDB service to docker-compose with persistent volume
- guard Socket.IO header logging behind env flag and sanitize output
- fix duplicate leaderboard helper by preferring in-memory cache with optional player-service fallback
- document optional player service configuration and defaults
- fix GameOver rematch navigation to use `/game`
- load audio assets via PUBLIC_URL-aware paths to support subpath hosting
