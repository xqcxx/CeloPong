# Auto Player — Automated Staked Match Runner

Simulates two funded wallets playing staked matches end-to-end: stake → challenge → join → backend declares winner → claim prize → boost functions.

---

## Setup

```bash
cd scripts/auto-player
cp .env.example .env
pnpm install
```

### .env

```bash
# Testnet
PRIVATE_KEY_1=0x...   # Player 1 (funded with staking currency)
PRIVATE_KEY_2=0x...   # Player 2 (funded with staking currency)

# Backend (must be running)
BACKEND_URL=http://localhost:8080

# For mainnet, also add:
CELO_MAINNET_RPC=https://forno.celo.org
MAINNET_PONG_ESCROW_ADDRESS=0xb2f6b1e7a2db0f9aa9ef7167b71620991a1506fc
MAINNET_cUSD=0x765DE816845861e75A25fCA122bb6898B8B1282a
# ... other mainnet token addresses as needed
```

---

## Run

### Testnet — 5 matches, 1 cUSD each

```bash
cd scripts/auto-player
node index.js --env testnet --currency cUSD --amount 1 --iterations 5
```

### Testnet — 10 matches, 0.01 CELO each

```bash
node index.js --env testnet --currency CELO --amount 0.01 --iterations 10
```

### Mainnet — 3 matches, 5 cUSD each

```bash
node index.js --env mainnet --currency cUSD --amount 5 --iterations 3
```

### Infinite matches

```bash
node index.js --env testnet --currency USDC --amount 10
```

---

## What Happens Per Match

```
1. Balance check (P1 & P2 must each have ≥ stake × 3)
2. P1 approves token (ERC-20 only) → stakes
3. P1 creates challenge (gas-only tx)
4. P2 accepts challenge (70% chance) → approves → stakes
5. Backend declares random winner → generates signature
6. Winner claims prize (2× stake) on-chain
7. Random boost: checkIn, dailyReward, gg, practice, reportMatch
8. Both player stats updated on leaderboard
```

~6-11 transactions per match.

---

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --currency` | `cUSD` | `CELO`, `cUSD`, `USDC`, or `USDT` |
| `-a, --amount` | `5` | Stake amount |
| `-i, --iterations` | `0` (infinite) | Number of matches |
| `-e, --env` | `testnet` | `testnet` or `mainnet` |

---

## Backend Requirement

The backend must be running and accessible at `BACKEND_URL`. Without it:
- Game records won't be created in the database
- Winner signatures won't be generated
- Leaderboard stats won't update
- Challenge board won't populate

For testnet: run `node backend/src/server.js` locally.  
For mainnet: the backend must be deployed (e.g., on Render at `https://celopong.onrender.com`).
