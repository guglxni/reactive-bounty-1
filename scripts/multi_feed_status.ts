import { ethers } from "hardhat";

/**
 * Multi-Feed System Status & Diagnostics
 * 
 * Provides comprehensive monitoring and debugging information for the
 * cross-chain price feed mirroring system.
 * 
 * IMPORTANT: RVM ID is the DEPLOYER ADDRESS, not the RSC contract address!
 * The Reactive Network replaces the first 160 bits of the callback payload
 * with the ReactVM ID (deployer's EOA address).
 */

// Contract addresses
const ADDRESSES = {
    // Destination (Sepolia)
    destination: "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3",
    callbackProxy: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA",
    
    // RSC (Reactive Lasna) - Updated to 3-feed version
    rsc: "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB",  // NEW: 3 feeds (ETH, BTC, LINK)
    oldRsc: "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB", // OLD: 4 feeds (included USDC)
    
    // Expected RVM ID (deployer)
    deployer: "0xDDe9D31a31d6763612C7f535f51E5dC9f830682e"
};

// Base Sepolia Chainlink Aggregators (emit AnswerUpdated events)
// NOTE: USDC/USD removed - 24hr heartbeat, always ~$1.00, not useful for demo
const BASE_SEPOLIA_FEEDS = {
    "ETH/USD": "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3",
    "BTC/USD": "0x961AD289351459A45fC90884eF3AB0278ea95DDE",
    "LINK/USD": "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B"
    // "USDC/USD": "0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e" // REMOVED
};

async function checkDestination() {
    console.log("\n" + "═".repeat(60));
    console.log("  DESTINATION CONTRACT STATUS (Sepolia)");
    console.log("═".repeat(60));
    console.log(`Address: ${ADDRESSES.destination}`);
    
    const dest = await ethers.getContractAt("MultiFeedDestinationV2", ADDRESSES.destination);
    
    // Authorization check
    const authRC = await dest.authorizedReactiveContract();
    const owner = await dest.owner();
    
    console.log(`\n📋 Configuration:`);
    console.log(`  Owner: ${owner}`);
    console.log(`  Authorized RC: ${authRC}`);
    console.log(`  Expected (Deployer): ${ADDRESSES.deployer}`);
    
    const authMatch = authRC.toLowerCase() === ADDRESSES.deployer.toLowerCase();
    console.log(`  ✅ Authorization: ${authMatch ? "CORRECT" : "❌ MISMATCH - RVM ID should be deployer!"}`);
    
    // Global stats
    const totalUpdates = await dest.totalGlobalUpdates();
    console.log(`\n📊 Statistics:`);
    console.log(`  Total Global Updates: ${totalUpdates}`);
    
    // Feed status
    console.log(`\n📈 Feed Status:`);
    console.log("─".repeat(60));
    console.log(`  Feed      | Updates | Price          | Last Round`);
    console.log("─".repeat(60));
    
    for (const [name, addr] of Object.entries(BASE_SEPOLIA_FEEDS)) {
        try {
            const config = await dest.feedConfigs(addr);
            if (config.enabled) {
                let priceStr = "No data yet";
                let roundStr = "-";
                try {
                    const latest = await dest.latestRoundData(addr);
                    const price = Number(latest.answer) / 10 ** Number(config.decimals);
                    priceStr = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    roundStr = latest.roundId.toString();
                } catch {}
                console.log(`  ${name.padEnd(10)}| ${config.totalUpdates.toString().padEnd(8)}| ${priceStr.padEnd(15)}| ${roundStr}`);
            } else {
                console.log(`  ${name.padEnd(10)}| NOT REGISTERED`);
            }
        } catch (e) {
            console.log(`  ${name.padEnd(10)}| ERROR reading config`);
        }
    }
}

