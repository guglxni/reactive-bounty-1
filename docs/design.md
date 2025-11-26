# Reactive Cross-Chain Oracle Design

## Overview
This project implements a Cross-Chain Price Oracle using the Reactive Network. It mirrors a canonical Chainlink Price Feed from an Origin Chain (e.g., Sepolia) to a Destination Chain (e.g., Arbitrum Sepolia) where the feed might not natively exist or where we want a direct push model.

## Architecture

### 1. Origin Chain (Ethereum Sepolia)
- **Component**: Chainlink Aggregator (Official Feed).
- **Role**: Source of truth. Emits `AnswerUpdated` events when the price changes.
- **Integration**: We do not deploy new contracts here; we subscribe to the existing feed events.

### 2. Reactive Network
- **Component**: `ChainlinkFeedMirrorRC.sol` (Reactive Contract).
- **Role**:
  - Subscribes to `AnswerUpdated` events from the Origin feed.
  - Upon receiving an event, it decodes the price (`answer`) and round ID (`roundId`).
  - Logic checks for basic validity (e.g. monotonicity logic).
  - Emits a **Callback** transaction to the Destination Chain.

### 3. Destination Chain (Arbitrum Sepolia)
- **Component**: `DestinationFeedProxy.sol`.
- **Role**:
  - Stores the latest price data.
  - Exposes `latestRoundData()` strictly adhering to `AggregatorV3Interface`.
  - Allows updates **only** from the authorized Reactive Contract (via the system callback).
  - Enforces strict monotonicity: rejects updates with older `roundId` or `updatedAt` to prevent replay attacks.

## Threat Model & Security

### Authentication
- **Destination**: `updateFromReactive` is protected by `onlyUpdater`. The updater address is set to the Reactive System's callback sender (or specific RC address if the system supports origin sender propagation, currently we trust the configured Reactive entity).

### Data Integrity
- **Monotonicity**: The proxy rejects any update where `roundId` decreases. This protects against out-of-order delivery or malicious replays of old data.
- **Staleness**: Consumers can check `updatedAt` vs `block.timestamp`.

### Availability
- **Reactive Liveness**: If the Reactive Network is down, updates stop. The Proxy retains the last known good value.
- **Origin Liveness**: If Chainlink stops updating, the mirror stops.

## Why Reactive?
Traditional cross-chain oracles often rely on off-chain relayers (Chainlink Nodes, LayerZero executors) that must be trusted or incentivized off-chain.
Reactive Contracts allow us to define the mirroring logic **on-chain** (in the Reactive VM). The execution is decentralized and verified by the Reactive Network consensus, removing the need for a custom off-chain bot server.

