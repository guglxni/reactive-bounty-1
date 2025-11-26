import { ethers } from "hardhat";

/**
 * Check Multi-Feed Destination Status
 */

const DEST_ADDRESS = "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3";

const FEEDS = [
    { address: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3", symbol: "ETH/USD" },
    { address: "0x961AD289351459A45fC90884eF3AB0278ea95DDE", symbol: "BTC/USD" },
    { address: "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B", symbol: "LINK/USD" },
    { address: "0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e", symbol: "USDC/USD" }
];

async function main() {
    console.log("\n📊 Multi-Feed Destination Status\n");
    console.log(`Contract: ${DEST_ADDRESS}\n`);
    
    const destination = await ethers.getContractAt("MultiFeedDestinationV2", DEST_ADDRESS);
    
    // Check global stats
    const totalUpdates = await destination.totalGlobalUpdates();
    const feedCount = await destination.getFeedCount();
    const authorizedRSC = await destination.authorizedReactiveContract();
    
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`Total Registered Feeds: ${feedCount}`);
    console.log(`Total Global Updates:   ${totalUpdates}`);
    console.log(`Authorized RSC:         ${authorizedRSC}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);
    
    console.log("Feed Status:");
    console.log("─────────────────────────────────────────────────────────────");
    
    for (const feed of FEEDS) {
        try {
            const config = await destination.feedConfigs(feed.address);
            
            if (!config.enabled) {
                console.log(`❌ ${feed.symbol}: Not enabled`);
                continue;
            }
            
            try {
                const [roundId, answer, startedAt, updatedAt, answeredInRound] = 
                    await destination.latestRoundData(feed.address);
                
                const price = Number(answer) / 1e8;
                const updateTime = new Date(Number(updatedAt) * 1000).toLocaleString();
                
                console.log(`✅ ${feed.symbol.padEnd(8)} | Round: ${roundId.toString().padEnd(6)} | Price: $${price.toFixed(2).padStart(12)} | Updated: ${updateTime}`);
            } catch (e) {
                console.log(`⏳ ${feed.symbol.padEnd(8)} | No data yet (waiting for first callback)`);
            }
        } catch (e) {
            console.log(`❓ ${feed.symbol}: Error reading config`);
        }
    }
    
    console.log("─────────────────────────────────────────────────────────────\n");
    
    if (totalUpdates === 0n) {
        console.log("⏳ Waiting for first price updates from Reactive Network...");
        console.log("   Chainlink typically updates prices every ~1 hour or on 0.5% deviation.");
        console.log("\n   Run this script again in a few minutes to check for updates.");
    } else {
        console.log(`✅ System is receiving price updates! (${totalUpdates} total)`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
