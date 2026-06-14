const { ethers } = require('ethers');

const ESCROW_ABI = [
  'function getMatch(string roomCode) view returns ((address player1,address player2,uint256 stakeAmount,address stakeToken,address winner,uint8 status,uint256 createdAt,uint256 completedAt))',
  'function stakeAsPlayer2(string roomCode,uint256 amount) payable',
  'event PlayerJoined(string indexed roomCode,address indexed player2,address indexed stakeToken,uint256 totalPot,uint256 timestamp)'
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

  async getChainDiagnostics() {
    this.initialize();

    const [network, blockNumber, contractCode] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getBlockNumber(),
      this.provider.getCode(this.contractAddress)
    ]);

    return {
      chainId: Number(network.chainId),
      expectedChainId: process.env.CELO_CHAIN_ID
        ? Number(process.env.CELO_CHAIN_ID)
        : null,
      blockNumber,
      contractAddress: this.contractAddress,
      contractDeployed: contractCode !== '0x'
    };
  }

  async assertExpectedChain(clientChainId) {
    const diagnostics = await this.getChainDiagnostics();
    const configuredChainId = diagnostics.expectedChainId;
    const requestedChainId = clientChainId ? Number(clientChainId) : null;

    if (configuredChainId && diagnostics.chainId !== configuredChainId) {
      throw new Error(
        `Backend RPC chain mismatch: connected to ${diagnostics.chainId}, configured for ${configuredChainId}`
      );
    }

    if (requestedChainId && diagnostics.chainId !== requestedChainId) {
      throw new Error(
        `Network mismatch: wallet used chain ${requestedChainId}, but backend verifies chain ${diagnostics.chainId}`
      );
    }

    if (!diagnostics.contractDeployed) {
      throw new Error(
        `Escrow contract ${diagnostics.contractAddress} is not deployed on backend chain ${diagnostics.chainId}`
      );
    }

    return diagnostics;
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

  async findPlayerJoinedEvent(roomCode, expectedPlayer) {
    const latestBlock = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 20000);
    const filter = this.contract.filters.PlayerJoined(roomCode, expectedPlayer);
    const events = await this.contract.queryFilter(filter, fromBlock, latestBlock);
    return events.at(-1) || null;
  }

  isTransientReceiptError(error) {
    return error?.message?.includes('not confirmed yet') ||
      error?.message?.includes('details are still syncing');
  }

  async verifyPlayer2Stake({ roomCode, txHash, playerAddress, chainId }) {
    this.initialize();

    if (!ethers.isAddress(playerAddress)) {
      throw new Error('A valid player wallet address is required');
    }
    if (!ethers.isHexString(txHash, 32)) {
      throw new Error('A valid staking transaction hash is required');
    }

    const expectedPlayer = ethers.getAddress(playerAddress);
    await this.assertExpectedChain(chainId);

    try {
      const { transaction } = await this.fetchConfirmedStakeTransaction(txHash);
      if (!transaction.to ||
          ethers.getAddress(transaction.to) !== this.contractAddress) {
        throw new Error('Transaction was not sent to the escrow contract');
      }

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
    } catch (error) {
      if (!this.isTransientReceiptError(error)) {
        throw error;
      }

      await this.waitForPlayer2MatchState(roomCode, expectedPlayer);
      const joinedEvent = await this.findPlayerJoinedEvent(roomCode, expectedPlayer);
      if (!joinedEvent?.transactionHash) {
        throw new Error(
          'Player 2 is recorded on-chain, but the PlayerJoined transaction could not be resolved yet'
        );
      }

      return {
        player2Address: expectedPlayer.toLowerCase(),
        player2TxHash: joinedEvent.transactionHash
      };
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
