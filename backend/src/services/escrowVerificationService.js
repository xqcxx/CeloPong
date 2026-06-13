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

  async verifyPlayer2Stake({ roomCode, txHash, playerAddress }) {
    this.initialize();

    if (!ethers.isAddress(playerAddress)) {
      throw new Error('A valid player wallet address is required');
    }
    if (!ethers.isHexString(txHash, 32)) {
      throw new Error('A valid staking transaction hash is required');
    }

    const [receipt, transaction] = await Promise.all([
      this.provider.getTransactionReceipt(txHash),
      this.provider.getTransaction(txHash)
    ]);

    if (!receipt || receipt.status !== 1) {
      throw new Error('Staking transaction is not confirmed');
    }
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

    const matchData = await this.contract.getMatch(roomCode);
    if (Number(matchData.status) !== 2 ||
        ethers.getAddress(matchData.player2) !== expectedPlayer) {
      throw new Error('On-chain match does not confirm this player as Player 2');
    }

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
