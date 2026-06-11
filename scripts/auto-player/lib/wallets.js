const { createPublicClient, createWalletClient, http, formatUnits, erc20Abi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { celo, celoSepolia } = require('viem/chains');
const config = require('./config');

const chain = config.IS_MAINNET ? celo : celoSepolia;

function createWallet(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain, transport: http(config.RPC_URL) });
  const publicClient = createPublicClient({ chain, transport: http(config.RPC_URL) });
  return { walletClient, publicClient, account };
}

async function getBalance(walletClient, publicClient, currencyConfig) {
  if (!currencyConfig.token) {
    // Native CELO
    const bal = await publicClient.getBalance({ address: walletClient.account.address });
    return formatUnits(bal, 18);
  }
  // ERC-20
  const bal = await publicClient.readContract({
    address: currencyConfig.token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletClient.account.address],
  });
  return formatUnits(bal, currencyConfig.decimals);
}

async function checkBalances(p1, p2, currencyConfig, required) {
  const bal1 = parseFloat(await getBalance(p1.walletClient, p1.publicClient, currencyConfig));
  const bal2 = parseFloat(await getBalance(p2.walletClient, p2.publicClient, currencyConfig));
  return {
    p1Balance: bal1.toFixed(2),
    p2Balance: bal2.toFixed(2),
    sufficient: bal1 >= required && bal2 >= required,
  };
}

module.exports = { createWallet, getBalance, checkBalances };
