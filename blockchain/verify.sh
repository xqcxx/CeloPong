#!/usr/bin/env bash
# Verify the live PongEscrow on Celo mainnet (Celoscan).
# Run from the blockchain/ directory:  bash verify.sh
set -euo pipefail

cd "$(dirname "$0")"

# Load verifier API keys from .env if present
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

ADDRESS="0x2809fab66b885e302ce83f0cefeadd289d019193"
ORACLE="0x348EA77e0794633789f831098EE26Cbb7f49FcC7"
VERIFIER_URL="${ETHERSCAN_VERIFIER_URL:-https://api.etherscan.io/v2/api?chainid=42220}"
VERIFIER_API_KEY="${ETHERSCAN_API_KEY:-${CELOSCAN_API_KEY:-}}"

# NOTE: the contract compiled with the optimizer DISABLED (foundry.toml sets no
# optimizer options), so we intentionally do NOT pass --num-of-optimizations.
forge verify-contract "$ADDRESS" \
  src/PongEscrow.sol:PongEscrow \
  --chain-id 42220 \
  --compiler-version 0.8.20 \
  --constructor-args "$(cast abi-encode "constructor(address)" "$ORACLE")" \
  --verifier etherscan \
  --verifier-url "$VERIFIER_URL" \
  --etherscan-api-key "${VERIFIER_API_KEY:?ETHERSCAN_API_KEY not set in environment or .env}" \
  --watch
