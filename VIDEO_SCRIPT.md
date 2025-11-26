# 🎬 Demo Video Script - Reactive Cross-Chain Multi-Feed Price Oracle

**Duration:** 4-5 minutes  
**Bounty:** Sprint #1 - Cross-Chain Oracle  
**GitHub:** https://github.com/guglxni/reactive-bounty-1

---

## 📋 VIDEO OUTLINE

| Section | Time | Content |
|---------|------|---------|
| 1. Introduction | 0:00-0:30 | Problem statement & solution overview |
| 2. Architecture | 0:30-1:15 | Three-chain workflow diagram |
| 3. Code Walkthrough | 1:15-2:30 | RSC & Destination contracts |
| 4. Live Demo | 2:30-3:45 | Transaction hashes & Telegram bot |
| 5. Security & Testing | 3:45-4:30 | Security features & 199 tests |
| 6. Conclusion | 4:30-5:00 | Summary & bounty compliance |

---

## 🎥 SECTION 1: INTRODUCTION (0:00 - 0:30)

### SLIDE: Title Card
```
REACTIVE CROSS-CHAIN MULTI-FEED PRICE ORACLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sprint #1 Bounty Submission
November 2025
```

### NARRATION:

> "Hi, I'm presenting my submission for Reactive Bounties 2.0 Sprint #1 - the Cross-Chain Oracle challenge.
>
> **The Problem:** Chainlink price feeds aren't available on every chain. DeFi applications on chains without native Chainlink support need reliable price data, but building custom oracle infrastructure is expensive, complex, and requires constant monitoring.
>
> **My Solution:** A production-grade, autonomous cross-chain oracle that mirrors MULTIPLE Chainlink price feeds from Base Sepolia to Ethereum Sepolia using Reactive Network contracts. 
>
> **Going Beyond the Spec:** Instead of mirroring just one feed, I built a multi-feed system that mirrors THREE price feeds - ETH/USD, BTC/USD, and LINK/USD - all through a single Reactive Smart Contract. I also built a Telegram bot for real-time monitoring."

---

## 🎥 SECTION 2: ARCHITECTURE (0:30 - 1:15)

### SLIDE: Three-Chain Architecture
```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BASE SEPOLIA (Origin - Chain 84532)                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  CHAINLINK PRICE AGGREGATORS                                      │  │
│  │  • ETH/USD: 0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3           │  │
│  │  • BTC/USD: 0x961AD289351459A45fC90884eF3AB0278ea95DDE           │  │
│  │  • LINK/USD: 0xAc6DB6d5538Cd07f58afee9dA736ce192119017B          │  │
│  │                                                                   │  │
│  │  Emits: AnswerUpdated(int256 answer, uint256 roundId, uint256 ts) │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Event Subscription
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   REACTIVE LASNA (Chain 5318007)                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  MultiFeedMirrorRCv2 (RSC)                                        │  │
│  │  Address: 0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5              │  │
│  │                                                                   │  │
│  │  ✓ Subscribes to 3 Chainlink feeds simultaneously                 │  │
│  │  ✓ Per-feed deduplication (lastRoundId mapping)                   │  │
│  │  ✓ EIP-712 style DOMAIN_SEPARATOR + MESSAGE_VERSION               │  │
│  │  ✓ Emits Callback events to destination                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Callback Event
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   ETHEREUM SEPOLIA (Destination - Chain 11155111)        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Callback Proxy: 0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  MultiFeedDestinationV2                                           │  │
│  │  Address: 0x889c32f46E273fBd0d5B1806F3f1286010cD73B               │  │
│  │                                                                   │  │
│  │  ✓ Stores prices for ALL feeds in single contract                 │  │
│  │  ✓ AggregatorV3Interface compatible (per feed)                    │  │
│  │  ✓ Dual authorization (Callback Proxy + RVM ID)                   │  │
│  │  ✓ Monotonicity enforcement, stale detection                      │  │
│  │  ✓ Auto-registers new feeds from authorized RSC                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### NARRATION:

> "Here's how the system works across THREE chains:
>
> **Step 1 - Origin Chain (Base Sepolia):** Chainlink's official price aggregators emit `AnswerUpdated` events whenever prices change. My RSC subscribes to three feeds: ETH/USD, BTC/USD, and LINK/USD.
>
> **Step 2 - Reactive Network (Lasna):** The MultiFeedMirrorRCv2 - my Reactive Smart Contract - listens for these events AUTONOMOUSLY. When a price update occurs, it validates the data, checks for duplicates using per-feed round tracking, and constructs a callback payload that includes the feed identifier, decimals, and message version as required by the bounty spec.
>
> **Step 3 - Destination Chain (Sepolia):** The Callback Proxy delivers the update to my MultiFeedDestinationV2 contract. This contract validates the sender, stores the price data with monotonicity enforcement, and exposes a standard AggregatorV3Interface so any DeFi app can consume the mirrored prices.
>
> **The key insight:** One RSC handles multiple feeds, one destination stores all prices. This is more gas-efficient and easier to maintain than deploying separate contracts per feed."

---

## 🎥 SECTION 3: CODE WALKTHROUGH (1:15 - 2:30)

### SLIDE: RSC Contract - MultiFeedMirrorRCv2.sol

```solidity
// MultiFeedMirrorRCv2.sol - The Reactive Smart Contract

