# Auto-Player

Automated game flow runner for PONG-IT on Celo. Simulates two funded wallets playing staked matches end-to-end: stake → challenge → join → backend declares winner → claim prize → boost functions.

## Setup

```bash
cd scripts/auto-player
pnpm install

# Copy and fill .env
cp .env.example .env
# Edit: PRIVATE_KEY_1, PRIVATE_KEY_2, and optionally mainnet addresses

# Run (testnet, 10 matches, 5 cUSD)
node index.js --env testnet --currency cUSD --amount 5 --iterations 10
```

## CLI

```
node index.js [options]

Options:
  -c, --currency <c>    cUSD | USDC | USDT | CELO        (default: cUSD)
  -a, --amount <n>      Stake amount                      (default: 5)
  -i, --iterations <n>  Number of matches, 0 = infinite   (default: infinite)
  -e, --env <e>         testnet | mainnet                 (default: testnet)
```

## Flow Per Match

1. Balance check (P1 & P2 must each have ≥ stake × 3)
2. P1 approves token (ERC-20) → stakes → creates challenge
3. P2 accepts challenge (70%) or joins direct (30%) → approves → stakes
4. Backend declares random winner → generates signature
5. Winner claims prize (2× stake)
6. Random boost: checkIn, dailyReward, gg, practice, reportMatch
7. Display balances

## Txs Per Match

~6-11 transactions depending on challenge flow and boost skip rolls.