async function checkCallbackProxy() {
    console.log("\n" + "═".repeat(60));
    console.log("  CALLBACK PROXY STATUS (Sepolia)");
    console.log("═".repeat(60));
    console.log(`Address: ${ADDRESSES.callbackProxy}`);
    
    // The Sepolia callback proxy uses debt(address) and depositTo(address)
    const proxyABI = [
        "function debt(address) view returns (uint256)",
        "function debts(address) view returns (uint256)"
    ];
    
    const proxy = new ethers.Contract(ADDRESSES.callbackProxy, proxyABI, ethers.provider);
    
    let debt = 0n;
    try {
        // Try different method names as it varies by proxy version
        debt = await proxy.debt(ADDRESSES.destination);
    } catch {
        try {
            debt = await proxy.debts(ADDRESSES.destination);
        } catch (e) {
            console.log(`\n⚠️  Could not read debt from callback proxy`);
            console.log(`   (This may be normal if the proxy has different interface)`);
        }
    }
    
    const balance = await ethers.provider.getBalance(ADDRESSES.destination);
    
    console.log(`\n💰 Financial Status:`);
    console.log(`  Debt: ${ethers.formatEther(debt)} ETH`);
    console.log(`  Dest Balance: ${ethers.formatEther(balance)} ETH`);
    
    // Interpretation
    if (debt > 0n) {
        console.log(`\n⚠️  Debt > 0 means callbacks are FAILING or reverted!`);
        console.log(`   Possible causes:`);
        console.log(`   1. authorizedReactiveContract mismatch (should be deployer)`);
        console.log(`   2. rvm_id check failing in rvmIdOnly modifier`);
        console.log(`   3. Business logic revert (invalid data)`);
    } else {
        console.log(`\n✅ Debt = 0: Callbacks are executing successfully!`);
    }
}

async function printDiagnostics() {
    console.log("\n" + "═".repeat(60));
    console.log("  TROUBLESHOOTING GUIDE");
    console.log("═".repeat(60));
    
    console.log(`
🔧 Common Issues & Solutions:

1. CALLBACKS NOT DELIVERED TO DESTINATION
   - Check RSC balance on Reactive Network (needs REACT)
   - Check callback proxy reserve on destination (needs ETH)
   - Verify RSC is emitting Callback events

2. CALLBACKS DELIVERED BUT REVERTING (debt > 0)
   - authorizedReactiveContract MUST be DEPLOYER address!
   - The RVM ID injected in payload is deployer, NOT RSC address
   - Fix: dest.setAuthorizedReactiveContract(deployer_address)

3. NO UPDATES FOR A SPECIFIC FEED
   - Chainlink feeds update every ~15 min (0.5% deviation or 1hr heartbeat)
   - Check if feed is active on RSC
   - Verify subscription created correctly

4. STALE PRICES
   - Check lastUpdateTimestamp on destination
   - Origin feed might not be updating
   - RSC might be paused or out of funds

📚 Key Documentation:
   - RVM ID = Deployer: https://dev.reactive.network/reactvm
   - Callbacks: https://dev.reactive.network/events-&-callbacks
   - Economy: https://dev.reactive.network/economy
`);
}

async function main() {
    const network = await ethers.provider.getNetwork();
    
    console.log("╔" + "═".repeat(58) + "╗");
    console.log("║" + "  MULTI-FEED PRICE MIRROR - SYSTEM STATUS".padEnd(58) + "║");
    console.log("╠" + "═".repeat(58) + "╣");
    console.log("║" + `  Network: ${network.chainId === 11155111n ? "Sepolia" : `Chain ${network.chainId}`}`.padEnd(58) + "║");
    console.log("║" + `  Timestamp: ${new Date().toISOString()}`.padEnd(58) + "║");
    console.log("╚" + "═".repeat(58) + "╝");
    
    if (network.chainId !== 11155111n) {
        console.log("\n❌ This script must be run on Sepolia network");
        console.log("   Use: npx hardhat run scripts/multi_feed_status.ts --network sepolia");
        return;
    }
    
    await checkDestination();
    await checkCallbackProxy();
    await printDiagnostics();
    
    console.log("\n" + "═".repeat(60));
    console.log("  END OF STATUS REPORT");
    console.log("═".repeat(60) + "\n");
}

main().catch(console.error);
