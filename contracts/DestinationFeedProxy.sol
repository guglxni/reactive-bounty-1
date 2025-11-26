// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/AggregatorV3Interface.sol";
import "./lib/reactive-lib/src/abstract-base/AbstractCallback.sol";

/**
 * @title DestinationFeedProxy
 * @notice Receives price updates from the Reactive Network and exposes them via AggregatorV3Interface.
 * @dev Uses AbstractCallback pattern from reactive-lib for secure callback handling.
 * 
 * Bounty Requirements Addressed:
 * - Feed identifier validation (expectedOriginFeed)
 * - Decimals verification from source
 * - Message version validation
 * - AbstractCallback pattern for security
 */
contract DestinationFeedProxy is AggregatorV3Interface, AbstractCallback {
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    RoundData private s_latestRound;
    uint8 public override decimals;
    string public override description;
    uint256 public override version;

    // ============ Feed Identifier Validation (Phase 1) ============
    /// @notice Expected origin feed address for validation
    address public expectedOriginFeed;
    
    /// @notice The specific Reactive Contract (on Lasna) authorized to send updates
    address public authorizedReactiveContract;
    address public owner;
    
    // ============ Message Version (Phase 5) ============
    uint8 public constant EXPECTED_MESSAGE_VERSION = 1;

    // ============ Events ============
    event FeedUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event FeedSourceVerified(address indexed originFeed, uint80 roundId);
    event AuthorizedReactiveContractChanged(address indexed oldContract, address indexed newContract);
    event ExpectedOriginFeedChanged(address indexed oldFeed, address indexed newFeed);
    event DebugCallback(address sender, address originFeed, uint8 decimals, uint8 messageVersion);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: only owner");
        _;
    }

    /**
     * @notice Constructor for DestinationFeedProxy
     * @param _callback_sender The Callback Proxy address on this chain (Sepolia: 0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA)
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
    }

    /**
     * @notice Sets the authorized Reactive Contract address (on Lasna) that can trigger updates.
     * @dev This is the address of your ChainlinkFeedMirrorRC deployed on the Reactive Network.
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

    // ============ Resilience: Stale Price Detection ============
    uint256 public constant STALE_THRESHOLD = 3 hours;

    function isStale() external view returns (bool) {
        return (block.timestamp - s_latestRound.updatedAt) > STALE_THRESHOLD;
    }

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
        // Debug event for monitoring
        emit DebugCallback(sender, _originFeed, _decimals, _messageVersion);

        // Validate RVM sender if set
        if (authorizedReactiveContract != address(0)) {
            require(sender == authorizedReactiveContract, "Unauthorized RVM Sender");
        }
        
        // Phase 1: Validate feed source
        if (expectedOriginFeed != address(0)) {
            require(_originFeed == expectedOriginFeed, "Invalid feed source");
        }
        emit FeedSourceVerified(_originFeed, _roundId);
        
        // Phase 5: Validate message version
        require(_messageVersion == EXPECTED_MESSAGE_VERSION, "Invalid message version");
        
        // Validate decimals match
        require(_decimals == decimals, "Decimals mismatch");

        // Sanity check: positive price
        require(_answer > 0, "Invalid price: must be positive");
        
        // Monotonicity check: ensure we don't revert to older data
        require(_roundId > s_latestRound.roundId, "Stale update: roundId regression");
        require(_updatedAt >= s_latestRound.updatedAt, "Stale update: updatedAt regression");

        s_latestRound = RoundData({
            roundId: _roundId,
            answer: _answer,
            startedAt: _startedAt,
            updatedAt: _updatedAt,
            answeredInRound: _answeredInRound
        });

        emit FeedUpdated(_roundId, _answer, _updatedAt);
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
        if (_roundId == s_latestRound.roundId) {
            return (
                s_latestRound.roundId,
                s_latestRound.answer,
                s_latestRound.startedAt,
                s_latestRound.updatedAt,
                s_latestRound.answeredInRound
            );
        }
        revert("Round data not found");
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
    
    // ============ Utility Functions ============
    
    /// @notice Get the expected message version
    function getExpectedMessageVersion() external pure returns (uint8) {
        return EXPECTED_MESSAGE_VERSION;
    }
    
    /// @notice Withdraw accumulated funds (for callback payments)
    function withdrawFunds(address payable _to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success,) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }
}
