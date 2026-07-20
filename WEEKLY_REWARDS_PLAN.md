# Weekly Leaderboard Rewards — Implementation Plan

## Decisions (locked)
- **Ranking metric:** Most weekly wins (staked + free), counted per ISO week from `Game.endedAt`.
- **Eligibility:** Minimum **10 games played** within the week to qualify (anti-collusion).
- **Reward amount:** Env-configurable amount, set by the deployer.
- **Reward token:** **Fixed to cUSD.** Contract functions stay token-parameterized (reuse `_transferTo`/ERC-20 path), but the app only ever funds/signs/claims cUSD, using the network-appropriate cUSD address from env.
- **Payout:** On-chain, pull-based, oracle-signed withdrawal (mirrors existing `claimPrize`).
- **Deployer = contract `owner()`** (OpenZeppelin `Ownable`), gates admin funding + config.

## Week definition
- ISO week (Mon 00:00 UTC → Sun 23:59:59 UTC). A single `weekKey` string `YYYY-Www` (e.g. `2026-W29`) is the canonical id used across DB + signatures.
- "First day of a new week" = the reward for the *previous* completed week becomes claimable once that week has ended. A backend cron finalizes the just-ended week.

---

## Part A — Smart contract (`blockchain/`)

New self-contained reward module added to `PongEscrow.sol` (no changes to existing match/stake logic).

### State
- `mapping(address => uint256) public rewardPool;` — funded balance per token (token = `address(0)` for native CELO).
- `mapping(bytes32 => bool) public weeklyRewardClaimed;` — key = `keccak256(weekKey, winner, token)` to prevent double-claim.

### Funding (deployer only)
- `function fundRewardPool(address token, uint256 amount) external payable onlyOwner` — native: require `msg.value == amount`; ERC-20: `safeTransferFrom(owner, this, amount)`. Increments `rewardPool[token]`. Emits `RewardPoolFunded`.
- `function withdrawRewardPool(address token, uint256 amount) external onlyOwner` — lets deployer reclaim unused funds. Emits `RewardPoolWithdrawn`.

### Claim (winner, oracle-signed)
- `function claimWeeklyReward(string calldata weekKey, address token, uint256 amount, bytes calldata signature) external nonReentrant whenNotPaused`
  - Verifies signature over `keccak256(abi.encode(block.chainid, address(this), "WEEKLY_REWARD", weekKey, msg.sender, token, amount))` recovered == `backendOracle` (reuses existing `ECDSA.toEthSignedMessageHash` pattern).
  - Requires `!weeklyRewardClaimed[key]`, `rewardPool[token] >= amount`.
  - Effects before interaction: mark claimed, `rewardPool[token] -= amount`, then `_transferTo(msg.sender, token, amount)`. Emits `WeeklyRewardClaimed`.
- `function isWeeklyRewardClaimed(string calldata weekKey, address winner, address token) external view returns (bool)`.

### Events
`RewardPoolFunded`, `RewardPoolWithdrawn`, `WeeklyRewardClaimed`.

### Tests (`blockchain/test/PongEscrow.t.sol`)
Add cases: fund pool (native + ERC-20), claim with valid sig, reject bad sig, reject double-claim, reject insufficient pool, reject wrong-week/wrong-token sig, owner-only funding/withdraw, reentrancy guard. Run full `forge test` (existing 88 must stay green).

### Deploy / verify
- Reward module is additive; **requires redeploy** of `PongEscrow` (new function selectors). Update `Deploy.s.sol` output notes. Verify on Celoscan per `evm-foundry` skill. Update deployed addresses in env for both testnet (11142220) and mainnet (42220).

---

## Part B — Backend (`backend/`)

### New model `WeeklyReward` (`src/models/WeeklyReward.js`)
Fields: `weekKey` (indexed), `walletAddress` (lowercase, indexed), `playerName`, `wins`, `token` (symbol), `tokenAddress`, `amount` (string, wei), `rank` (1 = top), `status` (`pending` | `claimed`), `claimTxHash`, `claimedAt`, `finalizedAt`. Compound unique index `{ weekKey, walletAddress }`.

### New config (`src/config/weeklyRewards.js`)
- `REWARD_AMOUNT` (env-configurable, cUSD, parsed to 18-decimal wei), `REWARD_TOKEN_ADDRESS` (cUSD address per network from env), `MIN_GAMES_FOR_ELIGIBILITY` (default **10**).

