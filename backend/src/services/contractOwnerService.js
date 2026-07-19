const { ethers } = require('ethers');

const OWNER_ABI = ['function owner() view returns (address)'];
const OWNER_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedOwner = null;
let cachedAt = 0;

/**
 * Read the escrow contract's on-chain owner (cached briefly).
 * @returns {Promise<string>} lowercased owner address
 */
async function getContractOwner() {
  if (cachedOwner && Date.now() - cachedAt < OWNER_CACHE_TTL_MS) {
    return cachedOwner;
  }

  const rpcUrl = process.env.CELO_RPC_URL;
  const contractAddress = process.env.PONG_ESCROW_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    throw new Error('CELO_RPC_URL and PONG_ESCROW_ADDRESS are required for owner lookup');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(ethers.getAddress(contractAddress), OWNER_ABI, provider);
  const owner = (await contract.owner()).toLowerCase();

  cachedOwner = owner;
  cachedAt = Date.now();
  return owner;
}

/**
 * Whether the given wallet is the on-chain contract owner.
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */
async function isContractOwner(walletAddress) {
  if (!walletAddress || !ethers.isAddress(walletAddress)) return false;
  const owner = await getContractOwner();
  return walletAddress.toLowerCase() === owner;
}

module.exports = { getContractOwner, isContractOwner };
