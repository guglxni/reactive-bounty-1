// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDevAccount.sol";

/**
 * @title DevAccount
 * @notice A dedicated funding account for a developer
 * @dev Holds REACT/ETH for automated refills by whitelisted funders
 * 
 * Security Model:
 * - Only owner can whitelist addresses
 * - Only whitelisted addresses can withdraw
 * - Owner can withdraw at any time
 * - Receives ETH/REACT via receive()
 */
contract DevAccount is IDevAccount {
    address public override owner;
    mapping(address => bool) private _whitelisted;

    // Events
    event Whitelisted(address indexed addr);
    event RemovedFromWhitelist(address indexed addr);
    event Withdrawn(address indexed to, uint256 amount);
    event Received(address indexed from, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "DevAccount: not owner");
        _;
    }

    modifier onlyWhitelisted() {
        require(_whitelisted[msg.sender] || msg.sender == owner, "DevAccount: not whitelisted");
        _;
    }

    constructor(address _owner) payable {
        require(_owner != address(0), "DevAccount: zero owner");
        owner = _owner;
        _whitelisted[_owner] = true;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @inheritdoc IDevAccount
    function withdraw(address recipient, uint256 amount) external override onlyWhitelisted {
        require(recipient != address(0), "DevAccount: zero recipient");
        require(address(this).balance >= amount, "DevAccount: insufficient balance");
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "DevAccount: transfer failed");
        
        emit Withdrawn(recipient, amount);
    }

    /// @inheritdoc IDevAccount
    function whitelist(address addr) external override onlyOwner {
        require(addr != address(0), "DevAccount: zero address");
        _whitelisted[addr] = true;
        emit Whitelisted(addr);
    }

    /// @notice Remove an address from the whitelist
    /// @param addr Address to remove
    function removeFromWhitelist(address addr) external onlyOwner {
        _whitelisted[addr] = false;
        emit RemovedFromWhitelist(addr);
    }

    /// @inheritdoc IDevAccount
    function isWhitelisted(address addr) external view override returns (bool) {
        return _whitelisted[addr];
    }

    /// @notice Get the current balance of this dev account
    /// @return Balance in native tokens
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Transfer ownership to a new address
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DevAccount: zero new owner");
        _whitelisted[owner] = false;
        owner = newOwner;
        _whitelisted[newOwner] = true;
    }
}