contract MultiFeedMirrorRCv2 is IReactive, AbstractPausableReactive {
    // Bounty requirement: Domain separator and version
    uint8 public constant MESSAGE_VERSION = 1;
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // Multi-feed support: mapping of feed address → feed info
    mapping(address => FeedInfo) public feeds;
    
    // The magic happens in react()
    function react(LogRecord calldata log) external override vmOnly {
        // Only process AnswerUpdated events
        if (log.topic_0 != ANSWER_UPDATED_TOPIC_0) return;
        
        // Identify which feed emitted this event
        address feedAddr = log._contract;
        FeedInfo storage feedInfo = feeds[feedAddr];
        
        // Deduplication: skip if we've already processed this round
        if (roundId <= feedInfo.lastRoundId) return;
        feedInfo.lastRoundId = roundId;
        
        // Construct callback with ALL bounty-required fields:
        // - Feed identifier (origin aggregator address)
        // - Decimals
        // - Message version
        // - Full round data
        bytes memory payload = abi.encodeWithSignature(
            "updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)",
            address(0),          // RVM ID (injected by system)
            feedAddr,            // Feed identifier ← BOUNTY REQUIREMENT
            feedInfo.decimals,   // Decimals ← BOUNTY REQUIREMENT
            MESSAGE_VERSION,     // Version ← BOUNTY REQUIREMENT
            roundId, answer, updatedAt, updatedAt, roundId
        );
        
        // Emit callback to destination chain
        emit Callback(destinationChainId, destinationProxy, CALLBACK_GAS_LIMIT, payload);
    }
}
```

### NARRATION:

> "Let me walk through the core code.
>
> The RSC contract inherits from AbstractPausableReactive, which is the official Reactive Network pattern. The key function is `react()` - this is called automatically by the ReactVM whenever a subscribed event occurs.
>
> When a Chainlink aggregator emits an AnswerUpdated event, my contract:
> 1. Identifies which feed triggered the event
> 2. Performs deduplication to prevent processing the same round twice
> 3. Constructs a callback payload with all bounty-required fields: feed identifier, decimals, message version, and the full round data
> 4. Emits a Callback event that the Reactive Network delivers to the destination chain
>
> This all happens AUTONOMOUSLY - no manual intervention, no centralized relayer."

### SLIDE: Destination Contract - MultiFeedDestinationV2.sol

```solidity
// MultiFeedDestinationV2.sol - The Destination Contract

contract MultiFeedDestinationV2 is AbstractCallback {
    // Bounty requirement: AggregatorV3Interface-compatible storage
    mapping(address => RoundData) private s_latestRounds;
    mapping(address => FeedConfig) public feedConfigs;
    
    function updateFromReactive(
        address sender,           // RVM ID for authorization
        address _originFeed,      // Feed identifier ← VALIDATES THIS
        uint8 _decimals,          // Decimals ← VALIDATES THIS
        uint8 _messageVersion,    // Version ← VALIDATES THIS
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external authorizedSenderOnly rvmIdOnly(sender) {
        // Security: Validate message version
        require(_messageVersion == EXPECTED_MESSAGE_VERSION, "Invalid version");
        
        // Security: Validate decimals match registered feed
        require(_decimals == feedConfigs[_originFeed].decimals, "Decimals mismatch");
        
        // Security: Monotonicity - prevent price regression
        require(_roundId > s_latestRounds[_originFeed].roundId, "Stale update");
        
        // Store the update
        s_latestRounds[_originFeed] = RoundData({...});
        
        emit FeedUpdated(_originFeed, _roundId, _answer, _updatedAt);
    }
    
    // Bounty requirement: AggregatorV3Interface-compatible getter
    function latestRoundData(address feedAddress) external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, 
        uint256 updatedAt, uint80 answeredInRound
    ) {
        return (r.roundId, r.answer, r.startedAt, r.updatedAt, r.answeredInRound);
    }
}
```

### NARRATION:

> "The destination contract inherits from AbstractCallback, the official Reactive pattern for callback receivers.
>
> When an update arrives, it performs multiple security checks:
> - Validates the callback proxy sender
> - Validates the RVM ID
> - Validates the message version matches expected
> - Validates decimals match the registered feed
> - Enforces monotonicity to prevent replay attacks
>
> Then it stores the data and emits events. Applications can read prices using the standard `latestRoundData()` function, making it a drop-in replacement for native Chainlink feeds."

---

## 🎥 SECTION 4: LIVE DEMO (2:30 - 3:45)

### SLIDE: Transaction Hashes - Complete Workflow

```
═══════════════════════════════════════════════════════════════════════════
                    TRANSACTION HASHES - BOUNTY REQUIREMENT
