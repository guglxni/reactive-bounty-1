// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import './lib/reactive-lib/src/interfaces/IReactive.sol';
import './lib/reactive-lib/src/abstract-base/AbstractPausableReactive.sol';
import './lib/reactive-lib/src/interfaces/ISystemContract.sol';

/**
 * @title MultiFeedMirrorRCv2
 * @notice Production-grade RSC that mirrors MULTIPLE Chainlink price feeds cross-chain
 * @dev Single RSC subscribes to multiple origin feeds and routes to single destination
 * 
 * Supported Feeds (Base Sepolia → Sepolia):
 * - ETH/USD: 0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3
 * - BTC/USD: 0x961AD289351459A45fC90884eF3AB0278ea95DDE
 * - LINK/USD: 0xAc6DB6d5538Cd07f58afee9dA736ce192119017B
 * - USDC/USD: 0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e
 * 
 * Architecture Benefits:
 * - Single RSC = single funding requirement
 * - Single destination = single authorization
 * - Efficient subscription management
 * - Unified monitoring
 */
contract MultiFeedMirrorRCv2 is IReactive, AbstractPausableReactive {
    // ============ Constants ============
    uint8 public constant MESSAGE_VERSION = 1;
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // Chainlink "AnswerUpdated" event signature
    uint256 public constant ANSWER_UPDATED_TOPIC_0 = 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;
    
    // Callback gas
    uint64 public constant CALLBACK_GAS_LIMIT = 1000000;
    
    // ============ Configuration ============
    uint256 public originChainId;
    uint256 public destinationChainId;
    address public destinationProxy;
    
    // Feed configuration
    struct FeedInfo {
        address aggregator;     // Chainlink aggregator address on origin
        uint8 decimals;         // Feed decimals
        string symbol;          // e.g., "ETH/USD"
        bool active;            // Is subscription active
        uint256 lastRoundId;    // Last forwarded round (deduplication)
        uint256 callbackCount;  // Statistics
    }
    
    mapping(address => FeedInfo) public feeds;
    address[] public feedList;

    // ============ Statistics ============
    uint256 public totalCallbacksSent;
    uint256 public totalEventsReceived;

    // ============ Events ============
    event FeedAdded(address indexed aggregator, string symbol, uint8 decimals);
    event FeedRemoved(address indexed aggregator);
    event FeedSubscribed(uint256 indexed chainId, address indexed aggregator);
    event MirrorTriggered(address indexed feed, uint256 roundId, int256 answer);
    event CallbackSent(address indexed feed, uint256 roundId, address destination);
    event DuplicateSkipped(address indexed feed, uint256 roundId);

    /**
     * @notice Constructor - initializes multi-feed subscriptions
     * @param _service System contract address
     * @param _originChainId Origin chain (e.g., 84532 for Base Sepolia)
     * @param _destinationChainId Destination chain (e.g., 11155111 for Sepolia)
     * @param _destinationProxy MultiFeedDestination address on destination
     * @param _feedAggregators Array of Chainlink aggregator addresses
     * @param _feedDecimals Array of decimals for each feed
     * @param _feedSymbols Array of symbols (e.g., ["ETH/USD", "BTC/USD"])
     */
    constructor(
        address _service,
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _destinationProxy,
        address[] memory _feedAggregators,
        uint8[] memory _feedDecimals,
        string[] memory _feedSymbols
    ) payable {
        require(
            _feedAggregators.length == _feedDecimals.length &&
            _feedAggregators.length == _feedSymbols.length,
            "Array length mismatch"
        );
        require(_feedAggregators.length > 0, "No feeds provided");
        
        // Initialize base
        owner = msg.sender;
        paused = false;
        service = ISystemContract(payable(_service));
        
        // Store configuration
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        destinationProxy = _destinationProxy;
        
        // Compute domain separator
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("MultiFeedMirror"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
        
        // Register feeds and subscribe
        for (uint256 i = 0; i < _feedAggregators.length; i++) {
            address aggregator = _feedAggregators[i];
            
            feeds[aggregator] = FeedInfo({
                aggregator: aggregator,
                decimals: _feedDecimals[i],
                symbol: _feedSymbols[i],
                active: true,
                lastRoundId: 0,
                callbackCount: 0
            });
            feedList.push(aggregator);
            
            emit FeedAdded(aggregator, _feedSymbols[i], _feedDecimals[i]);
            
            // Subscribe in constructor (not in ReactVM)
            if (!vm) {
                service.subscribe(
                    _originChainId,
                    aggregator,
                    ANSWER_UPDATED_TOPIC_0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
                emit FeedSubscribed(_originChainId, aggregator);
            }
        }
    }

    /**
     * @notice Required by AbstractPausableReactive for pause/resume
     */
    function getPausableSubscriptions() internal view override returns (Subscription[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < feedList.length; i++) {
            if (feeds[feedList[i]].active) activeCount++;
        }
        
        Subscription[] memory subs = new Subscription[](activeCount);
        uint256 idx = 0;
        
        for (uint256 i = 0; i < feedList.length; i++) {
            if (feeds[feedList[i]].active) {
                subs[idx] = Subscription(
                    originChainId,
                    feedList[i],
                    ANSWER_UPDATED_TOPIC_0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
                idx++;
            }
        }
        
        return subs;
    }

    /**
     * @notice Main reactive function - processes price updates from ANY feed
     */
    function react(LogRecord calldata log) external override vmOnly {
        totalEventsReceived++;
        
        // Only process AnswerUpdated events
        if (log.topic_0 != ANSWER_UPDATED_TOPIC_0) return;
        
        // Get the feed that emitted this event
        address feedAddr = log._contract;
        FeedInfo storage feedInfo = feeds[feedAddr];
        
        // Check if this is a registered and active feed
        if (!feedInfo.active) return;
        
        // Decode event data
        // topic_1 = int256 current (answer)
        // topic_2 = uint256 roundId
        // data = uint256 updatedAt
        int256 answer = int256(log.topic_1);
        uint256 roundId = log.topic_2;
        uint256 updatedAt = abi.decode(log.data, (uint256));
        
        // Deduplication
        if (roundId <= feedInfo.lastRoundId) {
            emit DuplicateSkipped(feedAddr, roundId);
            return;
        }
        feedInfo.lastRoundId = roundId;
        
        emit MirrorTriggered(feedAddr, roundId, answer);
        
        // Prepare callback payload
        // The feedAddr (origin aggregator) identifies which feed is being updated
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),             // RVM ID placeholder
            feedAddr,               // Feed identifier (origin aggregator address)
            feedInfo.decimals,      // Decimals
            MESSAGE_VERSION,        // Version
            uint80(roundId),
            answer,
            updatedAt,              // startedAt
            updatedAt,              // updatedAt  
            uint80(roundId)         // answeredInRound
        );
        
        // Emit callback to destination
        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
        emit CallbackSent(feedAddr, roundId, destinationProxy);
        
        feedInfo.callbackCount++;
        totalCallbacksSent++;
    }

    // ============ Feed Management ============
    
    /**
     * @notice Add a new feed subscription (owner only)
     */
    function addFeed(
        address aggregator,
        uint8 feedDecimals,
        string calldata symbol
    ) external onlyOwner {
        require(aggregator != address(0), "Invalid aggregator");
        require(!feeds[aggregator].active, "Feed already active");
        
        feeds[aggregator] = FeedInfo({
            aggregator: aggregator,
            decimals: feedDecimals,
            symbol: symbol,
            active: true,
            lastRoundId: 0,
            callbackCount: 0
        });
        feedList.push(aggregator);
        
        emit FeedAdded(aggregator, symbol, feedDecimals);
        
        // Subscribe to new feed
        if (!vm) {
            service.subscribe(
                originChainId,
                aggregator,
                ANSWER_UPDATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            emit FeedSubscribed(originChainId, aggregator);
        }
    }
    
    /**
     * @notice Deactivate a feed (owner only)
     */
    function removeFeed(address aggregator) external onlyOwner {
        require(feeds[aggregator].active, "Feed not active");
        feeds[aggregator].active = false;
        
        // Unsubscribe
        if (!vm) {
            service.unsubscribe(
                originChainId,
                aggregator,
                ANSWER_UPDATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
        
        emit FeedRemoved(aggregator);
    }
    
    /**
     * @notice Update destination proxy address (owner only)
     * @dev Use when migrating to a new destination contract
     */
    function setDestinationProxy(address _newDestination) external onlyOwner {
        require(_newDestination != address(0), "Invalid destination");
        destinationProxy = _newDestination;
    }

    // ============ Manual Operations ============
    
    /**
     * @notice Force update for a specific feed (maintenance)
     */
    function forceUpdate(
        address feedAddr,
        uint256 roundId,
        int256 answer,
        uint256 updatedAt
    ) external payable {
        FeedInfo storage feedInfo = feeds[feedAddr];
        require(feedInfo.active, "Feed not active");
        
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),
            feedAddr,
            feedInfo.decimals,
            MESSAGE_VERSION,
            uint80(roundId),
            answer,
            updatedAt,
            updatedAt,
            uint80(roundId)
        );
        
        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
        emit CallbackSent(feedAddr, roundId, destinationProxy);
        
        feedInfo.callbackCount++;
        totalCallbacksSent++;
    }

    // ============ View Functions ============
    
    function getFeedCount() external view returns (uint256) {
        return feedList.length;
    }
    
    function getActiveFeeds() external view returns (address[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < feedList.length; i++) {
            if (feeds[feedList[i]].active) activeCount++;
        }
        
        address[] memory active = new address[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < feedList.length; i++) {
            if (feeds[feedList[i]].active) {
                active[idx] = feedList[i];
                idx++;
            }
        }
        return active;
    }
    
    function getFeedInfo(address aggregator) external view returns (
        uint8 feedDecimals,
        string memory symbol,
        bool active,
        uint256 lastRoundId,
        uint256 callbackCount
    ) {
        FeedInfo memory info = feeds[aggregator];
        return (info.decimals, info.symbol, info.active, info.lastRoundId, info.callbackCount);
    }
    
    function getStats() external view returns (
        uint256 feedCount,
        uint256 totalCallbacks,
        uint256 totalEvents
    ) {
        return (feedList.length, totalCallbacksSent, totalEventsReceived);
    }
    
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
    
    function isPaused() external view returns (bool) {
        return paused;
    }
    
    function getOwner() external view returns (address) {
        return owner;
    }
}
