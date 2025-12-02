# Reactivate — Automatic Funding & Recovery for Reactive Contracts

Reactivate reduces operational load for teams running Reactive Contracts (RCs) by automatically monitoring balances, triggering refills, and reactivating contracts that slipped into debt or inactive state. Built during the Reactive Network Hackathon (September 2025), Reactivate is a production-focused system designed for reliability, low-latency recovery, and easy developer onboarding.

## Overview

Keeping Reactive Contracts funded is an ongoing maintenance task. If an RC or a callback contract runs out of funds, it stops executing and integrations break. For systems that react to frequent events, manual monitoring and topping-up is fragile in production: a single missed refill can cause hours of stalled automation.

Reactivate removes this toil by providing:

- Continuous monitoring of configured contracts and balances
- Automatic refilling when balances fall below thresholds
- Automatic debt coverage (`coverDebt()`) when a contract becomes inactive
- Developer tooling and a deployable funder + reactive monitoring stack

Try Reactivate | See GitHub Project | Watch Loom Demo

---

## DApp Flow (High Level)

1. Create Funding Account
   - A dedicated funding account is generated and pre-funded with REACT (for RCs) or ETH/USDC (for callback contracts on other chains).

2. Configure Deployment
   - Register contract addresses to monitor, define event topics to watch, set threshold and refill amounts, and deploy the monitoring infrastructure.

3. Automatic Monitoring
   - The funder/reactive pair tracks configured events and balances. When a threshold is crossed, the funder sends the configured top-up and withdraws the same amount from the developer funding account.

4. Instant Reactivation
   - If a monitored contract has debt, the funder invokes `coverDebt()` (or equivalent) to restore contract activity immediately.

---

## Architecture Components

- Funder Contract — funds monitored contracts and covers debt
- Reactive Contract — subscribes to events, triggers funding flow and reactivation logic
- Developer Account / DevAccount Factory — supplies funds and authorizes funders
- Bridge (optional) — used to move ETH -> REACT or cross-chain deposits supporting developer top-ups

### Security & Trust Model

- The funder is whitelisted and controlled via the developer account factory pattern (dev accounts). The funder must be validated and whitelisted before it acts.
- Refill flows withdraw from the developer account only after a successful funding transaction and emit events for auditing.
- `coverDebt()` is invoked directly on the affected contract only after the system validates debts via the System Contract to avoid mistakes.

---

## Funder Contract (Detailed)

The funder contract automates keeping both callback contracts and RCs funded. Key responsibilities:

- Watch balances of the callback receiver (on destination chains) and the reactive receiver (on the Reactive network)
- When a balance is below `refillThreshold`, transfer `refillValue` to the contract and withdraw the same amount from developer account
- If the monitored contract has accumulated debt, call `coverDebt()` on it to clear debt and reactivate
- Emit events for each refill and debt payment for auditability

Example setup function (simplified):

```solidity
function createFunder(
    address dev, 
    address callbackContract, 
    address reactiveContract, 
    uint256 refillValue, 
    uint256 refillThreshold
) payable external {
    address devAccount = IAccountFactory(accountFactory).devAccounts(dev);
    uint256 devAccountBalance = devAccount.balance;
    uint256 withdrawAmount = (refillValue * 2);
    uint256 initialFundAmount = withdrawAmount + 2 ether;

    require(devAccountBalance >= withdrawAmount, "Not enough REACT in dev account");

    Funder newReactiveFunder = new Funder{value: initialFundAmount}(
        callbackContract, 
        reactiveContract, 
        refillValue, 
        refillThreshold, 
        devAccount
    );

    address funderAddress = address(newReactiveFunder);
    IDevAccount(devAccount).withdraw(address(this), initialFundAmount);
    IDevAccount(devAccount).whitelist(funderAddress);
    latestDeployed = funderAddress;

    emit Setup(dev, funderAddress);
}
```

Notes:
- The funder is initialized with `initialFundAmount` to cover a couple of refill cycles and gas for setup
- The funder is whitelisted on the `devAccount` so it can withdraw funds when needed

---

## Reactive Contract (Detailed)

The Reactive contract observes origin or system events and triggers the funder logic when appropriate.

Example creation helper (simplified):

```solidity
function createReactive(
    address funderContract, 
    address callbackContract, 
    uint256 eventTopic
) payable external {
    Reactive newReactive = new Reactive{value: 2 ether}(
        funderContract, 
        callbackContract, 
        eventTopic
    );
    latestDeployed = address(newReactive);

    emit Setup(msg.sender, address(newReactive));
}
```

Responsibilities of the Reactive contract:
- Subscribe to configured event topics (e.g., Deposit/Received or Cron events)
- On matching events, call the `funder` flow via callback invocation
- Emit audit events for monitoring systems to detect and store

---

## Automatic Balance Refills (Example Callback)

When the Reactive contract receives a callback, it checks target balances and performs top-ups when necessary.

