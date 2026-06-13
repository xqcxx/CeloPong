const { ethers } = require('ethers');

const ESCROW_ABI = [
  'function getMatch(string roomCode) view returns ((address player1,address player2,uint256 stakeAmount,address stakeToken,address winner,uint8 status,uint256 createdAt,uint256 completedAt))',
  'function stakeAsPlayer2(string roomCode,uint256 amount) payable'
];

class EscrowVerificationService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.contractAddress = null;
    this.interface = new ethers.Interface(ESCROW_ABI);
    this.receiptRetryAttempts = 12;
    this.receiptRetryDelayMs = 2500;
  }

  initialize() {
    if (this.contract) return;

    const rpcUrl = process.env.CELO_RPC_URL;
    const contractAddress = process.env.PONG_ESCROW_ADDRESS;
    if (!rpcUrl || !contractAddress) {
      throw new Error('CELO_RPC_URL and PONG_ESCROW_ADDRESS are required for stake verification');
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = ethers.getAddress(contractAddress);
    this.contract = new ethers.Contract(this.contractAddress, ESCROW_ABI, this.provider);
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchConfirmedStakeTransaction(txHash) {
    let lastReceipt = null;
    let lastTransaction = null;

    for (let attempt = 0; attempt < this.receiptRetryAttempts; attempt += 1) {
      const [receipt, transaction] = await Promise.all([
        this.provider.getTransactionReceipt(txHash),
        this.provider.getTransaction(txHash)
      ]);

      lastReceipt = receipt;
      lastTransaction = transaction;

      if (receipt?.status === 1 && transaction) {
        return { receipt, transaction };
      }

      if (receipt && receipt.status === 0) {
        throw new Error('Staking transaction failed on-chain');
      }

      if (attempt < this.receiptRetryAttempts - 1) {
        await this.sleep(this.receiptRetryDelayMs);
      }
    }

    if (!lastReceipt || lastReceipt.status !== 1) {
      throw new Error('Staking transaction is not confirmed yet. Retry verification in a few seconds.');
    }

    throw new Error('Staking transaction details are still syncing. Retry verification in a few seconds.');
  }

  async waitForPlayer2MatchState(roomCode, expectedPlayer) {
    let lastMatchData = null;

    for (let attempt = 0; attempt < this.receiptRetryAttempts; attempt += 1) {
      lastMatchData = await this.contract.getMatch(roomCode);

      if (
        Number(lastMatchData.status) === 2 &&
        ethers.getAddress(lastMatchData.player2) === expectedPlayer
      ) {
        return lastMatchData;
      }

      if (attempt < this.receiptRetryAttempts - 1) {
        await this.sleep(this.receiptRetryDelayMs);
      }
    }

    if (lastMatchData && Number(lastMatchData.status) >= 2) {
      throw new Error('On-chain match state does not confirm this wallet as Player 2');
    }

    throw new Error('Stake is mined but the match state is still syncing. Retry verification in a few seconds.');
  }

  async verifyPlayer2Stake({ roomCode, txHash, playerAddress }) {
    this.initialize();

    if (!ethers.isAddress(playerAddress)) {
      throw new Error('A valid player wallet address is required');
    }
    if (!ethers.isHexString(txHash, 32)) {
      throw new Error('A valid staking transaction hash is required');
    }

    const { transaction } = await this.fetchConfirmedStakeTransaction(txHash);
    if (!transaction || !transaction.to ||
        ethers.getAddress(transaction.to) !== this.contractAddress) {
      throw new Error('Transaction was not sent to the escrow contract');
    }

    const expectedPlayer = ethers.getAddress(playerAddress);
    if (ethers.getAddress(transaction.from) !== expectedPlayer) {
      throw new Error('Transaction sender does not match the connected wallet');
    }

    const parsed = this.interface.parseTransaction({
      data: transaction.data,
      value: transaction.value
    });
    if (!parsed || parsed.name !== 'stakeAsPlayer2' || parsed.args[0] !== roomCode) {
      throw new Error('Transaction does not stake for this room');
    }

    await this.waitForPlayer2MatchState(roomCode, expectedPlayer);

    return {
      player2Address: expectedPlayer.toLowerCase(),
      player2TxHash: txHash
    };
  }

  async verifyRefund({ roomCode, playerAddress }) {
    this.initialize();

    if (!ethers.isAddress(playerAddress)) {
      throw new Error('A valid player wallet address is required');
    }

    const expectedPlayer = ethers.getAddress(playerAddress);
    const matchData = await this.contract.getMatch(roomCode);
    if (Number(matchData.status) !== 4) {
      throw new Error('Match has not been refunded on-chain');
    }
    if (ethers.getAddress(matchData.player1) !== expectedPlayer) {
      throw new Error('Connected wallet is not Player 1 for this match');
    }

    return true;
  }
}

module.exports = new EscrowVerificationService();
