# 🎬 Demo Video Script - Reactive Cross-Chain Multi-Feed Price Oracle

**Duration:** 4-5 minutes  
**Style:** Conversational narration with screen share  
**GitHub:** https://github.com/guglxni/reactive-bounty-1

---

## INTRO (0:00 - 0:35)

*[Show: Title slide or GitHub repo]*

Hey everyone! I'm excited to present my submission for Reactive Bounties 2.0 Sprint #1 — the Cross-Chain Oracle challenge.

So here's the problem I set out to solve. Chainlink price feeds are amazing, but they're not available on every blockchain. If you're building a DeFi app on a chain without native Chainlink support, you're stuck. You'd have to run your own relayer service twenty-four-seven, pay gas on multiple chains, and handle all the edge cases yourself. It's expensive, it's complex, and honestly? It's a pain.

That's where Reactive Network comes in. I built a fully autonomous cross-chain oracle that mirrors Chainlink price feeds from Base Sepolia over to Ethereum Sepolia — and here's the cool part — I didn't just mirror ONE feed like the spec asked for. I built a multi-feed system that handles THREE feeds simultaneously: ETH, BTC, and LINK. All through a single Reactive Smart Contract. Plus, I threw in a Telegram bot for real-time monitoring because, why not?

Let me show you how it all works.

---

## ARCHITECTURE (0:35 - 1:20)

*[Show: Architecture diagram or draw on screen]*

Alright, so the system spans three different chains. Let me walk you through the flow.

It starts on Base Sepolia — that's our origin chain. Chainlink has these official price aggregators there that emit an event called "AnswerUpdated" every time a price changes. My system subscribes to three of these: ETH/USD, BTC/USD, and LINK/USD.

Now here's where the magic happens. On the Reactive Network — specifically the Lasna testnet — I deployed what's called a Reactive Smart Contract, or RSC. This thing runs AUTONOMOUSLY. Nobody has to trigger it. Nobody has to babysit it. When Chainlink updates a price on Base Sepolia, my RSC automatically wakes up, validates the data, makes sure it's not a duplicate, and then fires off a callback to the destination chain.

That destination is Ethereum Sepolia. The callback gets delivered through Reactive's Callback Proxy to my MultiFeedDestination contract. This contract does all the security checks — validates the sender, checks the message version, enforces monotonicity so prices can't go backwards — and then stores the data. And here's the beautiful part: any DeFi app on Sepolia can now read these prices using the standard Chainlink interface. It's a drop-in replacement.

One RSC. One destination contract. Three price feeds. Zero manual intervention.

---

## CODE WALKTHROUGH (1:20 - 2:25)

*[Show: VS Code with MultiFeedMirrorRCv2.sol open]*

Let me show you the actual code. This is the RSC — MultiFeedMirrorRCv2.

The heart of everything is this `react` function. This gets called automatically by the ReactVM whenever one of our subscribed events fires. So when Chainlink emits an AnswerUpdated event, boom — we're in here.

First thing I do is figure out which feed triggered this. Could be ETH, could be BTC, could be LINK. I grab the contract address from the log and look it up in my feeds mapping.

Then I check for duplicates. Every feed tracks its last processed round ID. If this round is the same or older than what we've already seen? Skip it. No point in sending duplicate data cross-chain.

If it's a new round, I build the callback payload. This includes everything the bounty spec asked for — the feed identifier, which is just the origin aggregator address, the decimals, a domain separator and message version for future upgrades and replay protection, and all the round data like price, timestamps, and round IDs.

Then I emit this Callback event, and Reactive Network takes it from there. It handles all the cross-chain delivery. I don't have to think about bridges or relayers or any of that.

*[Switch to: MultiFeedDestinationV2.sol]*

On the receiving end, we have the destination contract. When a callback arrives, it goes through multiple security gates.

First, it checks the sender — only the official Callback Proxy can call this function. Then it validates the RVM ID to make sure it came from an authorized Reactive contract. It checks that the message version matches what we expect. It validates that the decimals match what we registered for this feed. And finally, it enforces monotonicity — the round ID has to be higher than the last one we stored. This prevents replay attacks and ensures prices never regress.

Once all that passes, we store the data and emit events. Clean and secure.

---

## LIVE DEMO (2:25 - 3:40)

*[Show: Block explorers with transactions]*

Okay, let's look at some live transactions — not simulations, these are real cross-chain updates happening on mainnet testnets. The bounty specifically asks for transaction hashes at every step, so here they are.

Starting with the origin chain — Base Sepolia. This transaction is a Chainlink `Transmit` call on the ETH/USD aggregator from November 25th, 2025. You can see the AnswerUpdated event right there in the logs. That's what triggers my RSC.

*[Show: ReactScan]*

Now over on the Reactive Network. This is my RSC transaction on ReactScan — same date. You can see the contract's `react()` function firing and emitting a Callback event. This is the autonomous part — the ReactVM detected the Chainlink event and invoked my RSC automatically. Nobody triggered this manually.

*[Show: Etherscan Sepolia]*

And finally, the destination on Sepolia — November 25th, 2025 at 9:43 PM UTC. This is the callback delivery with the FeedUpdated event in the logs. The price data successfully crossed from Base to Sepolia through Reactive.

The system has processed over 618 cross-chain updates so far. That's 228 ETH updates, 231 BTC updates, and 159 LINK updates. Production-grade reliability.

*[Show: Telegram bot on phone or screen]*

Now here's a bonus feature I built — a Telegram bot for monitoring.

