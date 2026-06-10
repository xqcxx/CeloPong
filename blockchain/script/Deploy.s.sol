// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PongEscrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address backendOracle = vm.envAddress("BACKEND_ORACLE_ADDRESS");

        console.log("Deploying PongEscrow to Celo...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Backend Oracle:", backendOracle);

        vm.startBroadcast(deployerPrivateKey);

        PongEscrow escrow = new PongEscrow(backendOracle);

        vm.stopBroadcast();

        console.log("PongEscrow deployed at:", address(escrow));
        console.log("");
        console.log("To verify on Celoscan:");
        console.log("forge verify-contract", address(escrow), "src/PongEscrow.sol:PongEscrow \\");
        console.log("  --verifier etherscan \\");
        console.log("  --verifier-url https://api-sepolia.celoscan.io/api \\");
        console.log("  --constructor-args $(cast abi-encode \"constructor(address)\"", backendOracle, ")");
    }
}
