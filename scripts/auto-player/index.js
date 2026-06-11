#!/usr/bin/env node
const { program } = require('commander');
const config = require('./lib/config');
const { createWallet, checkBalances } = require('./lib/wallets');
const { approveToken, stakeAsPlayer1, stakeAsPlayer2, claimPrize, checkIn, claimDailyReward, sendGG, practiceMode, createChallenge, acceptChallenge, reportMatch } = require('./lib/contract');
const { createGame, getGame, updatePlayer } = require('./lib/backend');
const { getName } = require('./lib/names');
const { log, matchHeader, step, winner, done, balances, colors } = require('./lib/logger');
const { shuffle, maybe, pickWinner, roomCode } = require('./lib/random');

program
  .option('-c, --currency <c>', 'Staking currency: cUSD, USDC, USDT, CELO', 'cUSD')
  .option('-a, --amount <n>', 'Stake amount', '5')
  .option('-i, --iterations <n>', 'Number of matches (0 = infinite)', '0')
  .option('-e, --env <e>', 'Environment: testnet | mainnet', 'testnet')
  .parse(process.argv);

const opts = program.opts();
const currencyKey = opts.currency;
const stakeAmount = opts.amount;
const maxIters = parseInt(opts.iterations) || Infinity;

const currency = config.CURRENCIES[currencyKey];
if (!currency) {
  console.error(`Unknown currency: ${currencyKey}. Use: CELO, cUSD, USDC, USDT`);
  process.exit(1);
}

// Fee currency for gas payment (Celo CIP-64)
// adapter for 6-decimal tokens, token address for 18-dec, null for native CELO
const feeCurrency = currency.adapter || currency.token || null;

const p1Key = process.env.PRIVATE_KEY_1;
const p2Key = process.env.PRIVATE_KEY_2;
if (!p1Key || !p2Key) {
  console.error('PRIVATE_KEY_1 and PRIVATE_KEY_2 must be set in .env');
  process.exit(1);
}

if (!config.PONG_ESCROW_ADDRESS) {
  console.error('PongEscrow address not configured for this environment');
  process.exit(1);
}

const ESCROW_ADDR = config.PONG_ESCROW_ADDRESS;
const requiredMargin = parseFloat(stakeAmount) * 3;