I can type slash-prices and instantly see all three feeds — the origin price on Base versus the mirrored price on Sepolia. I can check individual feeds with slash-eth, slash-btc, or slash-link.

The slash-txs command is particularly useful — it shows recent transaction hashes across ALL THREE chains. Origin, Reactive, and Destination. Exactly what the bounty requires, accessible from your phone.

Slash-status gives me the full system overview with update counts, and slash-contracts lists all the deployed addresses. It's a nice way to verify everything's working without digging through block explorers.

---

## SECURITY & TESTING (3:40 - 4:25)

*[Show: Terminal with test results or security slide]*

Security is critical when you're dealing with price oracles. A bug here could mean millions in losses for any protocol using this data. So I took it seriously.

Eight security features built in. The AbstractCallback pattern from Reactive's official library handles authorization. Dual authorization checks both the Callback Proxy AND the RVM ID. I validate the feed source, the decimals, and the message version. Monotonicity enforcement prevents replay attacks and price regression. Stale detection catches feeds that haven't updated in over three hours. And per-feed deduplication in the RSC prevents processing the same update twice.

*[Show: Test output]*

For testing, I wrote 199 unit tests covering core logic, edge cases, and security invariants. Every test passes. Things like: what happens if someone sends a stale update? Rejected. What if the decimals don't match? Rejected. What if an unauthorized contract tries to call the update function? Rejected. All covered.

---

## CONCLUSION (4:25 - 5:00)

*[Show: Bounty checklist or final slide]*

So let me wrap up with why this submission stands out.

First, I hit every requirement on the bounty checklist. Reactive contracts deployed on Lasna testnet — check. Destination contracts on Ethereum Sepolia — check. Deploy scripts and documentation — check. All addresses documented — check. Transaction hashes for every step, origin, reactive, and destination — check. Feed identifier, decimals, domain separator, and version in the payload — check, check, check. AggregatorV3Interface compatibility so any DeFi app can read the prices — absolutely.

But I also went beyond the spec. Multi-feed support means one RSC handles three different price feeds efficiently. The Telegram bot adds real-time monitoring. 199 tests prove the code is solid. And 618-plus live updates show this thing actually works in production.

The question the bounty asks is: why does this need Reactive Network? And the answer is simple. Without Reactive, I'd need to run a relayer service around the clock, pay gas on multiple chains for every update, build custom verification logic, and handle failures manually. Reactive makes all of that autonomous and trustless. I deploy the contracts, fund the RSC, and walk away. It just works.

The code is fully open source at github.com/guglxni/reactive-bounty-1. Thanks for watching, and I hope you like what I built!

*[Show: Final slide with GitHub link and contract addresses]*

---

## 📝 RECORDING NOTES

**What to show on screen during each section:**

1. **Intro** — GitHub repo page or a simple title slide
2. **Architecture** — Draw the three-chain flow or show the ASCII diagram from README
3. **Code** — VS Code with the two main contracts, highlight key functions
4. **Live Demo** — Open BaseScan, ReactScan, Etherscan tabs; show Telegram bot
5. **Security** — Terminal running `npm test`, show 199 passing
6. **Conclusion** — Final slide with links and addresses

**Delivery tips:**
- Speak naturally, like you're explaining to a friend
- It's okay to pause and point at things on screen
- Don't rush the transaction hash section — judges want to verify these
- Show enthusiasm when talking about the bonus features

**Key phrases to emphasize:**
- "Fully autonomous" 
- "Zero manual intervention"
- "Beyond the spec"
- "Production-grade"
- "618 live updates"

---

## 🔗 LINKS TO HAVE OPEN

Keep these tabs ready before recording:

1. **GitHub:** https://github.com/guglxni/reactive-bounty-1
2. **RSC on ReactScan:** https://reactscan.net/address/0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5
3. **Destination on Etherscan:** https://sepolia.etherscan.io/address/0x889c32f46E273fBd0d5B1806F3f1286010cD73B3
4. **Live Example — Origin Tx:** https://sepolia.basescan.org/tx/0x205f180a3479e3a48b8de09e33fb0a171915add491d8406efa96c922c2f233e7  
   *(Proof: Chainlink `Transmit` call on ETH/USD aggregator — Nov-25-2025 05:11:52 PM UTC)*
5. **Live Example — Reactive Tx:** https://reactscan.net/tx/0x45c0649500f14746e151e32cbe0576ffdd122d24493b4237fcaf1495affa7f1a  
   *(Proof: RSC `react()` triggered, emits Callback event — Nov-25-2025)*
6. **Live Example — Destination Tx:** https://sepolia.etherscan.io/tx/0x9c577f914488f66795323b89d01f4c6c5bcc65922d3c85c16c98acf7a584bca2  
   *(Proof: Callback delivery with FeedUpdated event — Nov-25-2025 09:43:24 PM UTC)*

---

## 📊 QUICK REFERENCE (for speaking)

**Contract Addresses:**
- RSC: `0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5`
- Destination: `0x889c32f46E273fBd0d5B1806F3f1286010cD73B3`
- Callback Proxy: `0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA`

**Stats:**
- 618+ total updates
- 228 ETH, 231 BTC, 159 LINK
- 199 tests passing

**Feeds (Base Sepolia origins):**
- ETH/USD: `0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3`
- BTC/USD: `0x961AD289351459A45fC90884eF3AB0278ea95DDE`
- LINK/USD: `0xAc6DB6d5538Cd07f58afee9dA736ce192119017B`
