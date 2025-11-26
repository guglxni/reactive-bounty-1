import { ethers } from "hardhat";

async function main() {
    const dest = await ethers.getContractAt("MultiFeedDestinationV2", "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3");
    
    // Base Sepolia Chainlink feeds
    const feeds = [
        { addr: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3", name: "ETH/USD" },
        { addr: "0x02C9dF4d4D1a85D67b6D645916DBa4eCAB0a8e70", name: "BTC/USD" },
        { addr: "0x5EB7f56f8Ff85817b54a1e9EE59cE6Fa06a48B6c", name: "LINK/USD" },
        { addr: "0x9B98c23095D5e0F4fDa7C101b3f185790249035D", name: "USDC/USD" }
    ];
    
    console.log("=== Multi-Feed Destination Status ===");
    console.log("Address:", await dest.getAddress());
    console.log("Total Updates:", (await dest.totalGlobalUpdates()).toString());
    console.log("Authorized RC:", await dest.authorizedReactiveContract());
    console.log("");
    
    for (const feed of feeds) {
        if (!feed.addr || feed.addr.length !== 42) continue;
        
        try {
            const config = await dest.feedConfigs(feed.addr);
            
            if (config.enabled) {
                console.log(`\n--- ${feed.name} (${feed.addr}) ---`);
                console.log("  Enabled:", config.enabled);
                console.log("  Decimals:", config.decimals);
                console.log("  Total Updates:", config.totalUpdates.toString());
                console.log("  Last Update Block:", config.lastUpdateBlock.toString());
                
                try {
                    const latest = await dest.latestRoundData(feed.addr);
                    const price = Number(latest.answer) / 10 ** Number(config.decimals);
                    console.log("  Latest Round ID:", latest.roundId.toString());
                    console.log("  Latest Price:", `$${price.toFixed(2)}`);
                    console.log("  Updated At:", new Date(Number(latest.updatedAt) * 1000).toISOString());
                } catch (e) {
                    console.log("  No data yet");
                }
            } else {
                console.log(`\n${feed.name}: Not registered`);
            }
        } catch (e: any) {
            console.log(`\n${feed.name}: Error - ${e.message?.slice(0, 50)}`);
        }
    }
}

main().catch(console.error);
