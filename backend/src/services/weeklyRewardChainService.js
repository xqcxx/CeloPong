const { ethers } = require('ethers');

// Minimal read-only view into the escrow's weekly reward accounting.
const REWARD_ABI = [
  'function getApprovedReward(string weekKey, address player, address token) view returns (uint256 amount, bool withdrawn)'
];

let provider = null;
let contract = null;

function getContract() {
  if (contract) return contract;

  const rpcUrl = process.env.CELO_RPC_URL;
  const contractAddress = process.env.PONG_ESCROW_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    throw new Error('CELO_RPC_URL and PONG_ESCROW_ADDRESS are required for reward reconciliation');
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);
  contract = new ethers.Contract(ethers.getAddress(contractAddress), REWARD_ABI, provider);
  return contract;
}

/**
 * Read the on-chain approval state for a single reward.
 * @param {string} weekKey
 * @param {string} player - wallet address
 * @param {string} token - token address (native uses the zero address)
 * @returns {Promise<{ amount: bigint, withdrawn: boolean }>}
 */
async function getApprovedReward(weekKey, player, token) {
  const tokenAddress = token && token !== ''
    ? ethers.getAddress(token)
    : ethers.ZeroAddress;
  const [amount, withdrawn] = await getContract().getApprovedReward(
    weekKey,
    ethers.getAddress(player),
    tokenAddress
  );
  return { amount, withdrawn };
}

module.exports = { getApprovedReward };
