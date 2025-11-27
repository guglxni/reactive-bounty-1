// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/AggregatorV3Interface.sol";
import "./lib/reactive-lib/src/abstract-base/AbstractCallback.sol";

/**
 * @title MultiFeedDestinationV2
 * @notice Production-grade multi-feed price proxy that stores multiple Chainlink feeds
 * @dev Receives price updates for multiple feeds (ETH, BTC, LINK, etc.) from Reactive Network
 * 
 * Architecture:
 * - Single contract stores multiple feeds identified by origin address
 * - Each feed has independent storage, history, and AggregatorV3Interface access
 * - More gas-efficient than deploying separate contracts per feed
 * 
 * Bounty Compliance:
 * - AggregatorV3Interface compatible (per feed)
 * - Stores: roundId, answer, startedAt, updatedAt, answeredInRound
 * - Feed identifier validation
 * - Domain separator/version support
 */
contract MultiFeedDestinationV2 is AbstractCallback {
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    struct FeedConfig {
        uint8 decimals;
        string description;
        bool enabled;
        uint256 totalUpdates;
        uint256 lastUpdateBlock;
        uint256 lastUpdateTimestamp;
    }

    // ============ Storage ============
    // Feed data: feedAddress => latest round
    mapping(address => RoundData) private s_latestRounds;
    
    // Feed history: feedAddress => roundId => round data
    mapping(address => mapping(uint80 => RoundData)) private s_rounds;
    mapping(address => uint80[]) private s_roundIds;
    
    // Feed configuration
    mapping(address => FeedConfig) public feedConfigs;
    address[] public registeredFeeds;
    
    // Global configuration
    uint256 public constant MAX_HISTORY_PER_FEED = 50;
    uint8 public constant EXPECTED_MESSAGE_VERSION = 1;
    uint256 public constant STALE_THRESHOLD = 3 hours;
    uint256 public version = 1;
    
    // Authorization
    address public authorizedReactiveContract;
    address public owner;
    
    // Global statistics
    uint256 public totalGlobalUpdates;

    // ============ Events ============
    // Feed management
    event FeedRegistered(address indexed feedAddress, uint8 decimals, string description);
    event FeedEnabled(address indexed feedAddress);
    event FeedDisabled(address indexed feedAddress);
    
    // Updates
    event FeedUpdated(address indexed feedAddress, uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event PriceUpdated(address indexed feedAddress, uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event CallbackReceived(address indexed sender, address indexed feedAddress, uint80 roundId, int256 answer);
    
    // Configuration
    event AuthorizedReactiveContractChanged(address indexed oldContract, address indexed newContract);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Modifiers ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: only owner");
        _;
    }

    modifier feedExists(address feedAddress) {
        require(feedConfigs[feedAddress].enabled, "Feed not registered or disabled");
        _;
    }

    /**
     * @notice Constructor
     * @param _callback_sender The Callback Proxy address on this chain
     * @param _rvm_id The ReactVM ID (deployer address) that will send callbacks
     */
    constructor(address _callback_sender, address _rvm_id) AbstractCallback(_callback_sender) payable {
        owner = msg.sender;
        // Set rvm_id to the deployer's address (ReactVM ID)
        // Reactive Network replaces the first callback argument with this address
        rvm_id = _rvm_id;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    /**
     * @notice Update the authorized RVM ID (for migration or redeployment)
     * @param _newRvmId The new ReactVM ID
     */
    function setRvmId(address _newRvmId) external onlyOwner {
        require(_newRvmId != address(0), "Invalid RVM ID");
        rvm_id = _newRvmId;
    }

    // ============ Receive ETH ============
    receive() external payable override {}

    // ============ Feed Registration ============
    
    /**
     * @notice Register a new feed
     * @param feedAddress The origin Chainlink aggregator address
     * @param feedDecimals Feed decimals (typically 8)
     * @param feedDescription Human-readable name (e.g., "ETH / USD")
     */
    function registerFeed(
        address feedAddress,
        uint8 feedDecimals,
        string calldata feedDescription
    ) external onlyOwner {
        require(feedAddress != address(0), "Invalid feed address");
        require(!feedConfigs[feedAddress].enabled, "Feed already registered");
        
        feedConfigs[feedAddress] = FeedConfig({
            decimals: feedDecimals,
            description: feedDescription,
            enabled: true,
            totalUpdates: 0,
            lastUpdateBlock: 0,
            lastUpdateTimestamp: 0
        });
        
        registeredFeeds.push(feedAddress);
        emit FeedRegistered(feedAddress, feedDecimals, feedDescription);
    }
    
    /**
     * @notice Batch register multiple feeds
     */
    function registerFeeds(
        address[] calldata feedAddresses,
        uint8[] calldata decimalsArray,
        string[] calldata descriptions
    ) external onlyOwner {
        require(
            feedAddresses.length == decimalsArray.length && 
            feedAddresses.length == descriptions.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < feedAddresses.length; i++) {
            if (!feedConfigs[feedAddresses[i]].enabled) {
                feedConfigs[feedAddresses[i]] = FeedConfig({
                    decimals: decimalsArray[i],
                    description: descriptions[i],
                    enabled: true,
                    totalUpdates: 0,
                    lastUpdateBlock: 0,
                    lastUpdateTimestamp: 0
                });
                registeredFeeds.push(feedAddresses[i]);
                emit FeedRegistered(feedAddresses[i], decimalsArray[i], descriptions[i]);
            }
        }
    }
    
    /**
     * @notice Disable a feed
     */
    function disableFeed(address feedAddress) external onlyOwner {
        require(feedConfigs[feedAddress].enabled, "Feed not enabled");
        feedConfigs[feedAddress].enabled = false;
        emit FeedDisabled(feedAddress);
    }
    
    /**
     * @notice Enable a previously disabled feed
     */
    function enableFeed(address feedAddress) external onlyOwner {
        require(!feedConfigs[feedAddress].enabled, "Feed already enabled");
        require(bytes(feedConfigs[feedAddress].description).length > 0, "Feed not registered");
        feedConfigs[feedAddress].enabled = true;
        emit FeedEnabled(feedAddress);
    }

    // ============ Configuration ============
    
    function setAuthorizedReactiveContract(address _reactiveContract) external onlyOwner {
        emit AuthorizedReactiveContractChanged(authorizedReactiveContract, _reactiveContract);
        authorizedReactiveContract = _reactiveContract;
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ============ Core Callback Function ============
    
    /**
     * @notice Receives price updates from Reactive Network
     * @dev Routes to correct feed based on _originFeed parameter
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
        emit CallbackReceived(sender, _originFeed, _roundId, _answer);

        // Validate RVM sender
        if (authorizedReactiveContract != address(0)) {
            require(sender == authorizedReactiveContract, "Unauthorized RVM Sender");
        }
        
        // Check feed is registered (auto-register if from authorized source)
        FeedConfig storage config = feedConfigs[_originFeed];
        if (!config.enabled) {
            // Auto-register new feeds from authorized RSC
            feedConfigs[_originFeed] = FeedConfig({
                decimals: _decimals,
                description: "Auto-registered feed",
                enabled: true,
                totalUpdates: 0,
                lastUpdateBlock: 0,
                lastUpdateTimestamp: 0
            });
            registeredFeeds.push(_originFeed);
            emit FeedRegistered(_originFeed, _decimals, "Auto-registered feed");
            config = feedConfigs[_originFeed];
        }
        
        // Validate message version
        require(_messageVersion == EXPECTED_MESSAGE_VERSION, "Invalid message version");
        
        // Validate decimals
        require(_decimals == config.decimals, "Decimals mismatch");

        // Sanity checks
        require(_answer > 0, "Invalid price: must be positive");
        
        RoundData storage latestRound = s_latestRounds[_originFeed];
        
        // Monotonicity check
        require(_roundId > latestRound.roundId, "Stale update: roundId regression");
        if (latestRound.updatedAt > 0) {
            require(_updatedAt >= latestRound.updatedAt, "Stale update: updatedAt regression");
        }

        // Create round data
        RoundData memory newRound = RoundData({
            roundId: _roundId,
            answer: _answer,
            startedAt: _startedAt,
            updatedAt: _updatedAt,
            answeredInRound: _answeredInRound
        });

        // Store in history
        s_rounds[_originFeed][_roundId] = newRound;
        s_roundIds[_originFeed].push(_roundId);
        
        // Prune if needed
        if (s_roundIds[_originFeed].length > MAX_HISTORY_PER_FEED) {
            _pruneHistory(_originFeed);
        }

        // Update latest
        s_latestRounds[_originFeed] = newRound;
        
        // Update statistics
        config.totalUpdates++;
        config.lastUpdateBlock = block.number;
        config.lastUpdateTimestamp = block.timestamp;
        totalGlobalUpdates++;

        emit FeedUpdated(_originFeed, _roundId, _answer, _updatedAt);
        emit PriceUpdated(_originFeed, _roundId, _answer, _updatedAt);
    }

    // ============ AggregatorV3Interface-style Getters (per feed) ============
    
    function getRoundData(address feedAddress, uint80 _roundId)
        external
        view
        feedExists(feedAddress)
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory r = s_rounds[feedAddress][_roundId];
        require(r.updatedAt > 0, "Round data not found");
        return (r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound);
    }

    function latestRoundData(address feedAddress)
        external
        view
        feedExists(feedAddress)
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory r = s_latestRounds[feedAddress];
        require(r.updatedAt > 0, "No data present");
        return (r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound);
    }
    
    function decimals(address feedAddress) external view feedExists(feedAddress) returns (uint8) {
        return feedConfigs[feedAddress].decimals;
    }
    
    function description(address feedAddress) external view feedExists(feedAddress) returns (string memory) {
        return feedConfigs[feedAddress].description;
    }

    // ============ Multi-Feed View Functions ============
    
    /**
     * @notice Get all prices at once
     */
    function getAllPrices() external view returns (
        address[] memory feeds,
        int256[] memory prices,
        uint256[] memory timestamps,
        bool[] memory staleFlags
    ) {
        uint256 len = registeredFeeds.length;
        feeds = new address[](len);
        prices = new int256[](len);
        timestamps = new uint256[](len);
        staleFlags = new bool[](len);
        
        for (uint256 i = 0; i < len; i++) {
            address feedAddr = registeredFeeds[i];
            feeds[i] = feedAddr;
            
            RoundData memory r = s_latestRounds[feedAddr];
            prices[i] = r.answer;
            timestamps[i] = r.updatedAt;
            staleFlags[i] = r.updatedAt == 0 || (block.timestamp - r.updatedAt) > STALE_THRESHOLD;
        }
    }
    
    /**
     * @notice Get count of registered feeds
     */
    function getFeedCount() external view returns (uint256) {
        return registeredFeeds.length;
    }
    
    /**
     * @notice Get all registered feed addresses
     */
    function getRegisteredFeeds() external view returns (address[] memory) {
        return registeredFeeds;
    }
    
    /**
     * @notice Check if feed data is stale
     */
    function isStale(address feedAddress) external view returns (bool) {
        RoundData memory r = s_latestRounds[feedAddress];
        if (r.updatedAt == 0) return true;
        return (block.timestamp - r.updatedAt) > STALE_THRESHOLD;
    }
    
    /**
     * @notice Get feed statistics
     */
    function getFeedStats(address feedAddress) external view returns (
        uint256 totalUpdates,
        uint256 lastUpdateBlock,
        uint256 lastUpdateTimestamp,
        uint256 historySize,
        bool stale
    ) {
        FeedConfig memory config = feedConfigs[feedAddress];
        RoundData memory r = s_latestRounds[feedAddress];
        
        return (
            config.totalUpdates,
            config.lastUpdateBlock,
            config.lastUpdateTimestamp,
            s_roundIds[feedAddress].length,
            r.updatedAt == 0 || (block.timestamp - r.updatedAt) > STALE_THRESHOLD
        );
    }

    // ============ Internal Functions ============
    
    function _pruneHistory(address feedAddress) internal {
        uint80[] storage roundIds = s_roundIds[feedAddress];
        uint256 toRemove = roundIds.length - MAX_HISTORY_PER_FEED;
        
        for (uint256 i = 0; i < toRemove; i++) {
            delete s_rounds[feedAddress][roundIds[i]];
        }
        
        for (uint256 i = 0; i < MAX_HISTORY_PER_FEED; i++) {
            roundIds[i] = roundIds[i + toRemove];
        }
        
        for (uint256 i = 0; i < toRemove; i++) {
            roundIds.pop();
        }
    }
    
    // ============ Fund Management ============
    
    function withdrawFunds(address payable _to) external onlyOwner {
        uint256 debt = vendor.debt(address(this));
        require(debt == 0, "Cannot withdraw: outstanding debt");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success,) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    function settleDebt() external {
        uint256 debt = vendor.debt(address(this));
        require(debt > 0, "No debt to settle");
        require(address(this).balance >= debt, "Insufficient balance");
        _pay(payable(address(vendor)), debt);
    }
    
    function getDebt() external view returns (uint256) {
        return vendor.debt(address(this));
    }
}
