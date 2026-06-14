const crypto = require('crypto');
const { ethers } = require('ethers');
const WalletSession = require('../models/WalletSession');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildMessage(walletAddress, challenge) {
  return [
    'PONG-IT wallet session',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Challenge: ${challenge}`,
    'This signature does not authorize a blockchain transaction.'
  ].join('\n');
}

async function createChallenge(walletAddress) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error('Valid wallet address is required');
  }

  const normalized = walletAddress.toLowerCase();
  const challenge = crypto.randomBytes(32).toString('hex');
  const challengeExpiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  await WalletSession.findOneAndUpdate(
    { walletAddress: normalized },
    {
      walletAddress: normalized,
      challenge,
      challengeExpiresAt,
      tokenHash: null,
      tokenExpiresAt: null
    },
    { upsert: true, new: true }
  );

  return {
    walletAddress: normalized,
    message: buildMessage(normalized, challenge),
    expiresAt: challengeExpiresAt
  };
}

async function verifyChallenge({ walletAddress, signature }) {
  if (!ethers.isAddress(walletAddress) || !signature) {
    throw new Error('Wallet address and signature are required');
  }

  const normalized = walletAddress.toLowerCase();
  const session = await WalletSession.findOne({ walletAddress: normalized });
  if (!session?.challenge || !session.challengeExpiresAt ||
      session.challengeExpiresAt.getTime() <= Date.now()) {
    throw new Error('Wallet challenge expired');
  }

  const recovered = ethers.verifyMessage(
    buildMessage(normalized, session.challenge),
    signature
  ).toLowerCase();
  if (recovered !== normalized) {
    throw new Error('Invalid wallet signature');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  session.challenge = null;
  session.challengeExpiresAt = null;
  session.tokenHash = tokenHash(token);
  session.tokenExpiresAt = expiresAt;
  await session.save();

  return { token, walletAddress: normalized, expiresAt };
}

async function authenticateToken(token) {
  if (!token) return null;

  const session = await WalletSession.findOne({
    tokenHash: tokenHash(token),
    tokenExpiresAt: { $gt: new Date() }
  }).lean();

  return session?.walletAddress || null;
}

module.exports = {
  createChallenge,
  verifyChallenge,
  authenticateToken
};
