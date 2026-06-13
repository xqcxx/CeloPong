#!/bin/bash

# Deploy PongEscrow to Celo Sepolia Testnet
# ==========================================
# Prerequisites:
#   - Foundry installed (forge, cast)
#   - .env file with BACKEND_ORACLE_ADDRESS, CELO_SEPOLIA, CELOSCAN_API_KEY
#   - .env.enc with encrypted PRIVATE_KEY (use encrypt-env.js to create)
#   - Test CELO in your wallet

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Deploying PongEscrow to Celo Sepolia"
echo "=========================================="

# Load non-sensitive environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found!"
    echo "Create a .env file with:"
    echo "  BACKEND_ORACLE_ADDRESS=0x..."
    echo "  CELO_SEPOLIA=https://..."
    echo "  CELOSCAN_API_KEY=your_key"
    exit 1
fi

# Load encrypted PRIVATE_KEY (prompts for password)
DECRYPTED_FILE="$SCRIPT_DIR/.env.decrypted"
if [ -f .env.enc ]; then
    node "$SCRIPT_DIR/loadEncryptedEnv.js" "$DECRYPTED_FILE"
    export $(cat "$DECRYPTED_FILE" | xargs)
    rm -f "$DECRYPTED_FILE"
else
    echo "Error: .env.enc not found!"
    echo "Create it with: node encrypt-env.js"
    exit 1
fi

# Validate required environment variables
for var in PRIVATE_KEY BACKEND_ORACLE_ADDRESS CELO_SEPOLIA; do
    if [ -z "${!var}" ]; then
        echo "Error: $var not set"
        exit 1
    fi
done

RPC_URL="$CELO_SEPOLIA"
echo "RPC: $RPC_URL"

DEPLOYER_ADDRESS=$(cast wallet address --private-key $PRIVATE_KEY)
echo "Deployer: $DEPLOYER_ADDRESS"

echo ""
echo "Balance:"
cast balance $DEPLOYER_ADDRESS --rpc-url "$RPC_URL"
echo ""

echo "Backend Oracle: $BACKEND_ORACLE_ADDRESS"
echo ""

# Compile
echo "--- Compiling ---"
forge build

# Deploy
echo ""
echo "--- Deploying ---"
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "$RPC_URL" \
    --broadcast \
    -vvvv

echo ""
echo "Done."
echo ""
echo "Verify manually:"
echo "forge verify-contract <ADDRESS> src/PongEscrow.sol:PongEscrow \\"
echo "  --verifier etherscan \\"
echo "  --verifier-url https://api-sepolia.celoscan.io/api \\"
echo "  --constructor-args \$(cast abi-encode \"constructor(address)\" $BACKEND_ORACLE_ADDRESS)"
