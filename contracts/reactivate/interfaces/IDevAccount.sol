// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IDevAccount
 * @notice Interface for developer funding accounts used by Reactivate
 * @dev Developer accounts hold REACT/ETH for automated refills
 */
interface IDevAccount {
    /// @notice Withdraw funds from the dev account to a recipient
    /// @param recipient Address to receive the funds
    /// @param amount Amount to withdraw
    function withdraw(address recipient, uint256 amount) external;

    /// @notice Whitelist an address to allow withdrawals
    /// @param addr Address to whitelist
    function whitelist(address addr) external;

    /// @notice Check if an address is whitelisted
    /// @param addr Address to check
    /// @return True if whitelisted
    function isWhitelisted(address addr) external view returns (bool);

    /// @notice Get the owner of this dev account
    /// @return Owner address
    function owner() external view returns (address);
}
