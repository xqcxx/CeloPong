// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
// import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
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

    enum ResultReason {
        SCORE,
        FORFEIT,
        DISCONNECT_TIMEOUT
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

    // ============ Engagement State ============

    /// @notice Last check-in timestamp per player
    mapping(address => uint256) public lastCheckIn;

    /// @notice Consecutive check-in streak per player
    mapping(address => uint256) public playerStreaks;

    /// @notice Last daily reward claim timestamp
    mapping(address => uint256) public lastRewardClaim;

    /// @notice Total daily rewards claimed
    mapping(address => uint256) public totalClaims;

    /// @notice GG count per player
    mapping(address => uint256) public ggCount;

    /// @notice Whether a player has sent GG for a specific match
    mapping(string => mapping(address => bool)) public ggSent;

    /// @notice Practice session count per player
    mapping(address => uint256) public playerPracticeCount;

    // ============ Challenge Struct & State ============

    struct Challenge {
        address creator;
        address token;
        uint256 amount;
        uint256 createdAt;
        uint256 expiresAt;
        address acceptor;
        bool accepted;
    }

    mapping(string => Challenge) public challenges;

    // ============ Match Score Struct & State ============

    struct MatchScore {
        uint8 score1;
        uint8 score2;
        address reporter;
        uint256 reportedAt;
    }

    mapping(string => MatchScore) public matchScores;

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

    event AbandonedMatchRefunded(
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

    // ============ Engagement Events ============

    event PlayerCheckIn(
        address indexed player,
        uint256 streak,
        uint256 timestamp
    );

    event DailyRewardClaimed(
        address indexed player,
        uint256 totalClaims,
        uint256 timestamp
    );

    event GGSent(
        string indexed roomCode,
        address indexed player,
        uint256 totalGGs,
        uint256 timestamp
    );

    event ChallengeCreated(
        string indexed roomCode,
        address indexed creator,
        address token,
        uint256 amount,
        uint256 timestamp
    );

    event ChallengeAccepted(
        string indexed roomCode,
        address indexed acceptor,
        uint256 timestamp
    );

    event PracticeSession(
        address indexed player,
        uint256 totalPractices,
        uint256 timestamp
    );

    event MatchReported(
        string indexed roomCode,
        address indexed reporter,
        uint8 score1,
        uint8 score2,
        uint256 timestamp
    );

    // ============ Constructor ============

    constructor(address _backendOracle) {
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
        require(
            block.timestamp < matchData.createdAt + JOIN_TIMEOUT,
            "Join timeout reached"
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
     * @notice Winner claims prize with a backend-signed final result.
     */
    function claimPrize(
        string calldata roomCode,
        address winner,
        uint8 score1,
        uint8 score2,
        ResultReason reason,
        bytes calldata signature
    )
        external
        nonReentrant
    {
        Match storage matchData = matches[roomCode];

        require(
            matchData.status == MatchStatus.BOTH_STAKED ||
                matchData.status == MatchStatus.COMPLETED,
            "Match not ready for claiming"
        );
        require(matchData.winner == address(0), "Prize already claimed");
        require(msg.sender == winner, "Only winner can claim");

        _verifyResult(roomCode, matchData, winner, score1, score2, reason, signature);

        // Update state before transfer (checks-effects-interactions)
        matchData.winner = winner;
        matchData.status = MatchStatus.COMPLETED;
        matchData.completedAt = block.timestamp;

        uint256 prize = matchData.stakeAmount * 2;
        address token = matchData.stakeToken;

        // Transfer prize in the correct currency
        _transferTo(winner, token, prize);

        emit PrizeClaimed(roomCode, winner, token, prize, block.timestamp);
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

    /**
     * @notice Refund both players after the backend declares a match abandoned.
     * @dev Either participant may submit the oracle authorization.
     */
    function claimAbandonedMatchRefund(
        string calldata roomCode,
        bytes calldata signature
    )
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

        bytes32 messageHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                "ABANDONED_MATCH_REFUND",
                roomCode,
                matchData.player1,
                matchData.player2
            )
        );
        address signer = ECDSA.recover(
            ECDSA.toEthSignedMessageHash(messageHash),
            signature
        );
        require(signer == backendOracle, "Invalid signature");

        matchData.status = MatchStatus.REFUNDED;
        matchData.completedAt = block.timestamp;

        uint256 refundAmount = matchData.stakeAmount;
        address token = matchData.stakeToken;

        _transferTo(matchData.player1, token, refundAmount);
        _transferTo(matchData.player2, token, refundAmount);

        emit AbandonedMatchRefunded(
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

    // ============ Engagement Functions ============

    /**
     * @notice Record a daily check-in to build a streak
     */
    function checkIn() external {
        require(
            lastCheckIn[msg.sender] == 0 || block.timestamp >= lastCheckIn[msg.sender] + 24 hours,
            "Already checked in today"
        );

        uint256 previousCheckIn = lastCheckIn[msg.sender];
        lastCheckIn[msg.sender] = block.timestamp;

        // Reset streak if player missed more than 48 hours (missed a full day window)
        if (playerStreaks[msg.sender] > 0 && previousCheckIn > 0 && block.timestamp > previousCheckIn + 48 hours) {
            playerStreaks[msg.sender] = 0;
        }
        playerStreaks[msg.sender]++;

        emit PlayerCheckIn(msg.sender, playerStreaks[msg.sender], block.timestamp);
    }

    /**
     * @notice Claim a daily reward token (gas-only, no funds transferred)
     */
    function claimDailyReward() external {
        require(
            lastRewardClaim[msg.sender] == 0 || block.timestamp >= lastRewardClaim[msg.sender] + 1 days,
            "Already claimed today"
        );

        lastRewardClaim[msg.sender] = block.timestamp;
        totalClaims[msg.sender]++;

        emit DailyRewardClaimed(msg.sender, totalClaims[msg.sender], block.timestamp);
    }

    /**
     * @notice Send a GG (good game) to an opponent after a completed match
     * @param roomCode Room code of the completed match
     */
    function gg(
        string calldata roomCode,
        address winner,
        uint8 score1,
        uint8 score2,
        ResultReason reason,
        bytes calldata signature
    ) external {
        Match storage m = matches[roomCode];
        require(
            m.player1 == msg.sender || m.player2 == msg.sender,
            "Not a participant"
        );
        require(
            m.status == MatchStatus.BOTH_STAKED ||
                m.status == MatchStatus.COMPLETED,
            "Match not completed"
        );
        _verifyResult(roomCode, m, winner, score1, score2, reason, signature);
        require(!ggSent[roomCode][msg.sender], "Already sent GG");

        ggSent[roomCode][msg.sender] = true;
        ggCount[msg.sender]++;

        emit GGSent(roomCode, msg.sender, ggCount[msg.sender], block.timestamp);
    }

    /**
     * @notice Record a practice session (gas-only, no gameplay impact)
     */
    function practiceMode() external {
        playerPracticeCount[msg.sender]++;

        emit PracticeSession(msg.sender, playerPracticeCount[msg.sender], block.timestamp);
    }

    /**
     * @notice Create an open challenge for a staked match
     * @param roomCode Room code (must match an existing PLAYER1_STAKED or NOT_CREATED match)
     * @param token    ERC-20 token address, or address(0) for native CELO
     * @param amount   Stake amount
     */
    function createChallenge(
        string calldata roomCode,
        address token,
        uint256 amount
    ) external {
        require(bytes(roomCode).length == 6, "Room code must be 6 characters");
        require(
            challenges[roomCode].createdAt == 0,
            "Challenge already exists"
        );

        Match storage m = matches[roomCode];

        // If match already staked, validate consistency
        if (m.status == MatchStatus.PLAYER1_STAKED) {
            require(m.player1 == msg.sender, "Not your match");
            require(m.stakeToken == token, "Token mismatch");
            require(m.stakeAmount == amount, "Amount mismatch");
        } else if (m.status == MatchStatus.NOT_CREATED) {
            // Allow creating challenge before staking (Sub-flow B)
        } else {
            revert("Match not available for challenge");
        }

        challenges[roomCode] = Challenge({
            creator: msg.sender,
            token: token,
            amount: amount,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + 1 hours,
            acceptor: address(0),
            accepted: false
        });

        emit ChallengeCreated(roomCode, msg.sender, token, amount, block.timestamp);
    }

    /**
     * @notice Accept an open challenge
     * @param roomCode Room code of the challenge
     */
    function acceptChallenge(string calldata roomCode) external {
        Challenge storage c = challenges[roomCode];
        require(c.createdAt != 0, "Challenge not found");
        require(!c.accepted, "Already accepted");
        require(msg.sender != c.creator, "Cannot accept own challenge");
        require(block.timestamp < c.expiresAt, "Challenge expired");

        Match storage m = matches[roomCode];
        if (m.status == MatchStatus.PLAYER1_STAKED) {
            require(
                block.timestamp < m.createdAt + JOIN_TIMEOUT,
                "Join timeout reached"
            );
        }

        c.acceptor = msg.sender;
        c.accepted = true;

        emit ChallengeAccepted(roomCode, msg.sender, block.timestamp);
    }

    /**
     * @notice Report a match score on-chain after game completion
     * @param roomCode Room code of the completed match
     * @param score1   Player 1's final score
     * @param score2   Player 2's final score
     */
    function reportMatch(
        string calldata roomCode,
        uint8 score1,
        uint8 score2,
        address winner,
        ResultReason reason,
        bytes calldata signature
    ) external {
        Match storage m = matches[roomCode];
        require(
            m.player1 == msg.sender || m.player2 == msg.sender,
            "Not a participant"
        );
        require(
            m.status == MatchStatus.BOTH_STAKED ||
                m.status == MatchStatus.COMPLETED,
            "Match not completed"
        );
        _verifyResult(roomCode, m, winner, score1, score2, reason, signature);
        require(matchScores[roomCode].reportedAt == 0, "Already reported");

        matchScores[roomCode] = MatchScore({
            score1: score1,
            score2: score2,
            reporter: msg.sender,
            reportedAt: block.timestamp
        });

        emit MatchReported(roomCode, msg.sender, score1, score2, block.timestamp);
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

    function _verifyResult(
        string calldata roomCode,
        Match storage matchData,
        address winner,
        uint8 score1,
        uint8 score2,
        ResultReason reason,
        bytes calldata signature
    ) internal view {
        require(
            winner == matchData.player1 || winner == matchData.player2,
            "Invalid winner"
        );

        bytes32 messageHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                "MATCH_RESULT",
                roomCode,
                matchData.player1,
                matchData.player2,
                winner,
                score1,
                score2,
                reason
            )
        );
        address signer = ECDSA.recover(
            ECDSA.toEthSignedMessageHash(messageHash),
            signature
        );
        require(signer == backendOracle, "Invalid result signature");
    }

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
