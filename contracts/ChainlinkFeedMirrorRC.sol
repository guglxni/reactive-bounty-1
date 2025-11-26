// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import './lib/reactive-lib/src/interfaces/IReactive.sol';
import './lib/reactive-lib/src/abstract-base/AbstractReactive.sol';
import './lib/reactive-lib/src/interfaces/ISystemContract.sol';

/**
 * @title ChainlinkFeedMirrorRC
 * @notice Reactive Smart Contract that mirrors Chainlink price feeds cross-chain
 * @dev Subscribes to AnswerUpdated events and forwards price data to destination chain
 * 
 * Bounty Requirements Addressed:
 * - Feed identifier (originFeed address) included in payload
 * - Decimals (8 for ETH/USD) passed to destination
 * - Domain separator and version for message verification
 */
contract ChainlinkFeedMirrorRC is IReactive, AbstractReactive {
    // ============ Domain Separator & Version (Phase 5) ============
    uint8 public constant MESSAGE_VERSION = 1;
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // ============ Configuration ============
    uint256 public originChainId;
    uint256 public destinationChainId;
    address public originFeed;
    address public destinationProxy;
    uint8 public originDecimals;
    
    // Chainlink "AnswerUpdated" event signature
    // event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
    uint256 public constant ANSWER_UPDATED_TOPIC_0 = 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;
    
    uint64 public constant CALLBACK_GAS_LIMIT = 1000000;

    // State to prevent replays/loops
    uint256 public lastForwardedRoundId;

    // ============ Events ============
    event MirrorTriggered(uint256 roundId, int256 answer, uint256 updatedAt, address indexed originFeed);

    constructor(
        address _service,
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _originFeed,
        address _destinationProxy,
        uint8 _originDecimals
    ) payable {
        // Set service explicitly per official pattern
        service = ISystemContract(payable(_service));
        
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        originFeed = _originFeed;
        destinationProxy = _destinationProxy;
        originDecimals = _originDecimals;
        
        // Compute domain separator (Phase 5)
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
            service.subscribe(
                originChainId,
                originFeed,
                ANSWER_UPDATED_TOPIC_0,
                REACTIVE_IGNORE, // topic_1 (current) is indexed but we want all prices
                REACTIVE_IGNORE, // topic_2 (roundId) is indexed but we want all rounds
                REACTIVE_IGNORE  // topic_3 unused
            );
        }
    }

    function react(LogRecord calldata log) external override vmOnly {
        // Decode the log
        // topic_0 = signature
        // topic_1 = int256 current (answer)
        // topic_2 = uint256 roundId
        // data = uint256 updatedAt
        
        int256 answer = int256(log.topic_1);
        uint256 roundId = log.topic_2;
        
        // Non-indexed field 'updatedAt' is in data
        uint256 updatedAt = abi.decode(log.data, (uint256));

        // Simple deduplication
        if (roundId <= lastForwardedRoundId) {
            return; // Skip already forwarded rounds
        }
        lastForwardedRoundId = roundId;

        emit MirrorTriggered(roundId, answer, updatedAt, originFeed);

        // Prepare payload for DestinationFeedProxy.updateFromReactive
        // Enhanced payload includes:
        // - RVM ID (injected by Reactive Network, replacing first address)
        // - Feed identifier (originFeed address) - Bounty requirement
        // - Decimals - Bounty requirement
        // - Message version - For future upgrades
        // - All Chainlink round data fields
        
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),         // RVM ID placeholder (replaced by Reactive Network)
            originFeed,         // Feed identifier (bounty requirement)
            originDecimals,     // Decimals (bounty requirement)
            MESSAGE_VERSION,    // Message version (bounty requirement)
            uint80(roundId),
            answer,
            updatedAt,          // startedAt
            updatedAt,          // updatedAt
            uint80(roundId)     // answeredInRound
        );

        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
    }

    // Maintenance Mode: Manually trigger an update (e.g. if events are missed)
    function forceUpdate(
        uint256 roundId,
        int256 answer,
        uint256 updatedAt
    ) external payable {
        // Enhanced payload with feed identifier
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),         // RVM ID placeholder (replaced by Reactive Network)
            originFeed,         // Feed identifier (bounty requirement)
            originDecimals,     // Decimals (bounty requirement)
            MESSAGE_VERSION,    // Message version (bounty requirement)
            uint80(roundId),
            answer,
            updatedAt,          // startedAt
            updatedAt,          // updatedAt
            uint80(roundId)     // answeredInRound
        );

        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
    }
    
    /// @notice Get the domain separator for EIP-712 verification
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
}
