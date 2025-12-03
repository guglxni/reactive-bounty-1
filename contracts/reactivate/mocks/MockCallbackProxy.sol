// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockCallbackProxy
 * @notice Mock Callback Proxy for testing Reactivate contracts
 */
contract MockCallbackProxy {
    event CallbackExecuted(address indexed target, bytes data, bool success);

    /**
     * @notice Execute a callback on target
     * @param target Target contract
     * @param data Callback data
     */
    function callback(address target, bytes calldata data) external returns (bool success) {
        (success, ) = target.call(data);
        emit CallbackExecuted(target, data, success);
        return success;
    }

    /// @notice Receive ETH
    receive() external payable {}
}