═══════════════════════════════════════════════════════════════════════════

STEP 1: ORIGIN TRANSACTIONS (Base Sepolia)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chainlink AnswerUpdated events that triggered our RSC:

• 0x205f180a3479e3a48b8de09e33fb0a171915add491d8406efa96c922c2f233e7
  → https://sepolia.basescan.org/tx/0x205f180a...

STEP 2: REACTIVE TRANSACTIONS (Lasna - Chain 5318007)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RSC processing and emitting callbacks:

• 0x45c0649500f14746e151e32cbe0576ffdd122d24493b4237fcaf1495affa7f1a
  → https://reactscan.net/tx/0x45c0649500f14746...
  
• 0x17d81f88a37acb239f38b98afd8b8f6b1e5e4e40f0e9cadf41e69b9e95a0cf87
  → https://reactscan.net/tx/0x17d81f88a37acb23...

STEP 3: DESTINATION TRANSACTIONS (Sepolia)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Callback delivery and price storage:

• 0x9c577f914488f66795323b89d01f4c6c5bcc65922d3c85c16c98acf7a584bca2
  → https://sepolia.etherscan.io/tx/0x9c577f91...

═══════════════════════════════════════════════════════════════════════════
                         SYSTEM STATISTICS
═══════════════════════════════════════════════════════════════════════════

Total Cross-Chain Updates Delivered: 618+
├── ETH/USD: 228 updates
├── BTC/USD: 231 updates  
└── LINK/USD: 159 updates

Latest Prices (Mirrored on Sepolia):
• ETH/USD: $2,936.95
• BTC/USD: $87,315.80
• LINK/USD: $12.92
```

### NARRATION:

> "Here are the transaction hashes for every step of the workflow, as required by the bounty.
>
> **Origin transactions** on Base Sepolia - these are Chainlink's AnswerUpdated events. You can verify these on BaseScan.
>
> **Reactive transactions** on Lasna - these show my RSC processing the events and emitting callbacks. You can verify these on ReactScan.
>
> **Destination transactions** on Sepolia - these show the callback delivery and price updates. You can verify these on Etherscan.
>
> The system has processed over 618 cross-chain updates across all three feeds. That's production-grade reliability."

### SLIDE: Telegram Bot - Real-Time Monitoring

```
═══════════════════════════════════════════════════════════════════════════
                    TELEGRAM BOT - BONUS FEATURE
═══════════════════════════════════════════════════════════════════════════

🤖 AVAILABLE COMMANDS:

/prices     → Get all 3 prices at once (ETH, BTC, LINK)
/eth        → Get ETH/USD price (origin vs mirrored)
/btc        → Get BTC/USD price
/link       → Get LINK/USD price
/status     → Full system status with update counts
/txs        → Recent transaction hashes (all 3 chains!)
/workflow   → Complete cross-chain workflow explanation
/contracts  → All deployed contract addresses
/history    → Historical update statistics
/help       → List all commands

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SAMPLE OUTPUT (/prices command):

📊 MULTI-FEED PRICE ORACLE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 ETH/USD
   Origin (Base):    $2,937.12
   Mirrored (Sepolia): $2,936.95
   Updates: 228

🪙 BTC/USD
   Origin (Base):    $87,320.45
   Mirrored (Sepolia): $87,315.80
   Updates: 231

🔗 LINK/USD
   Origin (Base):    $12.95
   Mirrored (Sepolia): $12.92
   Updates: 159

