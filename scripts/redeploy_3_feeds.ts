import { ethers } from "hardhat";

/**
 * Redeploy RSC with 3 Feeds (ETH, BTC, LINK) - Remove USDC/USD
 * 
 * USDC/USD only updates every 24 hours and stays at ~$1.00
 * The 3 crypto feeds update every 14-19 minutes with real price changes
 */

// Chainlink Aggregators on Base Sepolia (3 volatile feeds only)
const FEEDS = [
    {
        address: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3",
        decimals: 8,
        symbol: "ETH/USD"
    },
    {
        address: "0x961AD289351459A45fC90884eF3AB0278ea95DDE",
        decimals: 8,
        symbol: "BTC/USD"
    },
    {
        address: "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B",
        decimals: 8,
        symbol: "LINK/USD"
    }
];

// Existing Destination (already deployed and authorized)
const DESTINATION_ADDRESS = "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3";

// Network Configuration
const ORIGIN_CHAIN_ID = 84532;        // Base Sepolia
const DESTINATION_CHAIN_ID = 11155111; // Sepolia  
const SERVICE_ADDRESS = "0x0000000000000000000000000000000000FFFFFF";

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║         Redeploy RSC with 3 Feeds (Remove USDC/USD)          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    
    const network = await ethers.provider.getNetwork();
    console.log(`Network: Chain ID ${network.chainId}`);
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} REACT\n`);
    
    // Verify we're on Reactive network
    if (network.chainId !== BigInt(5318007)) {
        throw new Error(`Wrong network! Expected Reactive (5318007), got ${network.chainId}`);
    }
    
    console.log("📋 Feeds to subscribe (3 volatile feeds):");
    console.log("─".repeat(60));
    FEEDS.forEach(f => {
        console.log(`  ✅ ${f.symbol.padEnd(10)} ${f.address}`);
    });
    console.log("  ❌ USDC/USD   (REMOVED - 24hr heartbeat, always ~$1.00)\n");
    
    console.log(`📡 Destination: ${DESTINATION_ADDRESS}`);
    console.log(`🔗 Origin Chain: Base Sepolia (${ORIGIN_CHAIN_ID})`);
    console.log(`🎯 Dest Chain: Sepolia (${DESTINATION_CHAIN_ID})\n`);
    
    // Deploy new RSC
    console.log("🚀 Deploying MultiFeedMirrorRCv2 with 3 feeds...\n");
    
    const feedAddresses = FEEDS.map(f => f.address);
    const decimals = FEEDS.map(f => f.decimals);
    const symbols = FEEDS.map(f => f.symbol);
    
    const MultiFeedMirror = await ethers.getContractFactory("MultiFeedMirrorRCv2");
    const rsc = await MultiFeedMirror.deploy(
        SERVICE_ADDRESS,
        ORIGIN_CHAIN_ID,
        DESTINATION_CHAIN_ID,
        DESTINATION_ADDRESS,
        feedAddresses,
        decimals,
        symbols,
        { gasLimit: 5000000 }
    );
    
    console.log("⏳ Waiting for deployment confirmation...");
    await rsc.waitForDeployment();
    
    const rscAddress = await rsc.getAddress();
    console.log(`\n✅ MultiFeedMirrorRCv2 deployed: ${rscAddress}`);
    
    // Verify subscriptions
    console.log("\n📊 Verifying subscriptions...");
    const feedCount = await rsc.getFeedCount();
    console.log(`Feed count: ${feedCount}`);
    
    for (let i = 0; i < Number(feedCount); i++) {
        const [addr, dec, sym] = await rsc.getFeedInfo(i);
        console.log(`  Feed ${i}: ${sym} (${addr})`);
    }
    
    console.log("\n" + "═".repeat(60));
    console.log("📋 NEXT STEPS:");
    console.log("═".repeat(60));
    console.log(`
1. Authorize the new RSC on destination (Sepolia):
   
   npx hardhat run scripts/authorize_new_rsc.ts --network sepolia
   
   With RSC address: ${rscAddress}

2. Fund the new RSC with REACT tokens (if needed)

3. Monitor for callbacks:
   
   npx hardhat run scripts/multi_feed_status.ts --network sepolia
`);
    
    // Save deployment info
    console.log("═".repeat(60));
    console.log("📝 DEPLOYMENT SUMMARY:");
    console.log("═".repeat(60));
    console.log(`NEW RSC Address:    ${rscAddress}`);
    console.log(`Destination:        ${DESTINATION_ADDRESS}`);
    console.log(`Feeds:              ETH/USD, BTC/USD, LINK/USD`);
    console.log(`Deployer (RVM ID):  ${deployer.address}`);
    console.log("═".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
