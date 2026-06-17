// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BatchTransfer
 * @notice Gas-efficient batch CELO transfers. Send the same amount to N addresses
 *         in a single transaction instead of N separate transactions.
 */
contract BatchTransfer {
    event BatchSent(address indexed sender, uint256 recipients, uint256 amountPerRecipient, uint256 total);

    /**
     * @notice Send equal amounts to multiple recipients
     * @param recipients Array of destination addresses
     * @param amount     Amount in wei to send to each recipient
     */
    function batchTransferEqual(address[] calldata recipients, uint256 amount) external payable {
        require(recipients.length > 0, "No recipients");
        uint256 total = amount * recipients.length;
        require(msg.value >= total, "Insufficient funds");

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = payable(recipients[i]).call{value: amount}("");
            require(ok, "Transfer failed");
        }

        // Refund excess
        uint256 remainder = address(this).balance;
        if (remainder > 0) {
            (bool ok, ) = payable(msg.sender).call{value: remainder}("");
            require(ok, "Refund failed");
        }

        emit BatchSent(msg.sender, recipients.length, amount, total);
    }

    /**
     * @notice Send different amounts to multiple recipients
     * @param recipients Array of destination addresses
     * @param amounts    Array of amounts in wei (must match recipients length)
     */
    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external payable {
        require(recipients.length > 0, "No recipients");
        require(recipients.length == amounts.length, "Array length mismatch");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        require(msg.value >= total, "Insufficient funds");

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, ) = payable(recipients[i]).call{value: amounts[i]}("");
            require(ok, "Transfer failed");
        }

        uint256 remainder = address(this).balance;
        if (remainder > 0) {
            (bool ok, ) = payable(msg.sender).call{value: remainder}("");
            require(ok, "Refund failed");
        }

        emit BatchSent(msg.sender, recipients.length, 0, total);
    }

    receive() external payable {}
}