✅ All feeds operational
```

### NARRATION:

> "As a bonus feature, I built a Telegram bot for real-time monitoring.
>
> You can check prices with slash-commands: /eth, /btc, /link, or /prices for all three.
>
> The /txs command shows recent transaction hashes across all three chains - exactly what the bounty requires.
>
> The /status command shows the full system status including update counts.
>
> This makes it easy to verify the system is working without manually checking block explorers."

---

## 🎥 SECTION 5: SECURITY & TESTING (3:45 - 4:30)

### SLIDE: Security Features

```
═══════════════════════════════════════════════════════════════════════════
                         SECURITY ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════

1. ABSTRACTCALLBACK PATTERN
   └── Official Reactive Network authorization pattern
   └── Only Callback Proxy (0xc9f3...bDA) can call updateFromReactive()

2. DUAL AUTHORIZATION
   └── authorizedSenderOnly: Validates Callback Proxy
   └── rvmIdOnly: Validates RVM ID of the calling RSC

3. FEED SOURCE VALIDATION
   └── Each update includes originFeed address
   └── Destination validates feed is registered

4. DECIMALS VALIDATION
   └── Prevents decimal mismatch attacks
   └── Ensures price interpretation is correct

5. MESSAGE VERSION (EIP-712 Style)
   └── DOMAIN_SEPARATOR immutable at deployment
   └── MESSAGE_VERSION = 1 for protocol upgrades

6. MONOTONICITY ENFORCEMENT
   └── roundId must increase (prevents replay)
   └── updatedAt must not decrease (prevents regression)

7. STALE PRICE DETECTION
   └── 3-hour freshness threshold
   └── isStale() function for consumers

8. PER-FEED DEDUPLICATION
   └── lastRoundId tracked per feed
   └── Prevents processing same update twice
```

### SLIDE: Test Results

```
═══════════════════════════════════════════════════════════════════════════
                           TEST RESULTS
═══════════════════════════════════════════════════════════════════════════

