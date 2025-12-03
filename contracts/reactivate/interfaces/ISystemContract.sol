// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ISystemContract
 * @notice Interface for Reactive Network's System Contract
 * @dev Used to query contract debts and system state
 */
interface ISystemContract {
    /// @notice Get the debt accumulated by a contract
    /// @param contractAddr The contract address to check
    /// @return The debt amount in native tokens
    function debts(address contractAddr) external view returns (uint256);

    /// @notice Check if a contract is active (no debt, has balance)
    /// @param contractAddr The contract address to check
    /// @return True if active
    function isActive(address contractAddr) external view returns (bool);
}
