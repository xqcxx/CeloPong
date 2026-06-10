// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PongEscrow
 * @notice Escrow contract for PONG-IT staking matches
 * @dev Multi-currency: native CELO (address(0)) or any ERC-20 token.
 *      Creator picks the token; joiner must match it.
 *      Pull-based payouts with backend signature verification.
 */
contract PongEscrow is ReentrancyGuard, Pausable, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @dev Sentinel address representing native CELO (no ERC-20)
    address public constant NATIVE_TOKEN = address(0);

    // ============ Structs ============

    struct Match {
        address player1;
        address player2;
        uint256 stakeAmount;
        address stakeToken; // address(0) = native CELO, else ERC-20
        address winner;
        MatchStatus status;
        uint256 createdAt;
        uint256 completedAt;
    }

    enum MatchStatus {
        NOT_CREATED,    // 0 — Default state
        PLAYER1_STAKED, // 1 — Player 1 has staked, waiting for player 2
        BOTH_STAKED,    // 2 — Both players staked, game in progress
        COMPLETED,      // 3 — Winner declared, prize claimed
        REFUNDED        // 4 — Match cancelled, funds returned
    }

    // ============ State Variables ============

    /// @notice Backend oracle address that signs winner declarations
    address public backendOracle;

    /// @notice Mapping from room code to Match struct
    mapping(string => Match) public matches;

    /// @notice Timeout for player 2 to join (10 minutes)
    uint256 public constant JOIN_TIMEOUT = 10 minutes;

    /// @notice Timeout for winner to claim prize (30 days)
    uint256 public constant CLAIM_TIMEOUT = 30 days;

    // ============ Events ============

    event MatchCreated(
        string indexed roomCode,
        address indexed player1,
        address indexed stakeToken,
        uint256 stakeAmount,
        uint256 timestamp
    );

    event PlayerJoined(
        string indexed roomCode,
        address indexed player2,
        address indexed stakeToken,
        uint256 totalPot,
        uint256 timestamp
    );

    event PrizeClaimed(
        string indexed roomCode,
        address indexed winner,
        address indexed stakeToken,
        uint256 amount,
        uint256 timestamp
    );

    event MatchRefunded(
        string indexed roomCode,
        address indexed player,
        address indexed stakeToken,
        uint256 amount,
        uint256 timestamp
    );

    event ExpiredMatchRefunded(
        string indexed roomCode,
        address indexed player1,
        address indexed player2,
        address stakeToken,
        uint256 amountEach,
        uint256 timestamp
    );

    event BackendOracleUpdated(
        address indexed oldOracle,
        address indexed newOracle,
        uint256 timestamp
    );

    // ============ Constructor ============

    constructor(address _backendOracle) Ownable(msg.sender) {
        require(_backendOracle != address(0), "Invalid oracle address");
        backendOracle = _backendOracle;
    }

    // ============ External Functions ============

    /**
     * @notice Player 1 creates a match and stakes
     * @param roomCode Unique 6-character room code
     * @param token    ERC-20 token address, or address(0) for native CELO
     * @param amount   Stake amount (msg.value when native, token amount when ERC-20)
     */
    function stakeAsPlayer1(
        string calldata roomCode,
        address token,
        uint256 amount
    )
        external
        payable
        whenNotPaused
        nonReentrant
    {
        require(bytes(roomCode).length == 6, "Room code must be 6 characters");
        require(
            matches[roomCode].status == MatchStatus.NOT_CREATED,
            "Match already exists"
        );

        uint256 stakeAmount;

        if (token == NATIVE_TOKEN) {
            require(amount == 0, "Use msg.value for native stake");
            require(msg.value > 0, "Native stake must be greater than 0");
            stakeAmount = msg.value;
        } else {
            require(msg.value == 0, "Cannot send CELO with ERC20 stake");
            require(amount > 0, "Token stake must be greater than 0");
            stakeAmount = amount;
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        matches[roomCode] = Match({
            player1: msg.sender,
            player2: address(0),
            stakeAmount: stakeAmount,
            stakeToken: token,
            winner: address(0),
            status: MatchStatus.PLAYER1_STAKED,
            createdAt: block.timestamp,
            completedAt: 0
        });

        emit MatchCreated(roomCode, msg.sender, token, stakeAmount, block.timestamp);
    }

    /**
     * @notice Player 2 joins a match — currency is locked by player 1's choice
     * @param roomCode Room code to join
     * @param amount   Stake amount (msg.value when native, token amount when ERC-20)
     */
    function stakeAsPlayer2(
        string calldata roomCode,
        uint256 amount
    )
        external
        payable
        whenNotPaused
        nonReentrant
    {
        Match storage matchData = matches[roomCode];

        require(
            matchData.status == MatchStatus.PLAYER1_STAKED,
            "Match not available"
        );
        require(msg.sender != matchData.player1, "Cannot join own match");

        address token = matchData.stakeToken; // Locked — player2 has no choice

        if (token == NATIVE_TOKEN) {
            require(amount == 0, "Use msg.value for native stake");
            require(
                msg.value == matchData.stakeAmount,
                "Native stake must match player 1"
            );
        } else {
            require(msg.value == 0, "Cannot send CELO with ERC20 stake");
            require(
                amount == matchData.stakeAmount,
                "Token stake must match player 1"
            );
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        matchData.player2 = msg.sender;
        matchData.status = MatchStatus.BOTH_STAKED;

        uint256 totalPot = matchData.stakeAmount * 2;

        emit PlayerJoined(roomCode, msg.sender, token, totalPot, block.timestamp);
    }

    /**
     * @notice Winner claims prize with backend signature (pull-based)
     * @param roomCode  Room code for the match
     * @param signature Backend's signature proving msg.sender is the winner
     */
    function claimPrize(string calldata roomCode, bytes calldata signature)
        external
        nonReentrant
    {
        Match storage matchData = matches[roomCode];

        require(
            matchData.status == MatchStatus.BOTH_STAKED,
            "Match not ready for claiming"
        );
        require(matchData.winner == address(0), "Prize already claimed");

        // Verify backend signature
        bytes32 messageHash = keccak256(abi.encodePacked(roomCode, msg.sender));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedMessageHash.recover(signature);

        require(signer == backendOracle, "Invalid signature");

        // Update state before transfer (checks-effects-interactions)
        matchData.winner = msg.sender;
        matchData.status = MatchStatus.COMPLETED;
        matchData.completedAt = block.timestamp;

        uint256 prize = matchData.stakeAmount * 2;
        address token = matchData.stakeToken;

        // Transfer prize in the correct currency
        _transferTo(msg.sender, token, prize);

        emit PrizeClaimed(roomCode, msg.sender, token, prize, block.timestamp);
    }

    /**
     * @notice Player 1 can claim refund if player 2 never joins
     * @param roomCode Room code to refund
     */
    function claimRefund(string calldata roomCode) external nonReentrant {
        Match storage matchData = matches[roomCode];

        require(
            matchData.status == MatchStatus.PLAYER1_STAKED,
            "Cannot refund this match"
        );
        require(msg.sender == matchData.player1, "Only player 1 can refund");
        require(
            block.timestamp >= matchData.createdAt + JOIN_TIMEOUT,
            "Join timeout not reached"
        );

        matchData.status = MatchStatus.REFUNDED;
        uint256 refundAmount = matchData.stakeAmount;
        address token = matchData.stakeToken;

        _transferTo(msg.sender, token, refundAmount);

        emit MatchRefunded(roomCode, msg.sender, token, refundAmount, block.timestamp);
    }

    /**
     * @notice Either player can claim refund if winner never claims (after 30 days)
     * @param roomCode Room code to refund
     */
    function claimExpiredMatchRefund(string calldata roomCode)
        external
        nonReentrant
    {
        Match storage matchData = matches[roomCode];

        require(
            matchData.status == MatchStatus.BOTH_STAKED,
            "Match not eligible for refund"
        );
        require(
            msg.sender == matchData.player1 || msg.sender == matchData.player2,
            "Not a player in this match"
        );
        require(matchData.completedAt == 0, "Match already completed");
        require(
            block.timestamp >= matchData.createdAt + 1 hours + CLAIM_TIMEOUT,
            "Claim timeout not reached"
        );

        matchData.status = MatchStatus.REFUNDED;
        uint256 refundAmount = matchData.stakeAmount;
        address token = matchData.stakeToken;

        _transferTo(matchData.player1, token, refundAmount);
        _transferTo(matchData.player2, token, refundAmount);

        emit ExpiredMatchRefunded(
            roomCode,
            matchData.player1,
            matchData.player2,
            token,
            refundAmount,
            block.timestamp
        );
    }

    // ============ Admin Functions ============

    function updateBackendOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid oracle address");
        address oldOracle = backendOracle;
        backendOracle = newOracle;

        emit BackendOracleUpdated(oldOracle, newOracle, block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View Functions ============

    function getMatch(string calldata roomCode)
        external
        view
        returns (Match memory)
    {
        return matches[roomCode];
    }

    function getMatchStatus(string calldata roomCode)
        external
        view
        returns (MatchStatus)
    {
        return matches[roomCode].status;
    }

    function isRoomCodeAvailable(string calldata roomCode)
        external
        view
        returns (bool)
    {
        return matches[roomCode].status == MatchStatus.NOT_CREATED;
    }

    // ============ Internal Functions ============

    /**
     * @dev Transfer funds in native CELO or ERC-20
     */
    function _transferTo(address to, address token, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "Native transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ============ Fallback Functions ============

    receive() external payable {
        revert("Direct transfers not allowed");
    }

    fallback() external payable {
        revert("Direct transfers not allowed");
    }
}
