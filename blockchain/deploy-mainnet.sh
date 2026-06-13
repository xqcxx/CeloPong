#!/bin/bash

# Deploy PongEscrow to Celo Mainnet
# ==================================================
# ⚠️  WARNING: This deploys to MAINNET with REAL CELO!
# ==================================================
# Prerequisites:
#   - Foundry installed (forge, cast)
#   - .env file with BACKEND_ORACLE_ADDRESS, CELO_MAINNET
#   - .env.enc with encrypted PRIVATE_KEY (use encrypt-env.js to create)
#   - REAL CELO in your wallet

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Deploying PongEscrow to Celo MAINNET"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will deploy to MAINNET!"
echo "   Real CELO will be spent for gas fees."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Load non-sensitive environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found!"
    echo "Create a .env file with:"
    echo "  BACKEND_ORACLE_ADDRESS=0x..."
    echo "  CELO_MAINNET=https://..."
    exit 1
fi

# Load encrypted PRIVATE_KEY (prompts for password)
DECRYPTED_FILE="$SCRIPT_DIR/.env.decrypted"
if [ -f .env.enc ]; then
    node "$SCRIPT_DIR/loadEncryptedEnv.js" "$DECRYPTED_FILE"
    source "$DECRYPTED_FILE"
    rm -f "$DECRYPTED_FILE"
else
    echo "Error: .env.enc not found!"
    echo "Create it with: node encrypt-env.js"
    exit 1
fi

# Validate required environment variables
if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY not loaded"
    exit 1
fi

if [ -z "$BACKEND_ORACLE_ADDRESS" ]; then
    echo "Error: BACKEND_ORACLE_ADDRESS not set in .env"
    exit 1
fi

if [ -z "$CELO_MAINNET" ]; then
    echo "Error: CELO_MAINNET RPC URL not set in .env"
    exit 1
fi

RPC_URL="$CELO_MAINNET"
echo "RPC: $RPC_URL"

DEPLOYER_ADDRESS=$(cast wallet address --private-key $PRIVATE_KEY)
echo "Deployer: $DEPLOYER_ADDRESS"

echo ""
echo "Balance:"
cast balance $DEPLOYER_ADDRESS --rpc-url "$RPC_URL"
echo ""

echo "Backend Oracle: $BACKEND_ORACLE_ADDRESS"
echo ""

# Final confirmation
read -p "Deploy with the above configuration? (yes/no): " FINAL_CONFIRM

if [ "$FINAL_CONFIRM" != "yes" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Compile
echo "--- Compiling ---"
forge build

# Deploy
echo ""
echo "--- Deploying ---"
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --gas-price 205000000000 \
    --legacy \
    -vvvv

echo ""
echo "Done."
echo ""
echo "Verify manually:"
echo "forge verify-contract <ADDRESS> src/PongEscrow.sol:PongEscrow \\"
echo "  --verifier etherscan \\"
echo "  --verifier-url \"https://api.etherscan.io/v2/api?chainid=42220\" \\"
echo "  --etherscan-api-key \$CELOSCAN_API_KEY \\"
echo "  --constructor-args \$(cast abi-encode \"constructor(address)\" $BACKEND_ORACLE_ADDRESS)"
