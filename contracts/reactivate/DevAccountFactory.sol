// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DevAccount.sol";
import "./interfaces/IAccountFactory.sol";

/**
 * @title DevAccountFactory
 * @notice Factory for creating and tracking developer funding accounts
 * @dev Each developer gets one account; used by Reactivate for automated funding
 */
contract DevAccountFactory is IAccountFactory {
    // Developer address => DevAccount address
    mapping(address => address) public override devAccounts;
    
    // All created accounts for enumeration
    address[] public allAccounts;

    // Events
    event DevAccountCreated(address indexed developer, address indexed account);

    /// @inheritdoc IAccountFactory
    function createDevAccount() external payable override returns (address) {
        require(devAccounts[msg.sender] == address(0), "DevAccountFactory: account exists");
        
        DevAccount newAccount = new DevAccount{value: msg.value}(msg.sender);
        address accountAddr = address(newAccount);
        
        devAccounts[msg.sender] = accountAddr;
        allAccounts.push(accountAddr);
        
        emit DevAccountCreated(msg.sender, accountAddr);
        return accountAddr;
    }

    /// @notice Get the total number of dev accounts created
    /// @return Count of accounts
    function accountCount() external view returns (uint256) {
        return allAccounts.length;
    }

    /// @notice Check if a developer has an account
    /// @param dev Developer address
    /// @return True if account exists
    function hasAccount(address dev) external view returns (bool) {
        return devAccounts[dev] != address(0);
    }
}
