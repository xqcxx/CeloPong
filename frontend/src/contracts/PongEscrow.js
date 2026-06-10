// PongEscrow Contract ABI + config — addresses come from env
import { PONG_ESCROW_ADDRESS, BLOCK_EXPLORER_URL } from '../config/env';

export { PONG_ESCROW_ADDRESS, BLOCK_EXPLORER_URL };

export const PONG_ESCROW_ABI = [
  // Constants
  {
    inputs: [],
    name: 'NATIVE_TOKEN',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'JOIN_TIMEOUT',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'CLAIM_TIMEOUT',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // View functions
  {
    inputs: [{ internalType: 'string', name: 'roomCode', type: 'string' }],
    name: 'getMatch',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'player1', type: 'address' },
          { internalType: 'address', name: 'player2', type: 'address' },
          { internalType: 'uint256', name: 'stakeAmount', type: 'uint256' },
          { internalType: 'address', name: 'stakeToken', type: 'address' },
          { internalType: 'address', name: 'winner', type: 'address' },
          { internalType: 'enum PongEscrow.MatchStatus', name: 'status', type: 'uint8' },
          { internalType: 'uint256', name: 'createdAt', type: 'uint256' },
          { internalType: 'uint256', name: 'completedAt', type: 'uint256' },
        ],
        internalType: 'struct PongEscrow.Match',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'roomCode', type: 'string' }],
    name: 'getMatchStatus',
    outputs: [{ internalType: 'enum PongEscrow.MatchStatus', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'roomCode', type: 'string' }],
    name: 'isRoomCodeAvailable',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'backendOracle',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Write functions — Multi-currency
  {
    inputs: [
      { internalType: 'string', name: 'roomCode', type: 'string' },
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'stakeAsPlayer1',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'roomCode', type: 'string' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'stakeAsPlayer2',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'roomCode', type: 'string' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'claimPrize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'roomCode', type: 'string' }],
    name: 'claimRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'roomCode', type: 'string' }],
    name: 'claimExpiredMatchRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Admin
  {
    inputs: [{ internalType: 'address', name: 'newOracle', type: 'address' }],
    name: 'updateBackendOracle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'string', name: 'roomCode', type: 'string' },
      { indexed: true, internalType: 'address', name: 'player1', type: 'address' },
      { indexed: true, internalType: 'address', name: 'stakeToken', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'stakeAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'MatchCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'string', name: 'roomCode', type: 'string' },
      { indexed: true, internalType: 'address', name: 'player2', type: 'address' },
      { indexed: true, internalType: 'address', name: 'stakeToken', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'totalPot', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'PlayerJoined',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'string', name: 'roomCode', type: 'string' },
      { indexed: true, internalType: 'address', name: 'winner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'stakeToken', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'PrizeClaimed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'string', name: 'roomCode', type: 'string' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: true, internalType: 'address', name: 'stakeToken', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'MatchRefunded',
    type: 'event',
  },
];

// Match status enum
export const MatchStatus = {
  NOT_CREATED: 0,
  PLAYER1_STAKED: 1,
  BOTH_STAKED: 2,
  COMPLETED: 3,
  REFUNDED: 4,
};

// Re-export currencies for convenience
export { CURRENCIES } from '../config/currencies';
