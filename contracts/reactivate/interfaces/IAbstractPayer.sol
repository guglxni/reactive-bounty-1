// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IAbstractPayer
 * @notice Interface for contracts that can cover their own debt
 * @dev Used by Reactivate to reactivate inactive contracts
 */
interface IAbstractPayer {
    /// @notice Cover any accumulated debt to reactivate the contract
    function coverDebt() external;

    /// @notice Pay a specific amount
    /// @param amount Amount to pay
    function pay(uint256 amount) external;
}
