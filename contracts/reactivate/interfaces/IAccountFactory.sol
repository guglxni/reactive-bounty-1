// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IAccountFactory
 * @notice Interface for the developer account factory
 * @dev Maps developer addresses to their funding accounts
 */
interface IAccountFactory {
    /// @notice Get the dev account for a developer address
    /// @param dev Developer address
    /// @return Dev account address (or address(0) if none)
    function devAccounts(address dev) external view returns (address);

    /// @notice Create a new dev account for the caller
    /// @return The newly created dev account address
    function createDevAccount() external payable returns (address);
}
