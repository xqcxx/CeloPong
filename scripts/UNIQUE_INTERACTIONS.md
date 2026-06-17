# Unique Interactions — DAU Booster

Uses a BIP-39 mnemonic to derive wallets by index, then fires a burst of no-parameter contract calls (checkIn, practiceMode, claimDailyReward) from each wallet to boost distinct active user counts.

## Quick Start

```bash
# Dry run — see gas cost before funding wallets
node scripts/unique-interactions.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --from 0 --to 99 \
  --function checkIn \
  --env testnet
```

```
══════════════════════════════════
  PONG-IT — Unique Interactions
  Env: testnet  |  Function: checkIn  |  Wallets: 100 (indices 0-99)
  Contract: 0xFbC138F3C64928FD43ddab6030B0cEF3DB1D2d5F
══════════════════════════════════

Sample addresses:
  [0] 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  [1] 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  ...
  and 95 more

┌ Gas Estimate ──────────────────────────┐
│ Estimated gas:             45000
│ Gas price:            50.00 gwei
│ With 10% buffer:              49500
│ Cost per wallet:      0.00247500 CELO
│ Total (100 wallets):    0.24750000 CELO
└────────────────────────────────────────┘

Dry run complete. Add --execute to send transactions.
Fund each wallet with at least 0.00247500 CELO.
```

## Fund the Wallets

The script shows the exact CELO needed per wallet. Send that amount to each derived address before executing.

**To see all derived addresses** (pipe to a file):

```bash
node -e "
const { mnemonicToAccount } = require('viem/accounts');
for (let i = 0; i <= 99; i++) {
  const a = mnemonicToAccount(process.env.WALLET_MNEMONIC, { addressIndex: i });
  console.log(a.address);
}
" > addresses.txt
```

You can then batch-fund them from a funded wallet via a simple script or cast.

## Execute

```bash
# With explicit mnemonic
node scripts/unique-interactions.js \
  --mnemonic "witch collapse practice feed shame open despair creek road again ice least" \
  --from 0 --to 99 \
  --function checkIn \
  --env testnet \
  --execute

# Or via env var (keeps mnemonic out of shell history)
WALLET_MNEMONIC="witch collapse practice feed shame open despair creek road again ice least" \
  node scripts/unique-interactions.js \
  --from 0 --to 99 \
  --function practiceMode \
  --env mainnet \
  --execute
```

Output:

```
[✓]   0 0xf39Fd6e5... 0xa1b2c3d4...
[✓]   1 0x70997970... 0xe5f6g7h8...
[✗]   2 0x3C44CdDd... insufficient funds
...
Done: 98 succeeded, 2 failed in 8.3s
```

Transactions fire in parallel (different wallets = different nonces). The script waits for all confirmations and prints a summary.

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
| `--gas-buffer` | `10` | Percent buffer on gas price (e.g., `20` = 20%) |

## Functions

| Function | No params | What it does |
|----------|-----------|-------------|
| `checkIn` | Yes | Daily activity streak — 1 per wallet per 24h |
| `practiceMode` | Yes | Practice counter — unlimited |
| `claimDailyReward` | Yes | Daily reward claim — 1 per wallet per 24h |

## Gas Strategy

- Reads current `eth_gasPrice` from the RPC
- Adds a configurable buffer (default 10%) to prevent underpriced rejects
- Uses legacy transactions (`gasPrice` field) for Celo compatibility

## Notes

- **Mnemonic security:** Use a dedicated mnemonic, not one holding real funds. Fund wallets only with the exact gas amount needed.
- **Batch funding:** After the dry run shows you the cost, fund all wallets via a script or cast. Trying to execute with unfunded wallets just reports failures for those indices.
- **Parallel execution:** All transactions fire at once. The RPC may throttle — if you see many failures, reduce the range size.
