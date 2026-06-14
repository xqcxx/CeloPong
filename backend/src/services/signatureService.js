const { ethers } = require('ethers');

const RESULT_REASON_CODES = Object.freeze({
  score: 0,
  forfeit: 1,
  disconnect_timeout: 2
});

function buildResultHash({
  chainId,
  contractAddress,
  roomCode,
  player1Address,
  player2Address,
  winnerAddress,
  score1,
  score2,
  resultReason
}) {
  const reason = RESULT_REASON_CODES[resultReason];
  if (reason === undefined) throw new Error(`Unsupported result reason: ${resultReason}`);

  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'string', 'string', 'address', 'address', 'address', 'uint8', 'uint8', 'uint8'],
    [
      BigInt(chainId),
      ethers.getAddress(contractAddress),
      'MATCH_RESULT',
      roomCode,
      ethers.getAddress(player1Address),
      ethers.getAddress(player2Address),
      ethers.getAddress(winnerAddress),
      score1,
      score2,
      reason
    ]
  );
  return ethers.keccak256(encoded);
}

class SignatureService {
  constructor() {
    this.wallet = null;
    this.initializeWallet();
  }

  initializeWallet() {
    const privateKey = process.env.SIGNING_WALLET_PRIVATE_KEY;

    if (!privateKey || privateKey === 'YOUR_PRIVATE_KEY_HERE') {
      console.error('⚠️  SIGNING_WALLET_PRIVATE_KEY not configured in .env');
      console.error('⚠️  Signature generation will be disabled');
      return;
    }

    try {
      this.wallet = new ethers.Wallet(privateKey);
      console.log('✅ Signature service initialized');
      console.log('📝 Signer address:', this.wallet.address);
    } catch (error) {
      console.error('❌ Failed to initialize signing wallet:', error.message);
    }
  }

  async signResult(result) {
    if (!this.wallet) {
      throw new Error('Signing wallet not initialized. Check SIGNING_WALLET_PRIVATE_KEY in .env');
    }

    const messageHash = buildResultHash(result);
    const signature = await this.wallet.signMessage(ethers.getBytes(messageHash));
    console.log('✅ Result signature generated:', {
      roomCode: result.roomCode,
      winner: result.winnerAddress,
      resultReason: result.resultReason,
      messageHash,
      signerAddress: this.wallet.address
    });
    return signature;
  }

  async signAbandonedRefund(roomCode, player1Address, player2Address, contractAddress, chainId) {
    if (!this.wallet) {
      throw new Error('Signature service not initialized');
    }

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'string', 'string', 'address', 'address'],
      [
        BigInt(chainId),
        ethers.getAddress(contractAddress),
        'ABANDONED_MATCH_REFUND',
        roomCode,
        ethers.getAddress(player1Address),
        ethers.getAddress(player2Address)
      ]
    );
    const messageHash = ethers.keccak256(encoded);
    return this.wallet.signMessage(ethers.getBytes(messageHash));
  }

  /**
   * Get the signer's Ethereum address
   * @returns {string|null} - Signer address or null if not initialized
   */
  getSignerAddress() {
    return this.wallet ? this.wallet.address : null;
  }

  /**
   * Check if signature service is ready
   * @returns {boolean}
   */
  isReady() {
    return this.wallet !== null;
  }
}

// Export singleton instance
module.exports = new SignatureService();
module.exports.RESULT_REASON_CODES = RESULT_REASON_CODES;
module.exports.buildResultHash = buildResultHash;
