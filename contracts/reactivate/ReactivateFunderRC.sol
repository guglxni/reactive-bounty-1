// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/reactive-lib/src/interfaces/IReactive.sol";
import "../lib/reactive-lib/src/interfaces/IPayer.sol";
import "../lib/reactive-lib/src/abstract-base/AbstractPayer.sol";
import "../lib/reactive-lib/src/abstract-base/AbstractPausableReactive.sol";

/**
 * @title ReactivateFunderRC
 * @notice Reactive Smart Contract for triggering Funder callbacks on schedule
 * @dev Subscribes to L1 events and triggers auto-refill/debt-coverage checks
 * 
 * Trigger Mechanism:
 * This RSC subscribes to either:
 * 1. Price Update events - piggyback on existing oracle updates
 * 2. Block events - periodic checks based on block production
 * 3. Any arbitrary event - flexible trigger mechanism
 * 
 * When triggered, it emits a callback to the Funder contract which then:
 * - Checks balances and refills if needed
 * - Checks debts and covers them if needed
 */
contract ReactivateFunderRC is AbstractPausableReactive {
    // ============ Configuration ============
    uint256 public immutable callbackChainId;
    address public immutable funderAddress;
    
    // ============ Subscription Config ============
    uint256 public immutable sourceChainId;
    address public immutable sourceContract;
    uint256 public immutable eventTopic;

    // ============ State ============
    uint64 public callbackCounter;
    uint256 public lastTriggerBlock;

    // ============ Rate Limiting ============
    uint256 public minBlocksBetweenCallbacks;  // 0 = no limit
    
    // ============ Events ============
    event FunderCallbackTriggered(
        uint64 indexed callbackId,
        uint256 sourceBlock,
        uint256 timestamp
    );

    /**
     * @notice Initialize the Funder RSC
     * @param _callbackChainId Chain ID where Funder is deployed
     * @param _funderAddress Funder contract address
     * @param _sourceChainId Chain ID to monitor for events
     * @param _sourceContract Contract address to monitor
     * @param _eventTopic Event topic to subscribe to (0 for REACTIVE_IGNORE = any event)
     * @param _minBlocksBetweenCallbacks Rate limiting (0 = no limit)
     */
    constructor(
        uint256 _callbackChainId,
        address _funderAddress,
        uint256 _sourceChainId,
        address _sourceContract,
        uint256 _eventTopic,
        uint256 _minBlocksBetweenCallbacks
    ) payable {
        callbackChainId = _callbackChainId;
        funderAddress = _funderAddress;
        sourceChainId = _sourceChainId;
        sourceContract = _sourceContract;
        eventTopic = _eventTopic != 0 ? _eventTopic : REACTIVE_IGNORE;
        minBlocksBetweenCallbacks = _minBlocksBetweenCallbacks;

        // Subscribe in reactive network mode (not VM mode)
        if (!vm) {
            service.subscribe(
                _sourceChainId,
                _sourceContract,
                eventTopic,
                REACTIVE_IGNORE,  // topic1 wildcard
                REACTIVE_IGNORE,  // topic2 wildcard
                REACTIVE_IGNORE   // topic3 wildcard
            );
        }
    }

    /**
     * @notice Get subscriptions for pause/resume functionality
     * @return Array of subscriptions
     */
    function getPausableSubscriptions() internal view override returns (Subscription[] memory) {
        Subscription[] memory subs = new Subscription[](1);
        subs[0] = Subscription(
            sourceChainId,
            sourceContract,
            eventTopic,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        return subs;
    }

    /**
     * @notice React to subscribed events
     * @dev Triggers callback to Funder for balance/debt checks
     */
    function react(LogRecord calldata log) external vmOnly {
        // Rate limiting check
        if (minBlocksBetweenCallbacks > 0) {
            if (block.number < lastTriggerBlock + minBlocksBetweenCallbacks) {
                return;  // Skip - too soon since last callback
            }
        }

        lastTriggerBlock = block.number;
        callbackCounter++;

        // Prepare callback data
        bytes memory callbackData = abi.encodeWithSignature(
            "callback(address,uint64)",
            funderAddress,
            callbackCounter
        );

        // Emit callback through Callback Proxy
        emit Callback(
            callbackChainId,
            funderAddress,
            0,  // No ETH value
            callbackData
        );

        emit FunderCallbackTriggered(
            callbackCounter,
            log.block_number,
            block.timestamp
        );
    }

    /**
     * @notice Update rate limiting parameter
     * @param newMinBlocks New minimum blocks between callbacks
     */
    function setMinBlocksBetweenCallbacks(uint256 newMinBlocks) external onlyOwner {
        minBlocksBetweenCallbacks = newMinBlocks;
    }

    /**
     * @notice Subscribe to additional event source
     * @param chainId Chain ID to monitor
     * @param contractAddress Contract to monitor
     * @param topic Event topic (0 for wildcard)
     */
    function addSubscription(
        uint256 chainId,
        address contractAddress,
        uint256 topic
    ) external onlyOwner rnOnly {
        uint256 topic0 = topic != 0 ? topic : REACTIVE_IGNORE;
        
        service.subscribe(
            chainId,
            contractAddress,
            topic0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }

    /**
     * @notice Remove subscription
     * @param chainId Chain ID
     * @param contractAddress Contract address
     * @param topic Event topic
     */
    function removeSubscription(
        uint256 chainId,
        address contractAddress,
        uint256 topic
    ) external onlyOwner rnOnly {
        uint256 topic0 = topic != 0 ? topic : REACTIVE_IGNORE;
        
        service.unsubscribe(
            chainId,
            contractAddress,
            topic0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }

    /**
     * @notice Manual trigger for testing
     * @dev Only callable by owner
     */
    function manualTrigger() external onlyOwner {
        callbackCounter++;
        
        bytes memory callbackData = abi.encodeWithSignature(
            "callback(address,uint64)",
            funderAddress,
            callbackCounter
        );

        emit Callback(
            callbackChainId,
            funderAddress,
            0,
            callbackData
        );

        emit FunderCallbackTriggered(
            callbackCounter,
            block.number,
            block.timestamp
        );
    }

    /// @notice Receive ETH for gas
    receive() external payable override(AbstractPayer, IPayer) {}
}
