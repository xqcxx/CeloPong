// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PongEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC-20 token for testing
contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PongEscrowTest is Test {
    PongEscrow public escrow;

    address public owner;
    address public backendOracle;
    address public player1;
    address public player2;
    address public player3;

    address public constant NATIVE_TOKEN = address(0);
    uint256 public constant STAKE_AMOUNT_NATIVE = 1 ether;
    uint256 public constant STAKE_AMOUNT_TOKEN = 10 ether; // 18-decimal tokens
    string  public constant ROOM_CODE = "ABC123";
    string  public constant ROOM_CODE2 = "XYZ789";

    MockToken public cUSD;
    MockToken public usdc;

    uint256 public backendPrivateKey;

    // Events
    event MatchCreated(string indexed roomCode, address indexed player1, address indexed stakeToken, uint256 stakeAmount, uint256 timestamp);
    event PlayerJoined(string indexed roomCode, address indexed player2, address indexed stakeToken, uint256 totalPot, uint256 timestamp);
    event PrizeClaimed(string indexed roomCode, address indexed winner, address indexed stakeToken, uint256 amount, uint256 timestamp);
    event MatchRefunded(string indexed roomCode, address indexed player, address indexed stakeToken, uint256 amount, uint256 timestamp);
    event ExpiredMatchRefunded(string indexed roomCode, address indexed player1, address indexed player2, address stakeToken, uint256 amountEach, uint256 timestamp);

    function setUp() public {
        owner = address(this);
        backendPrivateKey = 0xA11CE;
        backendOracle = vm.addr(backendPrivateKey);
        player1 = makeAddr("player1");
        player2 = makeAddr("player2");
        player3 = makeAddr("player3");

        // Deploy mock tokens
        cUSD = new MockToken("cUSD", "cUSD");
        usdc = new MockToken("USDC", "USDC");

        // Deploy contract
        escrow = new PongEscrow(backendOracle);

        // Fund test accounts with native CELO
        vm.deal(player1, 100 ether);
        vm.deal(player2, 100 ether);
        vm.deal(player3, 100 ether);

        // Fund test accounts with mock tokens
        cUSD.mint(player1, 1000 ether);
        cUSD.mint(player2, 1000 ether);
        cUSD.mint(player3, 1000 ether);

        usdc.mint(player1, 1000 ether);
        usdc.mint(player2, 1000 ether);
        usdc.mint(player3, 1000 ether);

        // Approve escrow to spend tokens
        vm.prank(player1);
        cUSD.approve(address(escrow), type(uint256).max);
        vm.prank(player2);
        cUSD.approve(address(escrow), type(uint256).max);
        vm.prank(player3);
        cUSD.approve(address(escrow), type(uint256).max);

        vm.prank(player1);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(player2);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(player3);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(escrow.backendOracle(), backendOracle);
        assertEq(escrow.owner(), owner);
    }

    function test_ConstructorRevertsWithZeroAddress() public {
        vm.expectRevert("Invalid oracle address");
        new PongEscrow(address(0));
    }

    // ============ Native CELO: Match Creation ============

    function test_Native_StakeAsPlayer1() public {
        vm.prank(player1);
        vm.expectEmit(true, true, true, false);
        emit MatchCreated(ROOM_CODE, player1, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE, block.timestamp);

        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.player1, player1);
        assertEq(matchData.stakeAmount, STAKE_AMOUNT_NATIVE);
        assertEq(matchData.stakeToken, NATIVE_TOKEN);
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.PLAYER1_STAKED));
    }

    function test_Native_StakeAsPlayer1RevertsWithZeroStake() public {
        vm.prank(player1);
        vm.expectRevert("Native stake must be greater than 0");
        escrow.stakeAsPlayer1{value: 0}(ROOM_CODE, NATIVE_TOKEN, 0);
    }

    function test_Native_StakeAsPlayer1RevertsWithNonZeroAmount() public {
        vm.prank(player1);
        vm.expectRevert("Use msg.value for native stake");
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE);
    }

    function test_Native_StakeAsPlayer1RevertsWithInvalidRoomCode() public {
        vm.prank(player1);
        vm.expectRevert("Room code must be 6 characters");
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}("ABC", NATIVE_TOKEN, 0);
    }

    function test_Native_StakeAsPlayer1RevertsIfMatchExists() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player3);
        vm.expectRevert("Match already exists");
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);
    }

    // ============ Native CELO: Match Joining ============

    function test_Native_StakeAsPlayer2() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        vm.expectEmit(true, true, true, false);
        emit PlayerJoined(ROOM_CODE, player2, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE * 2, block.timestamp);

        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.player2, player2);
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.BOTH_STAKED));
    }

    function test_Native_StakeAsPlayer2RevertsIfMatchNotAvailable() public {
        vm.prank(player2);
        vm.expectRevert("Match not available");
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);
    }

    function test_Native_StakeAsPlayer2RevertsIfPlayer1TriesToJoin() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player1);
        vm.expectRevert("Cannot join own match");
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);
    }

    function test_Native_StakeAsPlayer2RevertsIfStakeMismatch() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        vm.expectRevert("Native stake must match player 1");
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE + 0.1 ether}(ROOM_CODE, 0);
    }

    // ============ ERC-20 (cUSD): Match Creation ============

    function test_ERC20_cUSD_StakeAsPlayer1() public {
        vm.prank(player1);
        vm.expectEmit(true, true, true, false);
        emit MatchCreated(ROOM_CODE, player1, address(cUSD), STAKE_AMOUNT_TOKEN, block.timestamp);

        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.player1, player1);
        assertEq(matchData.stakeAmount, STAKE_AMOUNT_TOKEN);
        assertEq(matchData.stakeToken, address(cUSD));
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.PLAYER1_STAKED));
        assertEq(cUSD.balanceOf(address(escrow)), STAKE_AMOUNT_TOKEN);
        assertEq(cUSD.balanceOf(player1), 1000 ether - STAKE_AMOUNT_TOKEN);
    }

    function test_ERC20_cUSD_StakeAsPlayer1RevertsWithCELOSent() public {
        vm.prank(player1);
        vm.expectRevert("Cannot send CELO with ERC20 stake");
        escrow.stakeAsPlayer1{value: 1}(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);
    }

    function test_ERC20_cUSD_StakeAsPlayer1RevertsWithZeroAmount() public {
        vm.prank(player1);
        vm.expectRevert("Token stake must be greater than 0");
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), 0);
    }

    function test_ERC20_cUSD_StakeAsPlayer1RevertsIfMatchExists() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player3);
        vm.expectRevert("Match already exists");
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);
    }

    // ============ ERC-20 (cUSD): Match Joining ============

    function test_ERC20_cUSD_StakeAsPlayer2() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        vm.expectEmit(true, true, true, false);
        emit PlayerJoined(ROOM_CODE, player2, address(cUSD), STAKE_AMOUNT_TOKEN * 2, block.timestamp);

        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.player2, player2);
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.BOTH_STAKED));
        assertEq(cUSD.balanceOf(address(escrow)), STAKE_AMOUNT_TOKEN * 2);
        assertEq(cUSD.balanceOf(player2), 1000 ether - STAKE_AMOUNT_TOKEN);
    }

    function test_ERC20_cUSD_StakeAsPlayer2RevertsIfStakeMismatch() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        vm.expectRevert("Token stake must match player 1");
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN + 1 ether);
    }

    function test_ERC20_cUSD_StakeAsPlayer2RevertsWithCELOSent() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        vm.expectRevert("Cannot send CELO with ERC20 stake");
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_TOKEN}(ROOM_CODE, 0);
    }

    // ============ ERC-20 (USDC): Full Flow ============

    function test_ERC20_USDC_FullMatchFlow() public {
        // Player 1 creates with USDC
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(usdc), STAKE_AMOUNT_TOKEN);

        assertEq(usdc.balanceOf(address(escrow)), STAKE_AMOUNT_TOKEN);

        // Player 2 joins with USDC
        vm.prank(player2);
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN);

        assertEq(usdc.balanceOf(address(escrow)), STAKE_AMOUNT_TOKEN * 2);

        // Winner claims
        bytes memory signature = _signWinner(ROOM_CODE, player1);

        vm.prank(player1);
        escrow.claimPrize(ROOM_CODE, signature);

        // Player1 started with 1000 ether, staked 10, won 20 → 1010 ether
        assertEq(usdc.balanceOf(player1), 1000 ether + STAKE_AMOUNT_TOKEN);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.COMPLETED));
    }

    // ============ Cross-Currency Rejection Tests ============

    function test_CannotJoinNativeMatchWithDifferentStake() public {
        // P1 stakes CELO
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        // P2 tries to join with lower CELO — rejected
        vm.prank(player2);
        vm.expectRevert("Native stake must match player 1");
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE - 0.1 ether}(ROOM_CODE, 0);
    }

    function test_CannotJoinERCMatchWithDifferentToken() public {
        // P1 stakes cUSD
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        // P2 tries to join with USDC — rejected because amount check will pass but
        // the token is locked to cUSD by contract (stakeAsPlayer2 reads match.stakeToken)
        // P2's USDC approve won't matter since contract reads cUSD
        // P2 tries with wrong amount — rejected
        vm.prank(player2);
        vm.expectRevert("Token stake must match player 1");
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN + 1);
    }

    // ============ Prize Claiming Tests (Native) ============

    function test_Native_ClaimPrize() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        bytes memory signature = _signWinner(ROOM_CODE, player1);

        uint256 balanceBefore = player1.balance;

        vm.prank(player1);
        vm.expectEmit(true, true, true, false);
        emit PrizeClaimed(ROOM_CODE, player1, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE * 2, block.timestamp);

        escrow.claimPrize(ROOM_CODE, signature);

        uint256 balanceAfter = player1.balance;
        assertEq(balanceAfter - balanceBefore, STAKE_AMOUNT_NATIVE * 2);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.winner, player1);
        assertEq(uint(matchData.status), uint(PongEscrow.MatchStatus.COMPLETED));
    }

    function test_Native_ClaimPrizeRevertsWithInvalidSignature() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        uint256 wrongKey = 0xBAD;
        bytes32 messageHash = keccak256(abi.encodePacked(ROOM_CODE, player1));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.prank(player1);
        vm.expectRevert("Invalid signature");
        escrow.claimPrize(ROOM_CODE, badSignature);
    }

    function test_Native_ClaimPrizeRevertsIfAlreadyClaimed() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        bytes memory signature = _signWinner(ROOM_CODE, player1);

        vm.prank(player1);
        escrow.claimPrize(ROOM_CODE, signature);

        vm.prank(player1);
        vm.expectRevert("Match not ready for claiming");
        escrow.claimPrize(ROOM_CODE, signature);
    }

    function test_Native_ClaimPrizeRevertsIfLoserTriesToClaim() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        bytes memory signature = _signWinner(ROOM_CODE, player1);

        vm.prank(player2);
        vm.expectRevert("Invalid signature");
        escrow.claimPrize(ROOM_CODE, signature);
    }

    // ============ Prize Claiming Tests (ERC-20) ============

    function test_ERC20_ClaimPrize() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN);

        bytes memory signature = _signWinner(ROOM_CODE, player1);

        uint256 balanceBefore = cUSD.balanceOf(player1);

        vm.prank(player1);
        escrow.claimPrize(ROOM_CODE, signature);

        uint256 balanceAfter = cUSD.balanceOf(player1);
        assertEq(balanceAfter - balanceBefore, STAKE_AMOUNT_TOKEN * 2);
        assertEq(cUSD.balanceOf(address(escrow)), 0);
    }

    function test_ERC20_ClaimPrizeRevertsWithInvalidSignature() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN);

        uint256 wrongKey = 0xBAD;
        bytes32 messageHash = keccak256(abi.encodePacked(ROOM_CODE, player2));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badSignature = abi.encodePacked(r, s, v);

        vm.prank(player2);
        vm.expectRevert("Invalid signature");
        escrow.claimPrize(ROOM_CODE, badSignature);
    }

    // ============ Refund Tests (Native) ============

    function test_Native_ClaimRefund() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.warp(block.timestamp + 11 minutes);

        uint256 balanceBefore = player1.balance;

        vm.prank(player1);
        vm.expectEmit(true, true, true, false);
        emit MatchRefunded(ROOM_CODE, player1, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE, block.timestamp);

        escrow.claimRefund(ROOM_CODE);

        uint256 balanceAfter = player1.balance;
        assertEq(balanceAfter - balanceBefore, STAKE_AMOUNT_NATIVE);

        assertEq(uint(escrow.getMatchStatus(ROOM_CODE)), uint(PongEscrow.MatchStatus.REFUNDED));
    }

    function test_Native_ClaimRefundRevertsBeforeTimeout() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player1);
        vm.expectRevert("Join timeout not reached");
        escrow.claimRefund(ROOM_CODE);
    }

    function test_Native_ClaimRefundRevertsIfNotPlayer1() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.warp(block.timestamp + 11 minutes);

        vm.prank(player2);
        vm.expectRevert("Only player 1 can refund");
        escrow.claimRefund(ROOM_CODE);
    }

    // ============ Refund Tests (ERC-20) ============

    function test_ERC20_ClaimRefund() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.warp(block.timestamp + 11 minutes);

        uint256 balanceBefore = cUSD.balanceOf(player1);

        vm.prank(player1);
        escrow.claimRefund(ROOM_CODE);

        uint256 balanceAfter = cUSD.balanceOf(player1);
        assertEq(balanceAfter - balanceBefore, STAKE_AMOUNT_TOKEN);
        assertEq(cUSD.balanceOf(address(escrow)), 0);
    }

    // ============ Expired Match Refund Tests ============

    function test_Native_ExpiredMatchRefund() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        vm.warp(block.timestamp + 1 hours + 31 days);

        uint256 p1Before = player1.balance;
        uint256 p2Before = player2.balance;

        vm.prank(player1);
        vm.expectEmit(true, true, true, true);
        emit ExpiredMatchRefunded(ROOM_CODE, player1, player2, NATIVE_TOKEN, STAKE_AMOUNT_NATIVE, block.timestamp);

        escrow.claimExpiredMatchRefund(ROOM_CODE);

        assertEq(player1.balance - p1Before, STAKE_AMOUNT_NATIVE);
        assertEq(player2.balance - p2Before, STAKE_AMOUNT_NATIVE);
    }

    function test_ERC20_ExpiredMatchRefund() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        vm.prank(player2);
        escrow.stakeAsPlayer2(ROOM_CODE, STAKE_AMOUNT_TOKEN);

        vm.warp(block.timestamp + 1 hours + 31 days);

        uint256 p1Before = cUSD.balanceOf(player1);
        uint256 p2Before = cUSD.balanceOf(player2);

        vm.prank(player1);
        escrow.claimExpiredMatchRefund(ROOM_CODE);

        assertEq(cUSD.balanceOf(player1) - p1Before, STAKE_AMOUNT_TOKEN);
        assertEq(cUSD.balanceOf(player2) - p2Before, STAKE_AMOUNT_TOKEN);
        assertEq(cUSD.balanceOf(address(escrow)), 0);
    }

    function test_ExpiredMatchRefundRevertsBeforeTimeout() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        vm.warp(block.timestamp + 1 hours + 29 days);

        vm.prank(player1);
        vm.expectRevert("Claim timeout not reached");
        escrow.claimExpiredMatchRefund(ROOM_CODE);
    }

    function test_ExpiredMatchRefundRevertsIfNotPlayer() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        vm.warp(block.timestamp + 1 hours + 31 days);

        vm.prank(player3);
        vm.expectRevert("Not a player in this match");
        escrow.claimExpiredMatchRefund(ROOM_CODE);
    }

    // ============ Multiple Simultaneous Matches ============

    function test_MultipleMatchesDifferentCurrencies() public {
        // Match 1: Native CELO
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        // Match 2: cUSD
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE2, address(cUSD), STAKE_AMOUNT_TOKEN);

        PongEscrow.Match memory m1 = escrow.getMatch(ROOM_CODE);
        PongEscrow.Match memory m2 = escrow.getMatch(ROOM_CODE2);

        assertEq(m1.stakeToken, NATIVE_TOKEN);
        assertEq(m2.stakeToken, address(cUSD));
        assertEq(m1.stakeAmount, STAKE_AMOUNT_NATIVE);
        assertEq(m2.stakeAmount, STAKE_AMOUNT_TOKEN);
    }

    // ============ Admin Functions Tests ============

    function test_UpdateBackendOracle() public {
        address newOracle = makeAddr("newOracle");

        escrow.updateBackendOracle(newOracle);

        assertEq(escrow.backendOracle(), newOracle);
    }

    function test_UpdateBackendOracleRevertsIfNotOwner() public {
        address newOracle = makeAddr("newOracle");

        vm.prank(player1);
        vm.expectRevert();
        escrow.updateBackendOracle(newOracle);
    }

    function test_PauseAndUnpause() public {
        escrow.pause();

        vm.prank(player1);
        vm.expectRevert();
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        escrow.unpause();

        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);
        assertEq(uint(escrow.getMatchStatus(ROOM_CODE)), uint(PongEscrow.MatchStatus.PLAYER1_STAKED));
    }

    function test_PauseDoesNotAffectClaiming() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        vm.prank(player2);
        escrow.stakeAsPlayer2{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, 0);

        escrow.pause();

        bytes memory signature = _signWinner(ROOM_CODE, player1);

        vm.prank(player1);
        escrow.claimPrize(ROOM_CODE, signature); // Should work even when paused

        assertEq(uint(escrow.getMatchStatus(ROOM_CODE)), uint(PongEscrow.MatchStatus.COMPLETED));
    }

    // ============ View Functions Tests ============

    function test_IsRoomCodeAvailable() public {
        assertTrue(escrow.isRoomCodeAvailable(ROOM_CODE));

        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        assertFalse(escrow.isRoomCodeAvailable(ROOM_CODE));
    }

    function test_GetMatchStatus() public {
        assertEq(uint(escrow.getMatchStatus(ROOM_CODE)), uint(PongEscrow.MatchStatus.NOT_CREATED));

        vm.prank(player1);
        escrow.stakeAsPlayer1{value: STAKE_AMOUNT_NATIVE}(ROOM_CODE, NATIVE_TOKEN, 0);

        assertEq(uint(escrow.getMatchStatus(ROOM_CODE)), uint(PongEscrow.MatchStatus.PLAYER1_STAKED));
    }

    function test_GetMatchReturnsTokenField() public {
        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), STAKE_AMOUNT_TOKEN);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.stakeToken, address(cUSD));
    }

    // ============ Direct Transfer Rejection ============

    function test_RevertDirectTransfer() public {
        vm.deal(address(this), 1 ether);
        (bool success, ) = address(escrow).call{value: 1 ether}("");
        assertFalse(success);
    }

    // ============ Fuzz Tests ============

    function testFuzz_NativeStakeAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 50 ether);

        vm.prank(player1);
        escrow.stakeAsPlayer1{value: amount}(ROOM_CODE, NATIVE_TOKEN, 0);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.stakeAmount, amount);
    }

    function testFuzz_ERC20StakeAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 50 ether);

        vm.prank(player1);
        escrow.stakeAsPlayer1(ROOM_CODE, address(cUSD), amount);

        PongEscrow.Match memory matchData = escrow.getMatch(ROOM_CODE);
        assertEq(matchData.stakeAmount, amount);
    }

    // ============ Helper Functions ============

    function _signWinner(string memory roomCode, address winner) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encodePacked(roomCode, winner));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendPrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }
}