```solidity
function callback(address sender) external authorizedSenderOnly rvmIdOnly(sender) {
    uint256 callbackBal = callbackReceiver.balance;
    if (callbackBal <= refillThreshold) {
        (bool success, ) = callbackReceiver.call{value: refillValue}("");
        require(success, "Payment failed.");
        IDevAccount(devAccount).withdraw(address(this), refillValue);
        emit refillHandled(address(this), callbackReceiver);
    } else {
        emit callbackHandled(address(this));
    }

    uint256 reactiveBal = reactiveReceiver.balance;
    if (reactiveBal <= refillThreshold) {
        (bool success, ) = reactiveReceiver.call{value: refillValue}("");
        require(success, "Payment failed.");
        IDevAccount(devAccount).withdraw(address(this), refillValue);
        emit refillHandled(address(this), reactiveReceiver);
    } else {
        emit callbackHandled(address(this));
    }
}
```

Notes:
- The funder checks both the `callbackReceiver` (destination) and `reactiveReceiver` (Reactive network)
- On each successful top-up the funder withdraws the same amount from `devAccount` to keep accounting balanced
- Events are emitted for every action for audit and monitoring

---

## Reactivating Inactive Contracts (Debt Recovery)

If either monitored contract has debt recorded by the System Contract, the funder invokes `coverDebt()` on the contract to restore activity.

```solidity
function callback(address sender) external authorizedSenderOnly rvmIdOnly(sender) {
    uint256 callbackDebt = ISystem(SYSTEM_CONTRACT).debts(callbackContract);
    uint256 reactiveDebt = ISystem(SYSTEM_CONTRACT).debts(reactiveContract);
    if (callbackDebt > 0) {
        IAbstractPayer(callbackContract).coverDebt();
        emit debtPaid(address(this));
    }

    if (reactiveDebt > 0) {
        IAbstractPayer(reactiveContract).coverDebt();
        emit debtPaid(address(this));
    }
}
```

This design ensures the system can recover both from low-balance situations and accumulated debts that would otherwise render contracts inactive.

---

## Bridging Tokens (Developer Top-Ups)

The system supports developer-funded top-ups from other chains via a Bridge contract. The Bridge receives ETH deposits and emits `Received(address,uint256)` events. The Reactive contract listens for these events and executes callbacks that convert deposits into REACT (or forward ETH) to developer accounts or recipient addresses.

Example bridge receive handler (simplified):

```solidity
receive() external payable {
    if (msg.value > 0.00024 ether) {
        (bool success, ) = msg.sender.call{value: msg.value}("");
        require(success, "Payment value exceeded.");
    } else {
        emit Received(msg.sender, msg.value);
    }
}
```

When the RC receives a `Received` event it triggers `react()` which encodes a callback payload and emits a `Callback` to the downstream flow.

```solidity
function react(LogRecord calldata log) external vmOnly {
    address recipient = address(uint160(log.topic_1));
    uint256 sentValue = uint256(log.topic_2);

    bytes memory payload = abi.encodeWithSignature(
        "callback(address, address, uint256)",
        address(0),
        recipient,
        sentValue
    );

    emit Callback(REACT_ID, callbackHandler, GAS_LIMIT, payload);
}
```

The callback contract will then determine whether the depositor has a dedicated developer account and either forward the funds to the recipient or to the dev account based on configuration.

```solidity
function callback(address sender, address recipient, uint256 sentValue) external authorizedSenderOnly rvmIdOnly(sender) {
    address devAccount = IAccountFactory(accountFactoryContract).devAccounts(recipient);
    uint256 receiveValue = (sentValue * rateNum) / rateDen;
    if (devAccount == address(0)) {
        (bool success, ) = recipient.call{value: receiveValue}("");
        require(success, "bridging failed.");
        emit bridgeHandled(recipient, sentValue, receiveValue);
    } else {
        (bool success, ) = devAccount.call{value: receiveValue}("");
        require(success, "bridging failed.");
        emit bridgeHandled(recipient, sentValue, receiveValue);
    }
}
```

---

## Operational Notes & Best Practices

- **Thresholds:** Pick refill thresholds that cover expected event bursts plus margin (e.g., 2–3 refill cycles)
- **Refill Amounts:** Keep refills reasonably sized to reduce frequency and gas overhead (but small enough to limit risk if compromised)
- **Whitelisting:** Use the dev account factory to whitelist funders before they can withdraw from dev accounts
- **Monitoring:** Surface events to your dashboard and Telegram bot for instant alerts on refills and debt payments
- **Auditing:** All refills, debt payments, and bridge events should be logged and available in the dashboard for post-mortem analysis

---

## Conclusion

Reactivate automates the tedious and error-prone task of funding Reactive Contracts. By combining funder contracts, Reactive observers, whitelisted developer accounts, and optional bridging, Reactivate keeps systems resilient and responsive. The design is intentionally modular so teams can adopt only the parts they need: quick monitoring, automatic refills, or full debt recovery and bridging.

If you'd like, I can:

- Add unit tests and integration tests for the funder/reactive flow
- Add dashboard UI pages (if needed) showing funder status and refill history
- Wire Telegram alerts for funder events (refill, debt paid)

Tell me which follow-ups you want and I will add them to the TODO list and implement them next.