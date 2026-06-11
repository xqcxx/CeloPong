const { erc20Abi, parseUnits } = require('viem');
const config = require('./config');

const PONG_ESCROW_ABI = [
  { inputs: [], name: 'NATIVE_TOKEN', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'stakeAsPlayer1', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }, { name: 'amount', type: 'uint256' }], name: 'stakeAsPlayer2', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }, { name: 'signature', type: 'bytes' }], name: 'claimPrize', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'checkIn', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claimDailyReward', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }], name: 'gg', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'practiceMode', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'createChallenge', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }], name: 'acceptChallenge', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'roomCode', type: 'string' }, { name: 'score1', type: 'uint8' }, { name: 'score2', type: 'uint8' }], name: 'reportMatch', outputs: [], stateMutability: 'nonpayable', type: 'function' },
];

async function approveToken(wallet, publicClient, tokenAddress, spender, amount, decimals, feeCurrency) {
  const amountWei = parseUnits(amount, decimals);
  const writeOpts = {
    account: wallet.account, address: tokenAddress, abi: erc20Abi,
    functionName: 'approve', args: [spender, amountWei],
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function stakeAsPlayer1(wallet, publicClient, roomCode, currency, amount) {
  const amountWei = currency.token ? parseUnits(amount, currency.decimals) : 0n;
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'stakeAsPlayer1',
    args: [roomCode, currency.token || '0x0000000000000000000000000000000000000000', amountWei],
  };
  if (!currency.token) writeOpts.value = parseUnits(amount, 18);
  if (currency.adapter) writeOpts.feeCurrency = currency.adapter;
  else if (currency.token) writeOpts.feeCurrency = currency.token;

  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function stakeAsPlayer2(wallet, publicClient, roomCode, currency, amount) {
  const amountWei = currency.token ? parseUnits(amount, currency.decimals) : 0n;
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'stakeAsPlayer2', args: [roomCode, amountWei],
  };
  if (!currency.token) writeOpts.value = parseUnits(amount, 18);
  if (currency.adapter) writeOpts.feeCurrency = currency.adapter;
  else if (currency.token) writeOpts.feeCurrency = currency.token;

  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function claimPrize(wallet, publicClient, roomCode, signature, currency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'claimPrize', args: [roomCode, signature],
  };
  if (currency) {
    if (currency.adapter) writeOpts.feeCurrency = currency.adapter;
    else if (currency.token) writeOpts.feeCurrency = currency.token;
  }
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

// Boost functions — feeCurrency optional for gas payment
async function checkIn(wallet, publicClient, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'checkIn',
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function claimDailyReward(wallet, publicClient, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'claimDailyReward',
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function sendGG(wallet, publicClient, roomCode, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'gg', args: [roomCode],
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function practiceMode(wallet, publicClient, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'practiceMode',
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function createChallenge(wallet, publicClient, roomCode, currency, amount, feeCurrency) {
  const amountWei = parseUnits(amount, currency.decimals || 18);
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'createChallenge',
    args: [roomCode, currency.token || '0x0000000000000000000000000000000000000000', amountWei],
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function acceptChallenge(wallet, publicClient, roomCode, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'acceptChallenge', args: [roomCode],
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function reportMatch(wallet, publicClient, roomCode, score1, score2, feeCurrency) {
  const writeOpts = {
    account: wallet.account, address: config.PONG_ESCROW_ADDRESS, abi: PONG_ESCROW_ABI,
    functionName: 'reportMatch', args: [roomCode, score1, score2],
  };
  if (feeCurrency) writeOpts.feeCurrency = feeCurrency;
  const hash = await wallet.walletClient.writeContract(writeOpts);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

module.exports = { approveToken, stakeAsPlayer1, stakeAsPlayer2, claimPrize, checkIn, claimDailyReward, sendGG, practiceMode, createChallenge, acceptChallenge, reportMatch };