$ npm test

  MultiFeedDestinationV2
    ✓ Should store prices for multiple feeds
    ✓ Should validate message version
    ✓ Should enforce monotonicity
    ✓ Should detect stale prices
    ... (50+ tests)

  MultiFeedMirrorRCv2  
    ✓ Should subscribe to multiple feeds
    ✓ Should deduplicate rounds per feed
    ✓ Should emit correct callback payload
    ... (20+ tests)

  DestinationFeedProxy (single-feed)
    ✓ Should implement AggregatorV3Interface
    ... (38 tests)

  ChainlinkFeedMirrorRC (single-feed)
    ✓ Should process AnswerUpdated events
    ... (21 tests)

  ChainlinkFeedMirrorCronRC (cron mode)
    ✓ Should support polling mode
    ... (18 tests)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  199 passing (3s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### NARRATION:

> "Security is critical for price oracles. My implementation includes eight security features:
>
> 1. The AbstractCallback pattern from Reactive's official library
> 2. Dual authorization checking both the Callback Proxy AND the RVM ID
> 3. Feed source validation to ensure data comes from expected origins
> 4. Decimals validation to prevent misinterpretation attacks
> 5. EIP-712 style domain separator and message version for protocol safety
> 6. Monotonicity enforcement to prevent replay and regression attacks
> 7. Stale price detection with a 3-hour threshold
> 8. Per-feed deduplication in the RSC
>
> The test suite covers all of this - 199 tests passing, covering core logic, edge cases, and security invariants."

---

## 🎥 SECTION 6: CONCLUSION (4:30 - 5:00)

### SLIDE: Bounty Compliance Checklist

```
═══════════════════════════════════════════════════════════════════════════
                    BOUNTY COMPLIANCE CHECKLIST
═══════════════════════════════════════════════════════════════════════════

REQUIRED                                                           STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Deployed on Reactive testnet                                    DONE
   RSC: 0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5

✅ Reactive Contracts included                                     DONE
   MultiFeedMirrorRCv2.sol

✅ Destination contracts included                                  DONE
   MultiFeedDestinationV2.sol

✅ Deploy scripts and instructions                                 DONE
   scripts/deploy_multi_feed_v2.ts, scripts/redeploy_3_feeds.ts

✅ RSC address documented                                          DONE

✅ Origin/Destination addresses documented                         DONE

✅ Problem explanation (why Reactive?)                             DONE

✅ Step-by-step workflow description                               DONE

✅ Transaction hashes for ALL steps                                DONE
   Origin, Reactive, AND Destination txs provided

✅ Feed identifier in payload                                      DONE
   originFeed address included

✅ Decimals in payload                                             DONE
   uint8 decimals included

✅ Domain separator/version                                        DONE
   EIP-712 style DOMAIN_SEPARATOR + MESSAGE_VERSION

✅ AggregatorV3Interface compatible                                DONE
   latestRoundData() exposed per feed

✅ Demo video under 5 minutes                                      THIS VIDEO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BONUS FEATURES                                                     STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ Multi-feed support (3 feeds, 1 RSC)                             DONE
⭐ Telegram bot for real-time monitoring                           DONE
⭐ 199 comprehensive tests                                         DONE
⭐ 618+ live cross-chain updates                                   DONE
⭐ Auto-registration of new feeds                                  DONE
⭐ Historical price storage (50 rounds per feed)                   DONE
```

### NARRATION:

> "Let me summarize why this submission meets and exceeds the bounty requirements:
>
> **All required items are complete:** Reactive contracts, destination contracts, deploy scripts, addresses documented, problem explanation, step-by-step workflow, transaction hashes for EVERY step, feed identifier, decimals, domain separator, and AggregatorV3Interface compatibility.
>
> **Bonus features that go beyond the spec:**
> - Multi-feed support: Three price feeds through ONE Reactive Smart Contract
> - Telegram bot for real-time monitoring with transaction hash display
> - 199 comprehensive tests covering security and edge cases
> - 618+ live cross-chain updates demonstrating production reliability
> - Auto-registration of new feeds and historical price storage
>
> **Why Reactive Network?** Without Reactive, this would require running a 24/7 relayer service, paying gas on multiple chains, building custom verification logic, and handling failures manually. Reactive makes it autonomous and trustless.
>
> Thank you for watching. The code is open source at github.com/guglxni/reactive-bounty-1."

### SLIDE: Final Card

```
═══════════════════════════════════════════════════════════════════════════

              REACTIVE CROSS-CHAIN MULTI-FEED PRICE ORACLE
                      Sprint #1 Bounty Submission

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   GitHub:     https://github.com/guglxni/reactive-bounty-1
   
   RSC:        0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5
   Destination: 0x889c32f46E273fBd0d5B1806F3f1286010cD73B3
   
   Tests:      199 passing
   Updates:    618+ delivered
   Feeds:      ETH/USD, BTC/USD, LINK/USD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                         Thank you! 🚀

═══════════════════════════════════════════════════════════════════════════
```

---

## 📝 RECORDING TIPS

1. **Screen Recording Setup:**
   - Record at 1080p or higher
   - Use a clean desktop background
   - Close unnecessary applications
   - Ensure terminal font is large enough to read

2. **Audio:**
   - Use a good microphone
   - Record in a quiet environment
   - Speak clearly and at moderate pace
   - Practice the script 1-2 times before recording

3. **Visuals to Show:**
   - Architecture diagram (use the ASCII art or create a graphic)
   - Code editor with contracts highlighted
   - Block explorer showing transactions
   - Telegram bot in action
   - Terminal showing test results

4. **Timing Guide:**
   - Section 1: Intro - aim for 30 seconds
   - Section 2: Architecture - 45 seconds
   - Section 3: Code - 75 seconds
   - Section 4: Demo - 75 seconds
   - Section 5: Security - 45 seconds
   - Section 6: Conclusion - 30 seconds
   - Total: ~5 minutes

5. **Key Points to Emphasize:**
   - "AUTONOMOUS" - no manual intervention
   - "MULTI-FEED" - beyond the spec
   - "PRODUCTION-GRADE" - 199 tests, 618+ updates
   - "BOUNTY COMPLIANT" - all requirements met

---

## 🔗 LINKS FOR VIDEO

- **GitHub Repository:** https://github.com/guglxni/reactive-bounty-1
- **RSC on ReactScan:** https://reactscan.net/address/0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5
- **Destination on Etherscan:** https://sepolia.etherscan.io/address/0x889c32f46E273fBd0d5B1806F3f1286010cD73B3
- **Sample Origin Tx:** https://sepolia.basescan.org/tx/0x205f180a3479e3a48b8de09e33fb0a171915add491d8406efa96c922c2f233e7
- **Sample Reactive Tx:** https://reactscan.net/tx/0x45c0649500f14746e151e32cbe0576ffdd122d24493b4237fcaf1495affa7f1a
- **Sample Destination Tx:** https://sepolia.etherscan.io/tx/0x9c577f914488f66795323b89d01f4c6c5bcc65922d3c85c16c98acf7a584bca2
