// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDevAccount.sol";
import "./interfaces/ISystemContract.sol";

/**
 * @title SimpleFunder
 * @notice Simple auto-funding contract for RSCs on Lasna
 * @dev Monitors RSC balance and debt, refills when below threshold
 * 
 * This contract can be called manually or triggered by a Reactive Contract.
 * It checks the RSC balance, refills if needed, and covers any debt.
 */
contract SimpleFunder {
    // ============ Configuration ============
    address public immutable targetRSC;          // RSC to monitor and fund
    address public immutable devAccount;         // Developer's funding account
    uint256 public immutable refillThreshold;    // Balance below which to refill
    uint256 public immutable refillAmount;       // Amount to send per refill
    address public immutable owner;              // Owner for manual operations

    // System contract for debt queries (Reactive Network)
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;

    // ============ Statistics ============
    uint256 public totalRefills;
    uint256 public totalDebtPayments;
    uint256 public totalAmountRefilled;
    uint256 public lastCheckTimestamp;

    // ============ Events ============
    event RSCRefilled(address indexed rsc, uint256 amount, uint256 newBalance);
    event DebtCovered(address indexed rsc, uint256 debtAmount);
    event CheckPerformed(address indexed rsc, uint256 balance, uint256 debt, bool refilled);
    event FundsWithdrawn(address indexed to, uint256 amount);

    constructor(
        address _targetRSC,
        address _devAccount,
        uint256 _refillThreshold,
        uint256 _refillAmount
    ) payable {
        require(_targetRSC != address(0), "SimpleFunder: zero RSC");
        require(_devAccount != address(0), "SimpleFunder: zero devAccount");
        require(_refillAmount > 0, "SimpleFunder: zero refill amount");

        targetRSC = _targetRSC;
        devAccount = _devAccount;
        refillThreshold = _refillThreshold;
        refillAmount = _refillAmount;
        owner = msg.sender;
    }

    receive() external payable {}

    /**
     * @notice Check RSC status and refill/cover debt if needed
     * @dev Can be called by anyone - main entry point
     */
    function checkAndFund() external {
        lastCheckTimestamp = block.timestamp;
        
        uint256 rscBalance = targetRSC.balance;
        uint256 rscDebt = _getDebt(targetRSC);
        bool didRefill = false;

        // Step 1: Cover debt first (reactivation)
        if (rscDebt > 0) {
            _coverDebt(rscDebt);
        }

        // Step 2: Refill if below threshold
        if (rscBalance <= refillThreshold) {
            _refill();
            didRefill = true;
        }

        emit CheckPerformed(targetRSC, rscBalance, rscDebt, didRefill);
    }

    /**
     * @notice Get debt for a contract from System Contract
     */
    function _getDebt(address target) internal view returns (uint256) {
        // Check if system contract exists
        uint256 size;
        assembly { size := extcodesize(0x0000000000000000000000000000000000fffFfF) }
        if (size == 0) {
            return 0;
        }

        try ISystemContract(SYSTEM_CONTRACT).debts(target) returns (uint256 debt) {
            return debt;
        } catch {
            return 0;
        }
    }

    /**
     * @notice Cover debt for the RSC
     */
    function _coverDebt(uint256 debtAmount) internal {
        // Ensure we have enough balance
        if (address(this).balance < debtAmount) {
            // Try to withdraw from dev account
            try IDevAccount(devAccount).withdraw(address(this), debtAmount) {
                // Successfully withdrew
            } catch {
                return; // Cannot withdraw, skip
            }
        }

        // Send to RSC to cover debt
        (bool success, ) = targetRSC.call{value: debtAmount}("");
        if (success) {
            totalDebtPayments++;
            emit DebtCovered(targetRSC, debtAmount);
        }
    }

    /**
     * @notice Refill the RSC
     */
    function _refill() internal {
        // Ensure we have enough balance
        if (address(this).balance < refillAmount) {
            // Try to withdraw from dev account
            try IDevAccount(devAccount).withdraw(address(this), refillAmount) {
                // Successfully withdrew
            } catch {
                return; // Cannot withdraw, skip
            }
        }

        // Send refill to RSC
        (bool success, ) = targetRSC.call{value: refillAmount}("");
        if (success) {
            totalRefills++;
            totalAmountRefilled += refillAmount;
            emit RSCRefilled(targetRSC, refillAmount, targetRSC.balance);
        }
    }

    /**
     * @notice Manual refill (owner only)
     */
    function manualRefill() external {
        require(msg.sender == owner, "SimpleFunder: not owner");
        _refill();
    }

    /**
     * @notice Manual debt cover (owner only)
     */
    function manualCoverDebt() external {
        require(msg.sender == owner, "SimpleFunder: not owner");
        uint256 debt = _getDebt(targetRSC);
        if (debt > 0) {
            _coverDebt(debt);
        }
    }

    /**
     * @notice Emergency withdraw (owner only)
     */
    function emergencyWithdraw(address to, uint256 amount) external {
        require(msg.sender == owner, "SimpleFunder: not owner");
        require(to != address(0), "SimpleFunder: zero address");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "SimpleFunder: transfer failed");
        
        emit FundsWithdrawn(to, amount);
    }

    /**
     * @notice Get current status
     */
    function getStatus() external view returns (
        uint256 _rscBalance,
        uint256 _rscDebt,
        uint256 _funderBalance,
        uint256 _devAccountBalance,
        uint256 _totalRefills,
        uint256 _totalDebtPayments,
        bool _needsRefill,
        bool _hasDebt
    ) {
        _rscBalance = targetRSC.balance;
        _rscDebt = _getDebt(targetRSC);
        _funderBalance = address(this).balance;
        _devAccountBalance = devAccount.balance;
        _totalRefills = totalRefills;
        _totalDebtPayments = totalDebtPayments;
        _needsRefill = _rscBalance <= refillThreshold;
        _hasDebt = _rscDebt > 0;
    }
}
