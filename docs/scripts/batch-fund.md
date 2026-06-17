# Batch Fund — One-Tx Multi-Wallet Funding

Funds N wallets in a single blockchain transaction using a deployed `BatchTransfer` contract.

**Saves gas** — 100 wallets funded in 1 tx instead of 100 txs. ~10,000 gas per recipient vs 21,000 base + 10,000 per separate tx.

---

## Contract Addresses

| Network | Address |
|---------|---------|
| Testnet | `0xa728e4ce91D3eacFBd2e1Cf87825e2CBdDD01491` |
| Mainnet | `0x766Cdaf791023C8e1EE212bD13be8A2C1bD26e00` |

---

## Setup

```bash
cd CeloPong
npm install viem commander dotenv
```

---

## Dry Run — Calculate Cost

### Testnet

```bash
node scripts/batch-fund.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --source-index 0 --from 1 --to 100 \
  --amount 0.003 --env testnet
```

### Mainnet

```bash
node scripts/batch-fund.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --source-index 0 --from 1 --to 100 \
  --amount 0.003 --env mainnet
```

**Output:**

```
══════════════════════════════════
  PONG-IT — Batch Fund
  Env: testnet  |  Recipients: 100 (indices 1-100)
  Source: index 0  |  Amount: 0.003 CELO each
  Batch contract: 0xa728e4ce91D3eacFBd2e1Cf87825e2CBdDD01491
══════════════════════════════════

Source:     [0] 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

┌ Summary ─────────────────────────────┐
│ Recipients:             100
│ Per recipient:        0.003 CELO
│ Total transfer:    0.300000 CELO
└──────────────────────────────────────┘

┌ Gas ─────────────────────────────────┐
│ Gas estimate:         1021000
│ Gas price:          50.00 gwei
│ Gas cost:           0.051050 CELO
│ Total needed:       0.351050 CELO
└──────────────────────────────────────┘

Dry run. Fund source wallet with 0.351050 CELO, then add --execute.
```

---

## Execute

### Testnet

```bash
node scripts/batch-fund.js \
  --mnemonic "your phrase" \
  --source-index 0 --from 1 --to 100 \
  --amount 0.003 --env testnet --execute
```

### Mainnet

```bash
node scripts/batch-fund.js \
  --mnemonic "your phrase" \
  --source-index 0 --from 1 --to 100 \
  --amount 0.003 --env mainnet --execute
```

---

## How It Works

1. Derives the **source wallet** from the mnemonic at `--source-index`
2. Derives **N destination wallets** from the mnemonic at indices `--from` through `--to`
3. Calls `batchTransferEqual(recipients, amount)` on the deployed contract
4. Contract loops through recipients, sending `amount` CELO to each
5. Refunds any excess CELO back to the sender

**One transaction, N transfers.**

---

## Max Recipients per Tx

Celo block gas limit: ~20-30M. The contract uses ~10,000 gas per recipient. Max:

| Recipients | Gas | % of block |
|------------|-----|------------|
| 100 | ~1M | 5% |
| 200 | ~2M | 10% |
| 500 | ~5M | 25% |
| 1,000 | ~10M | 50% |
| 2,000 | ~20M | 100% |

---

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `-m, --mnemonic` | `$WALLET_MNEMONIC` | BIP-39 phrase |
| `--source-index` | `0` | Index of funded source wallet |
| `--from` | `1` | First destination index |
| `--to` | (required) | Last destination index (inclusive) |
| `-a, --amount` | (required) | CELO per recipient |
| `-e, --env` | `testnet` | `testnet` or `mainnet` |
| `-x, --execute` | (off) | Send transaction |
| `-r, --rpc` | Auto | Custom RPC URL |

---

## Deploy to Mainnet

If the contract needs redeploying:

```bash
cd blockchain
source .env
node loadEncryptedEnv.js .env.decrypted
export $(cat .env.decrypted | xargs)
rm .env.decrypted

forge create src/BatchTransfer.sol:BatchTransfer --use solc:0.8.28 \
  --rpc-url https://forno.celo.org --private-key "$PRIVATE_KEY" \
  --broadcast --legacy --gas-price 210000000000
```

Update `BATCH_ADDRESSES.mainnet` in `scripts/batch-fund.js` with the new address.
