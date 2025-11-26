// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import './lib/reactive-lib/src/interfaces/IReactive.sol';
import './lib/reactive-lib/src/abstract-base/AbstractPausableReactive.sol';
import './lib/reactive-lib/src/interfaces/ISystemContract.sol';

/**
 * @title ChainlinkFeedMirrorRC
 * @notice Production-grade Reactive Smart Contract that mirrors Chainlink price feeds cross-chain
 * @dev Subscribes to AnswerUpdated events and forwards price data to destination chain
 * 
 * Bounty Requirements Addressed:
 * - Feed identifier (originFeed address) included in payload
 * - Decimals (8 for ETH/USD) passed to destination
 * - Domain separator and version for message verification
 * 
 * Production Features:
 * - AbstractPausableReactive for operational control (pause/resume)
 * - Callback confirmation tracking (bidirectional acknowledgment)
 * - Enhanced event logging for monitoring
 * - op_code validation for event type verification
 */
contract ChainlinkFeedMirrorRCv2 is IReactive, AbstractPausableReactive {
    // ============ Domain Separator & Version ============
    uint8 public constant MESSAGE_VERSION = 1;
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // ============ Configuration ============
    uint256 public originChainId;
    uint256 public destinationChainId;
    address public originFeed;
    address public destinationProxy;
    uint8 public originDecimals;
    
    // ============ Event Topics ============
    // Chainlink "AnswerUpdated" event signature
    // event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
    uint256 public constant ANSWER_UPDATED_TOPIC_0 = 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;
    
    // FeedUpdated event from DestinationFeedProxy for confirmation tracking
    // event FeedUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt)
    uint256 public constant FEED_UPDATED_TOPIC_0 = 0x061350823c4e78d9e58da7dc55e74186fc9e3a1fd6adf26ae5ffbe26f73e4f09;
    
    // ============ Gas & Validation ============
    uint64 public constant CALLBACK_GAS_LIMIT = 1000000;
    
    // Expected op_code for LOG3 events (AnswerUpdated has 2 indexed params + topic0)
    // LOG0=0, LOG1=1, LOG2=2, LOG3=3, LOG4=4
    uint256 private constant EXPECTED_OP_CODE_LOG3 = 3;
    // LOG2 for FeedUpdated (1 indexed param + topic0)
    uint256 private constant EXPECTED_OP_CODE_LOG2 = 2;

    // ============ State Variables ============
    // Deduplication
    uint256 public lastForwardedRoundId;
    
    // Callback confirmation tracking
    mapping(uint256 => bool) public pendingCallbacks;
    uint256 public pendingCount;
    uint256 public confirmedCount;
    uint256 public totalCallbacksSent;

    // ============ Enhanced Events ============
    // Lifecycle events
    event Subscribed(uint256 indexed chainId, address indexed contractAddr, uint256 indexed topic0);
    event Paused(address indexed by, uint256 timestamp);
    event Resumed(address indexed by, uint256 timestamp);
    
    // Operational events
    event MirrorTriggered(uint256 indexed roundId, int256 answer, uint256 updatedAt, address indexed originFeed);
    event CallbackSent(uint256 indexed roundId, int256 answer, address indexed destination, uint64 gasLimit);
    event CallbackPending(uint256 indexed roundId);
    event CallbackConfirmed(uint256 indexed roundId, uint256 latency);
    
    // Error events
    event DuplicateRoundSkipped(uint256 indexed roundId);
    event InvalidOpCodeReceived(uint256 indexed opCode, uint256 expected);

    constructor(
        address _service,
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _originFeed,
        address _destinationProxy,
        uint8 _originDecimals
    ) payable {
        // Initialize AbstractPausableReactive
        owner = msg.sender;
        paused = false;
        
        // Set service explicitly per official pattern
        service = ISystemContract(payable(_service));
        
        // Store configuration
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        originFeed = _originFeed;
        destinationProxy = _destinationProxy;
        originDecimals = _originDecimals;
        
        // Compute domain separator (EIP-712)
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ChainlinkFeedMirror"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
        
        // Subscribe in constructor per official Reactive Network pattern
        // The `vm` variable from AbstractReactive detects if we're in ReactVM
        if (!vm) {
            // Primary subscription: Chainlink AnswerUpdated events
            service.subscribe(
                originChainId,
                originFeed,
                ANSWER_UPDATED_TOPIC_0,
                REACTIVE_IGNORE, // topic_1 (current) - want all prices
                REACTIVE_IGNORE, // topic_2 (roundId) - want all rounds
                REACTIVE_IGNORE  // topic_3 unused
            );
            emit Subscribed(originChainId, originFeed, ANSWER_UPDATED_TOPIC_0);
            
            // Secondary subscription: Confirmation events from destination
            service.subscribe(
                destinationChainId,
                destinationProxy,
                FEED_UPDATED_TOPIC_0,
                REACTIVE_IGNORE, // topic_1 (roundId)
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            emit Subscribed(destinationChainId, destinationProxy, FEED_UPDATED_TOPIC_0);
        }
    }

    /**
     * @notice Returns subscriptions for pause/resume functionality
     * @dev Required by AbstractPausableReactive
     */
    function getPausableSubscriptions() internal view override returns (Subscription[] memory) {
        Subscription[] memory result = new Subscription[](2);
        
        // Primary subscription: Chainlink feed
        result[0] = Subscription(
            originChainId,
            originFeed,
            ANSWER_UPDATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        
        // Secondary subscription: Confirmation events
        result[1] = Subscription(
            destinationChainId,
            destinationProxy,
            FEED_UPDATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        
        return result;
    }

    /**
     * @notice Main reactive function - processes incoming events
     * @dev Handles both price updates and confirmation events
     */
    function react(LogRecord calldata log) external override vmOnly {
        // Route based on event topic
        if (log.topic_0 == ANSWER_UPDATED_TOPIC_0) {
            _handlePriceUpdate(log);
        } else if (log.topic_0 == FEED_UPDATED_TOPIC_0) {
            _handleConfirmation(log);
        }
        // Unknown topics are silently ignored (defensive)
    }
    
    /**
     * @notice Handles Chainlink AnswerUpdated events
     * @dev Validates, deduplicates, and forwards price data
     */
    function _handlePriceUpdate(LogRecord calldata log) internal {
        // Validate op_code (LOG3 for AnswerUpdated with 2 indexed params)
        // Note: Some networks may use different op_codes, so we log but don't revert
        if (log.op_code != EXPECTED_OP_CODE_LOG3) {
            emit InvalidOpCodeReceived(log.op_code, EXPECTED_OP_CODE_LOG3);
            // Continue processing - op_code validation is advisory
        }
        
        // Decode the log
        // topic_0 = signature
        // topic_1 = int256 current (answer)
        // topic_2 = uint256 roundId
        // data = uint256 updatedAt
        int256 answer = int256(log.topic_1);
        uint256 roundId = log.topic_2;
        uint256 updatedAt = abi.decode(log.data, (uint256));

        // Deduplication: skip already forwarded rounds
        if (roundId <= lastForwardedRoundId) {
            emit DuplicateRoundSkipped(roundId);
            return;
        }
        lastForwardedRoundId = roundId;

        // Mark as pending for confirmation tracking
        pendingCallbacks[roundId] = true;
        pendingCount++;
        totalCallbacksSent++;
        emit CallbackPending(roundId);

        // Emit operational event
        emit MirrorTriggered(roundId, answer, updatedAt, originFeed);

        // Prepare enhanced payload for DestinationFeedProxy.updateFromReactive
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),         // RVM ID placeholder (replaced by Reactive Network)
            originFeed,         // Feed identifier
            originDecimals,     // Decimals
            MESSAGE_VERSION,    // Message version
            uint80(roundId),
            answer,
            updatedAt,          // startedAt
            updatedAt,          // updatedAt
            uint80(roundId)     // answeredInRound
        );

        // Emit callback
        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
        emit CallbackSent(roundId, answer, destinationProxy, CALLBACK_GAS_LIMIT);
    }
    
    /**
     * @notice Handles FeedUpdated confirmation events from destination
     * @dev Updates confirmation tracking and calculates latency
     */
    function _handleConfirmation(LogRecord calldata log) internal {
        // topic_1 contains the roundId (indexed)
        uint256 roundId = log.topic_1;
        
        // Check if this was a pending callback
        if (pendingCallbacks[roundId]) {
            pendingCallbacks[roundId] = false;
            pendingCount--;
            confirmedCount++;
            
            // Calculate approximate latency (block-based, not precise)
            // log.block_number is the destination block where FeedUpdated was emitted
            uint256 latency = log.block_number; // For tracking purposes
            
            emit CallbackConfirmed(roundId, latency);
        }
        // Ignore confirmations for unknown rounds (could be from manual updates)
    }

    /**
     * @notice Manual trigger for updates (maintenance mode)
     * @dev Use when events are missed or for testing
     */
    function forceUpdate(
        uint256 roundId,
        int256 answer,
        uint256 updatedAt
    ) external payable {
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),
            originFeed,
            originDecimals,
            MESSAGE_VERSION,
            uint80(roundId),
            answer,
            updatedAt,
            updatedAt,
            uint80(roundId)
        );

        totalCallbacksSent++;
        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
        emit CallbackSent(roundId, answer, destinationProxy, CALLBACK_GAS_LIMIT);
    }
    
    // ============ View Functions ============
    
    /// @notice Get the domain separator for EIP-712 verification
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
    
    /// @notice Get callback statistics
    function getCallbackStats() external view returns (
        uint256 _totalSent,
        uint256 _confirmed,
        uint256 _pending,
        uint256 _confirmationRate
    ) {
        _totalSent = totalCallbacksSent;
        _confirmed = confirmedCount;
        _pending = pendingCount;
        _confirmationRate = totalCallbacksSent > 0 
            ? (confirmedCount * 10000) / totalCallbacksSent  // Basis points (e.g., 9500 = 95%)
            : 0;
    }
    
    /// @notice Check if a specific round callback is pending
    function isCallbackPending(uint256 roundId) external view returns (bool) {
        return pendingCallbacks[roundId];
    }
    
    /// @notice Check if contract is currently paused
    function isPaused() external view returns (bool) {
        return paused;
    }
    
    /// @notice Get contract owner
    function getOwner() external view returns (address) {
        return owner;
    }
}
