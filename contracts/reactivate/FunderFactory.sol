// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Funder.sol";
import "./interfaces/IDevAccount.sol";
import "./interfaces/IAccountFactory.sol";

/**
 * @title FunderFactory
 * @notice Factory for deploying Funder contracts with proper initialization
 * @dev Handles DevAccount validation, initial funding, and whitelisting
 * 
 * Deployment Flow:
 * 1. Validate developer has a DevAccount with sufficient balance
 * 2. Calculate initial funding amount (2x refill + buffer)
 * 3. Deploy new Funder with initial funds
 * 4. Whitelist Funder on DevAccount for future withdrawals
 * 5. Emit setup event for tracking
 */
contract FunderFactory {
    // ============ Configuration ============
    IAccountFactory public immutable accountFactory;
    address public immutable callbackProxy;  // Callback Proxy address for Funders

    // ============ Tracking ============
    address public latestDeployed;
    address[] public allFunders;
    mapping(address => address[]) public fundersByDev;  // dev => their funders

    // ============ Events ============
    event FunderCreated(
        address indexed developer,
        address indexed funder,
        address callbackContract,
        address reactiveContract,
        uint256 refillValue,
        uint256 refillThreshold
    );

    /**
     * @notice Initialize the factory
     * @param _accountFactory DevAccountFactory address
     * @param _callbackProxy Callback Proxy address on this chain
     */
    constructor(address _accountFactory, address _callbackProxy) {
        require(_accountFactory != address(0), "FunderFactory: zero account factory");
        require(_callbackProxy != address(0), "FunderFactory: zero callback proxy");
        
        accountFactory = IAccountFactory(_accountFactory);
        callbackProxy = _callbackProxy;
    }

    /**
     * @notice Create a new Funder for monitoring contracts
     * @param callbackContract The callback/destination contract to monitor
     * @param reactiveContract The RSC contract to monitor
     * @param refillValue Amount to send per refill
     * @param refillThreshold Balance threshold below which to refill
     * @return funderAddress The deployed Funder address
     * 
     * Requirements:
     * - Caller must have a DevAccount
     * - DevAccount must have at least 2x refillValue + 2 ether
     * - FunderFactory must be whitelisted on DevAccount to withdraw funds
     * - After creation, the caller must whitelist the Funder on their DevAccount
     */
    function createFunder(
        address callbackContract,
        address reactiveContract,
        uint256 refillValue,
        uint256 refillThreshold
    ) external payable returns (address funderAddress) {
        // Get developer's account
        address devAccount = accountFactory.devAccounts(msg.sender);
        require(devAccount != address(0), "FunderFactory: no dev account");

        // Calculate required initial funding
        uint256 withdrawAmount = refillValue * 2;
        uint256 initialFundAmount = withdrawAmount + 2 ether;

        // Check dev account has enough balance
        uint256 devAccountBalance = devAccount.balance;
        require(devAccountBalance >= initialFundAmount, "FunderFactory: insufficient dev account balance");

        // Withdraw initial funds from dev account (factory must be whitelisted)
        IDevAccount(devAccount).withdraw(address(this), initialFundAmount);

        // Deploy new Funder with initial funds
        Funder newFunder = new Funder{value: initialFundAmount}(
            callbackProxy,
            callbackContract,
            reactiveContract,
            refillValue,
            refillThreshold,
            devAccount
        );

        funderAddress = address(newFunder);

        // Track
        latestDeployed = funderAddress;
        allFunders.push(funderAddress);
        fundersByDev[msg.sender].push(funderAddress);

        emit FunderCreated(
            msg.sender,
            funderAddress,
            callbackContract,
            reactiveContract,
            refillValue,
            refillThreshold
        );

        // Note: Caller must whitelist the funder on their DevAccount after creation
        // Call: devAccount.whitelist(funderAddress)

        return funderAddress;
    }

    /**
     * @notice Create a Funder with custom initial funding (for flexibility)
     * @dev Allows sending ETH directly instead of withdrawing from DevAccount
     */
    function createFunderWithFunding(
        address callbackContract,
        address reactiveContract,
        uint256 refillValue,
        uint256 refillThreshold,
        address devAccount
    ) external payable returns (address funderAddress) {
        require(msg.value >= 2 ether, "FunderFactory: need at least 2 ether");
        require(devAccount != address(0), "FunderFactory: zero dev account");

        // Deploy new Funder with sent funds
        Funder newFunder = new Funder{value: msg.value}(
            callbackProxy,
            callbackContract,
            reactiveContract,
            refillValue,
            refillThreshold,
            devAccount
        );

        funderAddress = address(newFunder);

        // Track
        latestDeployed = funderAddress;
        allFunders.push(funderAddress);
        fundersByDev[msg.sender].push(funderAddress);

        emit FunderCreated(
            msg.sender,
            funderAddress,
            callbackContract,
            reactiveContract,
            refillValue,
            refillThreshold
        );

        return funderAddress;
    }

    /**
     * @notice Get total number of funders created
     * @return Count of all funders
     */
    function funderCount() external view returns (uint256) {
        return allFunders.length;
    }

    /**
     * @notice Get number of funders for a specific developer
     * @param dev Developer address
     * @return Count of funders
     */
    function funderCountByDev(address dev) external view returns (uint256) {
        return fundersByDev[dev].length;
    }

    /**
     * @notice Get all funders for a developer
     * @param dev Developer address
     * @return Array of funder addresses
     */
    function getFundersByDev(address dev) external view returns (address[] memory) {
        return fundersByDev[dev];
    }

    /// @notice Receive ETH (for createFunderWithFunding)
    receive() external payable {}
}
