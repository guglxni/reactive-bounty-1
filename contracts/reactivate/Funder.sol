// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDevAccount.sol";
import "./interfaces/ISystemContract.sol";
import "./interfaces/IAbstractPayer.sol";
import "../lib/reactive-lib/src/abstract-base/AbstractCallback.sol";

/**
 * @title Funder
 * @notice Automated funding contract for Reactive Contracts and Callback contracts
 * @dev Monitors balances and refills when below threshold; covers debt to reactivate
 * 
 * Architecture:
 * - Watches both a callback contract (on destination chain) and a reactive contract (on Lasna)
 * - When triggered via callback, checks balances and refills if below threshold
 * - If either contract has accumulated debt, calls coverDebt() to reactivate
 * - Withdraws refill amounts from the developer's DevAccount
 * 
 * Security:
 * - Uses AbstractCallback for authorized sender validation
 * - Only authorized RVM ID can trigger callbacks
 * - Whitelisted on DevAccount for withdrawals
 */
contract Funder is AbstractCallback {
    // ============ Configuration ============
    address public immutable callbackReceiver;   // Contract on destination chain
    address public immutable reactiveReceiver;   // RSC on Reactive Network
    uint256 public immutable refillValue;        // Amount to send per refill
    uint256 public immutable refillThreshold;    // Balance threshold to trigger refill
    address public immutable devAccount;         // Developer's funding account

    // System contract for debt queries (Reactive Network)
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;

    // ============ Statistics ============
    uint256 public totalRefills;
    uint256 public totalDebtPayments;
    uint256 public totalCallbacks;
    uint256 public lastCallbackTimestamp;

    // ============ Events ============
    event RefillHandled(address indexed funder, address indexed recipient, uint256 amount);
    event DebtPaid(address indexed funder, address indexed contract_, uint256 debtAmount);
    event CallbackHandled(address indexed funder, uint256 timestamp);
    event FunderInitialized(
        address indexed callbackReceiver,
        address indexed reactiveReceiver,
        uint256 refillValue,
        uint256 refillThreshold
    );

    /**
     * @notice Initialize the Funder with target contracts and thresholds
     * @param _callbackSender The Callback Proxy address (for AbstractCallback)
     * @param _callbackReceiver The callback/destination contract to monitor
     * @param _reactiveReceiver The RSC contract to monitor
     * @param _refillValue Amount to refill per top-up
     * @param _refillThreshold Balance threshold below which to refill
     * @param _devAccount Developer's funding account address
     */
    constructor(
        address _callbackSender,
        address _callbackReceiver,
        address _reactiveReceiver,
        uint256 _refillValue,
        uint256 _refillThreshold,
        address _devAccount
    ) AbstractCallback(_callbackSender) payable {
        require(_callbackReceiver != address(0), "Funder: zero callback receiver");
        require(_reactiveReceiver != address(0), "Funder: zero reactive receiver");
        require(_refillValue > 0, "Funder: zero refill value");
        require(_devAccount != address(0), "Funder: zero dev account");

        callbackReceiver = _callbackReceiver;
        reactiveReceiver = _reactiveReceiver;
        refillValue = _refillValue;
        refillThreshold = _refillThreshold;
        devAccount = _devAccount;

        emit FunderInitialized(_callbackReceiver, _reactiveReceiver, _refillValue, _refillThreshold);
    }

    /**
     * @notice Main callback handler - checks balances, refills, and covers debt
     * @param sender The RVM ID (must match authorized sender)
     * @dev Called by the Reactive Network when the monitoring RC detects events
     */
    function callback(address sender) external authorizedSenderOnly rvmIdOnly(sender) {
        totalCallbacks++;
        lastCallbackTimestamp = block.timestamp;

        // === Step 1: Check and cover debts first (reactivation) ===
        _checkAndCoverDebts();

        // === Step 2: Check and refill balances ===
        _checkAndRefillBalances();

        emit CallbackHandled(address(this), block.timestamp);
    }

    /**
     * @notice Check for accumulated debt and cover it to reactivate contracts
     * @dev Queries the System Contract for debt amounts
     */
    function _checkAndCoverDebts() internal {
        // Skip if system contract doesn't exist (testing environment)
        uint256 size;
        assembly { size := extcodesize(0x0000000000000000000000000000000000fffFfF) }
        if (size == 0) {
            return;
        }

        // Check callback contract debt
        try ISystemContract(SYSTEM_CONTRACT).debts(callbackReceiver) returns (uint256 callbackDebt) {
            if (callbackDebt > 0) {
                _coverDebtFor(callbackReceiver, callbackDebt);
            }
        } catch {
            // System contract call failed
        }

        // Check reactive contract debt
        try ISystemContract(SYSTEM_CONTRACT).debts(reactiveReceiver) returns (uint256 reactiveDebt) {
            if (reactiveDebt > 0) {
                _coverDebtFor(reactiveReceiver, reactiveDebt);
            }
        } catch {
            // System contract call failed
        }
    }

    /**
     * @notice Cover debt for a specific contract
     * @param target Contract with debt
     * @param debtAmount Amount of debt
     */
    function _coverDebtFor(address target, uint256 debtAmount) internal {
        // Ensure we have enough balance
        if (address(this).balance < debtAmount) {
            // Try to withdraw from dev account
            try IDevAccount(devAccount).withdraw(address(this), debtAmount) {
                // Successfully withdrew
            } catch {
                // Cannot withdraw, skip
                return;
            }
        }

        // Call coverDebt on the target
        try IAbstractPayer(target).coverDebt() {
            totalDebtPayments++;
            emit DebtPaid(address(this), target, debtAmount);
        } catch {
            // coverDebt failed
        }
    }

    /**
     * @notice Check balances and refill if below threshold
     */
    function _checkAndRefillBalances() internal {
        // Check callback receiver balance
        uint256 callbackBal = callbackReceiver.balance;
        if (callbackBal <= refillThreshold) {
            _refill(callbackReceiver);
        }

        // Check reactive receiver balance
        uint256 reactiveBal = reactiveReceiver.balance;
        if (reactiveBal <= refillThreshold) {
            _refill(reactiveReceiver);
        }
    }

    /**
     * @notice Refill a target contract
     * @param target Contract to refill
     */
    function _refill(address target) internal {
        // Ensure we have enough balance
        if (address(this).balance < refillValue) {
            // Try to withdraw from dev account
            try IDevAccount(devAccount).withdraw(address(this), refillValue) {
                // Successfully withdrew
            } catch {
                // Cannot withdraw, skip refill
                return;
            }
        }

        // Send refill amount
        (bool success, ) = target.call{value: refillValue}("");
        if (success) {
            totalRefills++;
            emit RefillHandled(address(this), target, refillValue);
        }
    }

    /**
     * @notice Manual refill trigger (owner only, for emergencies)
     * @param target Contract to refill
     */
    function manualRefill(address target) external {
        require(msg.sender == IDevAccount(devAccount).owner(), "Funder: not dev account owner");
        _refill(target);
    }

    /**
     * @notice Manual debt cover trigger (owner only, for emergencies)
     * @param target Contract with debt
     */
    function manualCoverDebt(address target) external {
        require(msg.sender == IDevAccount(devAccount).owner(), "Funder: not dev account owner");
        
        try ISystemContract(SYSTEM_CONTRACT).debts(target) returns (uint256 debt) {
            if (debt > 0) {
                _coverDebtFor(target, debt);
            }
        } catch {
            // Try anyway
            try IAbstractPayer(target).coverDebt() {
                totalDebtPayments++;
                emit DebtPaid(address(this), target, 0);
            } catch {}
        }
    }

    /**
     * @notice Get funder status
     * @return _totalCallbacks Total callbacks processed
     * @return _totalRefills Total refills executed
     * @return _totalDebtPayments Total debt payments made
     * @return _balance Current funder balance
     * @return _lastCallback Timestamp of last callback
     */
    function getStatus() external view returns (
        uint256 _totalCallbacks,
        uint256 _totalRefills,
        uint256 _totalDebtPayments,
        uint256 _balance,
        uint256 _lastCallback
    ) {
        return (
            totalCallbacks,
            totalRefills,
            totalDebtPayments,
            address(this).balance,
            lastCallbackTimestamp
        );
    }

    /**
     * @notice Check if targets need refill
     * @return callbackNeedsRefill True if callback receiver below threshold
     * @return reactiveNeedsRefill True if reactive receiver below threshold
     */
    function needsRefill() external view returns (bool callbackNeedsRefill, bool reactiveNeedsRefill) {
        callbackNeedsRefill = callbackReceiver.balance <= refillThreshold;
        reactiveNeedsRefill = reactiveReceiver.balance <= refillThreshold;
    }

    /// @notice Receive ETH
    receive() external payable override {}
}