### New service `src/services/weeklyRewardService.js`
- `computeWeekWinner(weekKey)` — aggregates `Game` docs where `endedAt` in week range, `status: 'finished'`, tallies wins per winner wallet (resolve name→wallet via `Player`), applies the **10-games-played** threshold, tie-break by higher ELO then earliest `endedAt`. Returns top player.
- `finalizeWeek(weekKey)` — idempotent; creates a `WeeklyReward` row (`status: pending`) for the winner if one doesn't exist. Skips weeks with no eligible winner.
- `signWeeklyReward({ weekKey, walletAddress, tokenAddress, amount })` — reuses `signatureService`; produces the `"WEEKLY_REWARD"` signature matching the contract's `abi.encode` layout exactly.
- `getPendingRewardsForWallet(address)` and `getAdminSummary()` (all pending grouped by token with sums).

Extend `src/services/signatureService.js` with `signWeeklyReward` (same wallet/key as `signResult`).

### Cron (`src/server.js` or existing scheduler)
- Weekly job (Mon 00:07 UTC — off the :00 mark) calling `finalizeWeek(previousWeekKey)`. Also a lazy fallback: finalize-on-read if a past week is unfinalized.

### Routes (all wallet-session authenticated via `walletSessionService.authenticateToken`)
- `GET /rewards/weekly/me` — pending + claimed rewards for the authed wallet.
- `POST /rewards/weekly/:id/signature` — returns oracle signature + on-chain args for a pending reward owned by the authed wallet.
- `POST /rewards/weekly/:id/claimed` — records `claimTxHash`, flips to `claimed`.
- **Admin (owner-gated):** `GET /rewards/admin/summary` — all pending rewards + per-token totals to fund. Ownership verified by checking the authed wallet against on-chain `owner()` via the existing RPC provider (`escrowVerificationService` pattern).
- `GET /leaderboard/weekly` — current in-progress week standings (read-only, for UI).

### Tests (`backend/test/`)
`weeklyRewardService.test.js` — winner computation, tie-breaks, min-games threshold, idempotent finalize, signature shape. Follow existing jest patterns.

---

## Part C — Frontend (`frontend/`)

### Contract layer
- Add new ABI entries to `src/contracts/PongEscrow.js`: `fundRewardPool`, `withdrawRewardPool`, `claimWeeklyReward`, `rewardPool`, `isWeeklyRewardClaimed`, new events.
- Add hooks in `src/hooks/useContract.js`: `useClaimWeeklyReward`, `useFundRewardPool`, `useRewardPoolBalance` — reuse `minipayLegacyType()` and multi-token/decimals handling already present.

### Player-facing
- **Weekly leaderboard view** — new tab/section showing current-week standings (`GET /leaderboard/weekly`).
- **"My Rewards"** — lists each week the wallet topped the board (from `GET /rewards/weekly/me`), each with amount + a **Request Payout** button. Button flow: ensure wallet session → fetch signature → `claimWeeklyReward` tx → POST `/claimed`. Handles multiple historical weeks (claim now or later). Reuses `NotificationProvider` for status.

### Admin-facing (deployer)
- **Admin dashboard** shown only when connected wallet == on-chain `owner()`. Displays all pending payout requests, total cUSD owed, current cUSD `rewardPool` balance, and a **Fund Contract** action (cUSD approve → `fundRewardPool`). Security note: gated client-side by owner check AND server-side by owner-gated routes.

### Tests
Pure-util tests where practical (week-key formatting, reward arg builder) following the existing `src/utils/*.test.js` style. `react-scripts build` must compile clean.

---

## Part D — Config / docs
- Update `.env.example` (frontend + backend) with the new reward vars, split into the mainnet/testnet sections (aligns with existing backlog item).
- Update deployed contract addresses after redeploy.
- Add a short dev-note under `docs/dev-notes/`.
- `CHANGELOG.md` Unreleased entry.

---

## Sequencing
1. Contract: reward module + tests + local `forge test` green.
2. Deploy to Celo Sepolia, verify, wire testnet env.
3. Backend: model + service + signing + routes + cron + tests.
4. Frontend: ABI/hooks → player rewards UI → admin dashboard.
5. End-to-end on testnet (fund → finalize week → claim).
6. Mainnet redeploy + env, docs/changelog.

## Risks / open notes
- **Redeploy required** — new selectors mean a fresh `PongEscrow` address; existing in-flight matches on the old address are unaffected but the app points at the new one going forward.
- **Oracle key** remains the single trust root (same as today) — it now also authorizes weekly payouts.
- **Collusion/self-play** on win-count is mitigated (not eliminated) by the 10-games threshold; flagged for a future pass.
- Deployer must keep the cUSD pool funded or claims revert on `rewardPool[cUSD] >= amount`; admin summary surfaces the shortfall.
