// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/AggregatorV3Interface.sol";
import "./lib/reactive-lib/src/abstract-base/AbstractCallback.sol";

/**
 * @title DestinationFeedProxyV2
 * @notice Production-grade price feed proxy with enhanced features
 * @dev Receives price updates from the Reactive Network and exposes them via AggregatorV3Interface.
 * 
 * Production Features:
 * - AbstractCallback pattern for secure callback handling (includes AbstractPayer for auto-settlement)
 * - Feed identifier validation
 * - Decimals verification
 * - Message version validation
 * - Enhanced event logging for monitoring
 * - Historical round data storage
 * - Operational statistics
 */
contract DestinationFeedProxyV2 is AggregatorV3Interface, AbstractCallback {
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    // ============ Storage ============
    // Latest round data
    RoundData private s_latestRound;
    
    // Historical round data (for getRoundData queries)
    mapping(uint80 => RoundData) private s_rounds;
    uint80[] private s_roundIds;
    uint256 public constant MAX_HISTORY = 100; // Keep last 100 rounds
    
    // Configuration
    uint8 public override decimals;
    string public override description;
    uint256 public override version;
    address public expectedOriginFeed;
    address public authorizedReactiveContract;
    address public owner;
    
    // Message validation
    uint8 public constant EXPECTED_MESSAGE_VERSION = 1;
    
    // Stale detection
    uint256 public constant STALE_THRESHOLD = 3 hours;
    
    // Statistics
    uint256 public totalUpdates;
    uint256 public lastUpdateBlock;
    uint256 public lastUpdateTimestamp;

    // ============ Events ============
    // Core events
    event FeedUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event FeedSourceVerified(address indexed originFeed, uint80 roundId);
    
    // Configuration events
    event AuthorizedReactiveContractChanged(address indexed oldContract, address indexed newContract);
    event ExpectedOriginFeedChanged(address indexed oldFeed, address indexed newFeed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    // Operational events
    event CallbackReceived(address indexed sender, uint80 roundId, int256 answer);
    event ValidationPassed(uint80 roundId, address originFeed, uint8 decimals, uint8 messageVersion);
    event HistoryPruned(uint256 roundsRemoved);
    
    // Payment events (from AbstractPayer, but we emit explicitly too)
    event DebtSettled(uint256 amount);
    event FundsReceived(address indexed from, uint256 amount);

    // ============ Modifiers ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: only owner");
        _;
    }

    /**
     * @notice Constructor for DestinationFeedProxyV2
     * @param _callback_sender The Callback Proxy address on this chain
     * @param _decimals The number of decimals for this feed (8 for ETH/USD)
     * @param _description Human-readable description of the feed
     * @param _expectedOriginFeed The expected origin feed address for validation (0x0 to skip validation)
     */
    constructor(
        address _callback_sender,
        uint8 _decimals,
        string memory _description,
        address _expectedOriginFeed
    ) AbstractCallback(_callback_sender) payable {
        decimals = _decimals;
        description = _description;
        version = 1;
        owner = msg.sender;
        expectedOriginFeed = _expectedOriginFeed;
        
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============ Receive ETH ============
    // Note: AbstractPayer already has receive() but we override to add event
    receive() external payable override {
        emit FundsReceived(msg.sender, msg.value);
    }

    // ============ Configuration Functions ============
    
    /**
     * @notice Sets the authorized Reactive Contract address (RVM ID)
     * @dev This is typically the deployer address of your RSC on Reactive Network
     */
    function setAuthorizedReactiveContract(address _reactiveContract) external onlyOwner {
        emit AuthorizedReactiveContractChanged(authorizedReactiveContract, _reactiveContract);
        authorizedReactiveContract = _reactiveContract;
    }
    
    /**
     * @notice Updates the expected origin feed address
     * @dev Set to address(0) to disable feed validation
     */
    function setExpectedOriginFeed(address _expectedOriginFeed) external onlyOwner {
        emit ExpectedOriginFeedChanged(expectedOriginFeed, _expectedOriginFeed);
        expectedOriginFeed = _expectedOriginFeed;
    }
    
    /**
     * @notice Transfer ownership of the contract
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ============ Core Callback Function ============
    
    /**
     * @notice Called by the Reactive System Contract to update the feed
     * @dev Enhanced payload structure with feed identifier, decimals, and version
     * @param sender The RVM ID (deployer address) injected by Reactive Network
     * @param _originFeed The source Chainlink feed address (for validation)
     * @param _decimals The decimals from the source feed
     * @param _messageVersion The message format version
     * @param _roundId The Chainlink round ID
     * @param _answer The price answer
     * @param _startedAt When the round started
     * @param _updatedAt When the answer was computed
     * @param _answeredInRound The round ID in which the answer was computed
     */
    function updateFromReactive(
        address sender,
        address _originFeed,
        uint8 _decimals,
        uint8 _messageVersion,
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external authorizedSenderOnly rvmIdOnly(sender) {
        // Emit callback received event
        emit CallbackReceived(sender, _roundId, _answer);

        // Validate RVM sender if set
        if (authorizedReactiveContract != address(0)) {
            require(sender == authorizedReactiveContract, "Unauthorized RVM Sender");
        }
        
        // Validate feed source
        if (expectedOriginFeed != address(0)) {
            require(_originFeed == expectedOriginFeed, "Invalid feed source");
        }
        
        // Validate message version
        require(_messageVersion == EXPECTED_MESSAGE_VERSION, "Invalid message version");
        
        // Validate decimals match
        require(_decimals == decimals, "Decimals mismatch");

        // Sanity check: positive price
        require(_answer > 0, "Invalid price: must be positive");
        
        // Monotonicity check: ensure we don't revert to older data
        require(_roundId > s_latestRound.roundId, "Stale update: roundId regression");
        require(_updatedAt >= s_latestRound.updatedAt, "Stale update: updatedAt regression");

        emit ValidationPassed(_roundId, _originFeed, _decimals, _messageVersion);

        // Create round data
        RoundData memory newRound = RoundData({
            roundId: _roundId,
            answer: _answer,
            startedAt: _startedAt,
            updatedAt: _updatedAt,
            answeredInRound: _answeredInRound
        });

        // Store in history
        s_rounds[_roundId] = newRound;
        s_roundIds.push(_roundId);
        
        // Prune old history if needed
        if (s_roundIds.length > MAX_HISTORY) {
            _pruneHistory();
        }

        // Update latest
        s_latestRound = newRound;
        
        // Update statistics
        totalUpdates++;
        lastUpdateBlock = block.number;
        lastUpdateTimestamp = block.timestamp;

        emit FeedUpdated(_roundId, _answer, _updatedAt);
        emit FeedSourceVerified(_originFeed, _roundId);
    }

    // ============ AggregatorV3Interface Implementation ============

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory r = s_rounds[_roundId];
        require(r.updatedAt > 0, "Round data not found");
        return (r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory r = s_latestRound;
        require(r.updatedAt > 0, "No data present");
        return (r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound);
    }

    // ============ View Functions ============
    
    /// @notice Check if the latest price is stale
    function isStale() external view returns (bool) {
        if (s_latestRound.updatedAt == 0) return true;
        return (block.timestamp - s_latestRound.updatedAt) > STALE_THRESHOLD;
    }
    
    /// @notice Get the expected message version
    function getExpectedMessageVersion() external pure returns (uint8) {
        return EXPECTED_MESSAGE_VERSION;
    }
    
    /// @notice Get operational statistics
    function getStats() external view returns (
        uint256 _totalUpdates,
        uint256 _lastUpdateBlock,
        uint256 _lastUpdateTimestamp,
        uint256 _historySize,
        bool _isStale
    ) {
        _totalUpdates = totalUpdates;
        _lastUpdateBlock = lastUpdateBlock;
        _lastUpdateTimestamp = lastUpdateTimestamp;
        _historySize = s_roundIds.length;
        _isStale = s_latestRound.updatedAt == 0 || 
                   (block.timestamp - s_latestRound.updatedAt) > STALE_THRESHOLD;
    }
    
    /// @notice Get list of stored round IDs
    function getStoredRoundIds() external view returns (uint80[] memory) {
        return s_roundIds;
    }
    
    /// @notice Get the number of stored rounds
    function getHistorySize() external view returns (uint256) {
        return s_roundIds.length;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Prune old history to keep storage bounded
     */
    function _pruneHistory() internal {
        uint256 toRemove = s_roundIds.length - MAX_HISTORY;
        
        // Delete old rounds from mapping
        for (uint256 i = 0; i < toRemove; i++) {
            delete s_rounds[s_roundIds[i]];
        }
        
        // Shift array (expensive but bounded by MAX_HISTORY)
        for (uint256 i = 0; i < MAX_HISTORY; i++) {
            s_roundIds[i] = s_roundIds[i + toRemove];
        }
        
        // Resize array
        for (uint256 i = 0; i < toRemove; i++) {
            s_roundIds.pop();
        }
        
        emit HistoryPruned(toRemove);
    }
    
    // ============ Fund Management ============
    
    /// @notice Withdraw funds (only if no debt)
    function withdrawFunds(address payable _to) external onlyOwner {
        // Check if there's debt first
        uint256 debt = vendor.debt(address(this));
        require(debt == 0, "Cannot withdraw: outstanding debt");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success,) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    /// @notice Manually settle debt if needed
    function settleDebt() external {
        uint256 debt = vendor.debt(address(this));
        require(debt > 0, "No debt to settle");
        require(address(this).balance >= debt, "Insufficient balance for debt");
        
        // Pay the debt to the vendor (callback proxy)
        _pay(payable(address(vendor)), debt);
        emit DebtSettled(debt);
    }
    
    /// @notice Get current debt amount
    function getDebt() external view returns (uint256) {
        return vendor.debt(address(this));
    }
}
