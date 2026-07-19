# Note 92 – Weekly Leaderboard Rewards

## Summary
Top player of each completed ISO week wins a fixed cUSD prize, funded from an
on-chain reward pool and paid out with an admin-approve / player-withdraw flow.

## Contract (`blockchain/src/PongEscrow.sol`)
- `rewardPool[token]` holds pooled funds per token.
- `fundRewardPool(token, amount)` / `withdrawRewardPool(token, amount, to)` — owner-only pool management (native + ERC-20).
- `approveReward(weekKey, player, token, amount)` — owner marks a winner claimable.
- `withdrawReward(weekKey, token)` — winner pulls their approved reward.
- `getApprovedReward(weekKey, player, token)` → `(amount, withdrawn)`.
- `weekKey` is the canonical ISO week string, e.g. `2026-W29`.

## Backend
- `src/config/weeklyRewards.js` — token (cUSD), amount, and eligibility threshold from env.
- `src/utils/weekUtils.js` — ISO week math (`getWeekKey`, `getWeekRange`, `getRecentCompletedWeekKeys`).
- `src/models/WeeklyReward.js` — one row per (weekKey, wallet), status: `available → requested → approved → claimed`.
- `src/services/weeklyRewardService.js` — leaderboard tally + lazy, idempotent winner materialization on first read of a completed week (no cron needed at current traffic).
- `src/services/contractOwnerService.js` — on-chain `owner()` lookup gating admin routes.
- Routes: `/rewards/config`, `/rewards/leaderboard`, `/rewards/mine`, `/rewards/:weekKey/request`, `/rewards/:weekKey/claimed`, `/rewards/admin/pending`, `/rewards/admin/:rewardId/approved`, `/rewards/admin/reconcile`.
- `src/services/weeklyRewardChainService.js` — read-only `getApprovedReward` view used by reconciliation.

## Reconciliation
- The admin approve/withdraw flow is two steps: an on-chain tx, then a DB write. If the tx succeeds but the follow-up write fails, the DB row lags the chain.
- `/rewards/admin/reconcile` (owner-gated, read-only against chain) reads `getApprovedReward` for each pending row and advances stale statuses: `withdrawn → claimed`, `approved-on-chain → approved`. It never downgrades a row (`resolveReconciledStatus`, unit-tested).
- Surfaced in the admin dashboard as "Refresh from chain".

## Frontend
- `src/api/rewards.js` — reward API client.
- `src/hooks/useContract.js` — `useWithdrawWeeklyReward`, `useFundRewardPool`, `useApproveReward`, `useWithdrawRewardPool`, `useRewardPoolBalance`.
- `src/components/WeeklyRewards.js` (`/rewards`) — standings + player request/withdraw.
- `src/components/AdminRewards.js` (`/admin/rewards`) — owner-gated pool funding, drain, and approvals.

## Config
- `backend/.env.example`: `CUSD_TOKEN_ADDRESS`, `WEEKLY_REWARD_AMOUNT`, `WEEKLY_REWARD_MIN_GAMES`.
- Frontend reads reward config from the backend API; cUSD address already in `frontend/.env.example`.

## Eligibility
- Must be the week's top winner AND have played at least `WEEKLY_REWARD_MIN_GAMES` games that week (anti-self-play threshold).