async function main() {
  console.log(colors.cyan('══════════════════════════════════════'));
  console.log(colors.cyan('  PONG-IT Auto-Player'));
  console.log(colors.dim(`  Env: ${config.ENV}  |  Currency: ${currencyKey}  |  Stake: ${stakeAmount}`));
  console.log(colors.dim(`  Contract: ${ESCROW_ADDR}`));
  console.log(colors.dim(`  Backend: ${config.BACKEND_URL}`));
  console.log(colors.cyan('══════════════════════════════════════\n'));

  const wallet1 = createWallet(p1Key);
  const wallet2 = createWallet(p2Key);

  const name1 = getName(wallet1.account.address);
  const name2 = getName(wallet2.account.address);

  log(`${colors.green('P1')}: ${wallet1.account.address.slice(0, 10)}...  ${colors.magenta(name1)}`);
  log(`${colors.blue('P2')}: ${wallet2.account.address.slice(0, 10)}...  ${colors.magenta(name2)}`);
  log('');

  let iter = 0;
  while (iter < maxIters) {
    iter++;
    const startTime = Date.now();
    matchHeader(iter, maxIters === Infinity ? null : maxIters);

    const code = roomCode();
    step('📋', `Room: ${code} | ${stakeAmount} ${currencyKey}`);

    // ── Balance check ──
    const { p1Balance, p2Balance, sufficient } = await checkBalances(wallet1, wallet2, currency, requiredMargin);
    if (!sufficient) {
      log(colors.red(`  STOP: Insufficient balance. P1=${p1Balance} P2=${p2Balance} ${currencyKey} (need ≥${requiredMargin})`));
      break;
    }

    // ── Player 1 stake ──
    try {
      if (currency.token) {
        const { hash } = await approveToken(wallet1, wallet1.publicClient, currency.token, ESCROW_ADDR, stakeAmount, currency.decimals, feeCurrency);
        step('✅', `${name1} approved ${stakeAmount} ${currencyKey}`, hash);
      }
      const { hash: s1Hash } = await stakeAsPlayer1(wallet1, wallet1.publicClient, code, currency, stakeAmount);
      step('💰', `${name1} staked ${stakeAmount} ${currencyKey}`, s1Hash);

      await createGame({
        roomCode: code,
        player1: { name: name1, rating: 800 },
        isStaked: true,
        stakeAmount,
        stakeCurrency: currencyKey,
        player1Address: wallet1.account.address,
        player1TxHash: s1Hash,
        status: 'waiting',
      });
    } catch (e) {
      step('❌', `${name1} stake failed: ${e.message}`);
      continue;
    }

    // ── Challenge ──
    try {
      const { hash: chHash } = await createChallenge(wallet1, wallet1.publicClient, code, currency, stakeAmount, feeCurrency);
      step('📢', `${name1} created challenge`, chHash);
    } catch (e) {
      step('⚠️', `Challenge creation failed: ${e.message}`);
    }

    // ── Player 2 joins ──
    const useChallengeFlow = maybe(0.3); // 70% challenge flow, 30% direct
    try {
      if (useChallengeFlow) {
        const { hash: acHash } = await acceptChallenge(wallet2, wallet2.publicClient, code);
        step('🤝', `${name2} accepted challenge`, acHash);
      }

      if (currency.token) {
        const { hash } = await approveToken(wallet2, wallet2.publicClient, currency.token, ESCROW_ADDR, stakeAmount, currency.decimals, feeCurrency);
        step('✅', `${name2} approved ${stakeAmount} ${currencyKey}`, hash);
      }
      const { hash: s2Hash } = await stakeAsPlayer2(wallet2, wallet2.publicClient, code, currency, stakeAmount);
      step('💰', `${name2} staked ${stakeAmount} ${currencyKey}`, s2Hash);

      await createGame({
        roomCode: code,
        player2: { name: name2, rating: 800 },
        player2Address: wallet2.account.address,
        player2TxHash: s2Hash,
        status: 'ready',
      });
    } catch (e) {
      step('❌', `${name2} join failed: ${e.message}`);
      continue;
    }

    // ── Winner selection ──
    const whichWinner = pickWinner();
    const winnerWallet = whichWinner === 'player1' ? wallet1 : wallet2;
    const winnerName = whichWinner === 'player1' ? name1 : name2;
    const winnerAddress = winnerWallet.account.address;
    const scoreStr = whichWinner === 'player1' ? '5-2' : '2-5';
    const scoreArr = whichWinner === 'player1' ? [5, 2] : [2, 5];

    winner(winnerName, scoreStr);

    // ── Backend declares winner ──
    let signature;
    try {
      await createGame({
        roomCode: code,
        winner: whichWinner,
        winnerAddress,
        score: { player1: scoreArr[0], player2: scoreArr[1] },
        status: 'finished',
      });
      step('🔐', 'Backend signed winner');

      // Small wait for DB write
      await new Promise(r => setTimeout(r, 500));

      const game = await getGame(code);
      signature = game.winnerSignature;
      if (!signature) {
        step('⚠️', 'No signature from backend — retrying...');
        await new Promise(r => setTimeout(r, 1000));
        const retry = await getGame(code);
        signature = retry.winnerSignature;
      }
    } catch (e) {
      step('❌', `Backend declare failed: ${e.message}`);
      continue;
    }

    if (!signature) {
      step('❌', 'Failed to get winner signature');
      continue;
    }

    // ── Update player stats on leaderboard ──
    try {
      const loserName = whichWinner === 'player1' ? name2 : name1;
      await updatePlayer(winnerName, 'win');
      await updatePlayer(loserName, 'loss');
      step('📊', 'Leaderboard updated');
    } catch (e) {
      step('⚠️', `Leaderboard update failed: ${e.message}`);
    }

    // ── Winner claims ──
    try {
      const { hash: clHash } = await claimPrize(winnerWallet, winnerWallet.publicClient, code, signature, currency);
      step('🎁', `${winnerName} claimed ${parseFloat(stakeAmount) * 2} ${currencyKey}`, clHash);
    } catch (e) {
      step('❌', `Claim failed: ${e.message}`);
      continue;
    }

    // ── Boost functions ──
    const boostActions = [
      { fn: (w, p) => checkIn(w, p, feeCurrency),        name: 'checkIn',       skip: 0.05 },
      { fn: (w, p) => claimDailyReward(w, p, feeCurrency), name: 'dailyReward', skip: 0.05 },
      { fn: (w, p) => sendGG(w, p, code, feeCurrency),   name: 'gg',           skip: 0.15 },
      { fn: (w, p) => practiceMode(w, p, feeCurrency),    name: 'practice',     skip: 0.30 },
      { fn: (w, p) => reportMatch(w, p, code, scoreArr[0], scoreArr[1], feeCurrency), name: 'reportMatch', skip: 0.10 },
    ];

    const shuffled = shuffle(boostActions);
    const boostLog = [];
    for (const action of shuffled) {
      if (!maybe(action.skip)) continue;
      for (const w of [wallet1, wallet2]) {
        // GG and reportMatch: both players can do it
        try {
          const { hash } = await action.fn(w, w.publicClient);
          boostLog.push(`${action.name}(${w === wallet1 ? 'P1' : 'P2'})`);
        } catch (e) {
          // Silently skip boost failures
        }
      }
    }
    if (boostLog.length > 0) {
      log(colors.dim(`  Boost: ${boostLog.join(' ')}`));
    }

    // ── Balances ──
    const { p1Balance: b1, p2Balance: b2 } = await checkBalances(wallet1, wallet2, currency, 0);
    balances(b1, b2, currencyKey);
    done(Date.now() - startTime);
  }

  console.log(`\n${colors.green('══════════════════════')}`);
  console.log(`${colors.green('  Complete!')}  ${colors.dim(`Rounds: ${iter}`)}`);
  console.log(`${colors.green('══════════════════════')}\n`);
}

main().catch(e => {
  console.error(colors.red('Fatal:'), e);
  process.exit(1);
});
