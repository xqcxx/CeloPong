# Unique Interactions — DAU Booster

Fires a burst of no-parameter contract calls (`checkIn`, `practiceMode`, `claimDailyReward`) from mnemonic-derived wallets to boost distinct active user counts.

---

## Setup

```bash
cd CeloPong
npm install viem commander dotenv
```

---

## Dry Run — Calculate Gas Cost

Always run this first. It shows the exact CELO needed per wallet and the total.

### Testnet

```bash
node scripts/unique-interactions.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --from 0 --to 99 \
  --function checkIn \
  --env testnet
```

### Mainnet

```bash
node scripts/unique-interactions.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --from 0 --to 99 \
  --function checkIn \
  --env mainnet
```

**Output:**

```
══════════════════════════════════
  PONG-IT — Unique Interactions
  Env: testnet  |  Function: checkIn  |  Wallets: 100 (indices 0-99)
  Contract: 0xFbC138F3C64928FD43ddab6030B0cEF3DB1D2d5F
══════════════════════════════════

Sample addresses:
  [0] 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  ...

┌ Gas Estimate ──────────────────────────┐
│ Estimated gas:             45000
│ Gas price:            50.00 gwei
│ Cost per wallet:      0.00225000 CELO
│ Total (100 wallets):    0.22500000 CELO
└────────────────────────────────────────┘
```

---

## Fund the Wallets

Use the **[Batch Fund](batch-fund.md)** script to fund all wallets in one transaction:

```bash
# 1. Calculate batch fund cost
node scripts/batch-fund.js \
  --mnemonic "your phrase" \
  --source-index 0 --from 1 --to 99 \
  --amount 0.0025 --env testnet

# 2. Fund the source wallet with the total shown

# 3. Execute batch transfer
node scripts/batch-fund.js \
  --mnemonic "your phrase" \
  --source-index 0 --from 1 --to 99 \
  --amount 0.0025 --env testnet --execute
```

Or manually find all addresses:

```bash
node -e "
const { mnemonicToAccount } = require('viem/accounts');
for (let i = 0; i <= 99; i++) {
  const a = mnemonicToAccount('your phrase', { addressIndex: i });
  console.log(i, a.address);
}
"
```

---

## Execute

### Testnet

```bash
node scripts/unique-interactions.js \
  --mnemonic "your phrase" \
  --from 0 --to 99 \
  --function checkIn \
  --env testnet \
  --execute
```

### Mainnet

```bash
node scripts/unique-interactions.js \
  --mnemonic "your phrase" \
  --from 0 --to 99 \
  --function checkIn \
  --env mainnet \
  --execute
```

---

## Using an Env Var (keeps mnemonic out of shell history)

```bash
export WALLET_MNEMONIC="your phrase"
node scripts/unique-interactions.js --from 0 --to 99 --function practiceMode --env mainnet --execute
```

---

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --mnemonic` | `$WALLET_MNEMONIC` | BIP-39 phrase |
| `--from` | `0` | Start derivation index |
| `--to` | `9` | End index (inclusive) |
| `-f, --function` | `checkIn` | `checkIn`, `practiceMode`, or `claimDailyReward` |
| `-e, --env` | `testnet` | `testnet` or `mainnet` |
| `-x, --execute` | (off) | Send transactions (without = dry run) |
| `-r, --rpc` | Auto | Custom RPC URL |
| `--gas-buffer` | `10` | Percent buffer on gas price |
