#!/usr/bin/env node
const { program } = require('commander');
const { createPublicClient, createWalletClient, http, parseEther, formatEther } = require('viem');
const { celo, celoSepolia } = require('viem/chains');
const { mnemonicToAccount } = require('viem/accounts');

const BATCH_ABI = [{
  inputs: [{ name: 'recipients', type: 'address[]' }, { name: 'amount', type: 'uint256' }],
  name: 'batchTransferEqual', outputs: [], stateMutability: 'payable', type: 'function',
}];

const BATCH_ADDRESSES = {
  testnet: '0xa728e4ce91D3eacFBd2e1Cf87825e2CBdDD01491',
  mainnet: '', // Fill after mainnet deploy
};

const DEFAULT_RPC = {
  testnet: 'https://celo-sepolia.g.alchemy.com/v2/oA3aWf4dW3KozyXiBJ5TiZHnXtykfedo',
  mainnet: 'https://forno.celo.org',
};

program
  .option('-m, --mnemonic <phrase>', 'BIP-39 mnemonic', process.env.WALLET_MNEMONIC)
  .option('--source-index <n>', 'Mnemonic index of funded wallet', '0')
  .option('--from <n>', 'First destination index', '1')
  .option('--to <n>', 'Last destination index (inclusive)')
  .option('-a, --amount <n>', 'CELO to send per recipient')
  .option('-e, --env <e>', 'testnet | mainnet', 'testnet')
  .option('-x, --execute', 'Execute transfer (without = dry run)')
  .option('-r, --rpc <url>', 'Custom RPC URL')
  .parse(process.argv);

const opts = program.opts();
const env = opts.env;
const rpcUrl = opts.rpc || DEFAULT_RPC[env];
const chain = env === 'mainnet' ? celo : celoSepolia;
const batchAddress = BATCH_ADDRESSES[env];

const startIdx = parseInt(opts.from);
const endIdx = parseInt(opts.to);
const sourceIdx = parseInt(opts.sourceIndex);
const count = endIdx - startIdx + 1;
const amount = opts.amount;

const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

if (!opts.mnemonic) { console.error('Missing --mnemonic or WALLET_MNEMONIC'); process.exit(1); }
if (!opts.to) { console.error('Missing --to'); process.exit(1); }
if (!opts.amount) { console.error('Missing --amount'); process.exit(1); }
if (!batchAddress) {
  console.error(`No BatchTransfer contract for ${env}. Deploy first:`);
  console.error(`forge create src/BatchTransfer.sol:BatchTransfer --use solc:0.8.28 --rpc-url ${rpcUrl} --private-key \$KEY --broadcast --legacy`);
  process.exit(1);
}

async function main() {
  console.log(COLORS.cyan('══════════════════════════════════'));
  console.log(COLORS.cyan('  PONG-IT — Batch Fund'));
  console.log(COLORS.dim(`  Env: ${env}  |  Recipients: ${count} (indices ${startIdx}-${endIdx})`));
  console.log(COLORS.dim(`  Source: index ${sourceIdx}  |  Amount: ${amount} CELO each`));
  console.log(COLORS.dim(`  Batch contract: ${batchAddress}`));
  console.log(COLORS.cyan('══════════════════════════════════\n'));

  // Derive source wallet
  const sourceAcc = mnemonicToAccount(opts.mnemonic, { addressIndex: sourceIdx });
  console.log(COLORS.green(`Source:     [${sourceIdx}] ${sourceAcc.address}`));

  // Derive destination wallets
  const destinations = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const a = mnemonicToAccount(opts.mnemonic, { addressIndex: i });
    destinations.push(a.address);
  }

  console.log(COLORS.dim('Destination samples:'));
  for (const a of destinations.slice(0, 5)) console.log(COLORS.dim(`  ${a}`));
  if (count > 5) console.log(COLORS.dim(`  ... and ${count - 5} more`));

  const totalCELO = parseFloat(amount) * count;
  console.log('');
  console.log(`┌ Summary ─────────────────────────────┐`);
  console.log(`│ Recipients:        ${count.toString().padStart(8)}`);
  console.log(`│ Per recipient:     ${amount.toString().padStart(8)} CELO`);
  console.log(`│ Total transfer:    ${totalCELO.toFixed(6).padStart(8)} CELO`);
  console.log(`└──────────────────────────────────────┘`);

  // Gas estimate for the batch tx
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const gasPrice = await publicClient.getGasPrice();

  let gasEstimate = 21000n + BigInt(count) * 10000n; // rough: base + 10k per recipient
  try {
    gasEstimate = await publicClient.estimateGas({
      account: sourceAcc.address,
      to: batchAddress,
      data: '0x' + require('viem').encodeFunctionData({
        abi: BATCH_ABI, functionName: 'batchTransferEqual',
        args: [destinations, parseEther(amount)],
      }).slice(2),
      value: parseEther(totalCELO.toFixed(18)),
    });
  } catch (e) { /* use rough estimate */ }

  const gasCost = gasEstimate * gasPrice;
  const totalNeeded = parseEther(totalCELO.toFixed(18)) + gasCost;

  console.log(`\n┌ Gas ─────────────────────────────────┐`);
  console.log(`│ Gas estimate:       ${gasEstimate.toString().padStart(10)}`);
  console.log(`│ Gas price:          ${(Number(gasPrice) / 1e9).toFixed(2)} gwei`);
  console.log(`│ Gas cost:           ${formatEther(gasCost).padStart(10)} CELO`);
  console.log(`│ Total needed:       ${formatEther(totalNeeded).padStart(10)} CELO`);
  console.log(`└──────────────────────────────────────┘`);

  if (!opts.execute) {
    console.log(`\n${COLORS.yellow('Dry run.')} Fund source wallet with ${COLORS.green(formatEther(totalNeeded))} CELO, then add ${COLORS.green('--execute')}.`);
    return;
  }

  // Execute batch transfer
  console.log(`\n${COLORS.green('Executing batch transfer...')}`);

  const walletClient = createWalletClient({
    account: sourceAcc,
    chain,
    transport: http(rpcUrl),
  });

  try {
    const hash = await walletClient.writeContract({
      address: batchAddress,
      abi: BATCH_ABI,
      functionName: 'batchTransferEqual',
      args: [destinations, parseEther(amount)],
      value: parseEther(totalCELO.toFixed(18)),
      gasPrice,
    });

    console.log(`${COLORS.green('Tx:')} ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    console.log(`${COLORS.green('Confirmed')} — ${count} transfers in 1 tx (block ${receipt.blockNumber})`);
  } catch (e) {
    console.error(COLORS.red('Failed:'), e.message?.slice(0, 200) || e);
  }
}

main().catch(e => { console.error(COLORS.red('Fatal:'), e.message || e); process.exit(1); });
