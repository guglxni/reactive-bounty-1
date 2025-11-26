import { ethers } from "hardhat";
import * as readline from "readline";

/**
 * Multi-Feed Deployment Script V2
 * 
 * Deploys the multi-feed architecture:
 * 1. MultiFeedDestinationV2 on Sepolia (destination chain)
 * 2. MultiFeedMirrorRCv2 on Reactive Lasna (reactive chain)
 * 
 * Chain Configuration:
 * - Origin: Base Sepolia (84532)
 * - Reactive: Lasna Testnet (5318007)
 * - Destination: Ethereum Sepolia (11155111)
 */

// Network Configuration
const NETWORKS = {
    ORIGIN: {
        name: "Base Sepolia",
        chainId: 84532,
        rpc: "https://sepolia.base.org"
    },
    REACTIVE: {
        name: "Reactive Lasna",
        chainId: 5318007,
        rpc: "https://lasna-rpc.rnk.dev/",
        serviceAddress: "0x0000000000000000000000000000000000FFFFFF"
    },
    DESTINATION: {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpc: "https://rpc.ankr.com/eth_sepolia",
        callbackProxy: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA"
    }
};

// Chainlink Aggregators on Base Sepolia
const FEEDS = {
    ETH_USD: {
        address: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3",
        decimals: 8,
        symbol: "ETH/USD"
    },
    BTC_USD: {
        address: "0x961AD289351459A45fC90884eF3AB0278ea95DDE",
        decimals: 8,
        symbol: "BTC/USD"
    },
    LINK_USD: {
        address: "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B",
        decimals: 8,
        symbol: "LINK/USD"
    },
    USDC_USD: {
        address: "0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e",
        decimals: 8,
        symbol: "USDC/USD"
    }
};

// Deployment result type
interface DeploymentResult {
    destinationAddress: string;
    rscAddress: string;
    feeds: string[];
    network: {
        origin: typeof NETWORKS.ORIGIN;
        reactive: typeof NETWORKS.REACTIVE;
        destination: typeof NETWORKS.DESTINATION;
    };
}

// Prompt helper for interactive selection
async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function deployDestination(): Promise<string> {
    console.log("\n📡 Deploying MultiFeedDestinationV2 on Sepolia...\n");
    
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== BigInt(NETWORKS.DESTINATION.chainId)) {
        throw new Error(`Wrong network! Expected Sepolia (${NETWORKS.DESTINATION.chainId}), got ${network.chainId}`);
    }
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    
    const MultiFeedDestination = await ethers.getContractFactory("MultiFeedDestinationV2");
    const destination = await MultiFeedDestination.deploy(
        NETWORKS.DESTINATION.callbackProxy,
        { gasLimit: 3000000 }
    );
    await destination.waitForDeployment();
    
    const address = await destination.getAddress();
    console.log(`✅ MultiFeedDestinationV2 deployed: ${address}`);
    
    // Pre-register all feeds
    console.log("\n📝 Registering feeds...");
    const feedAddresses = Object.values(FEEDS).map(f => f.address);
    const decimals = Object.values(FEEDS).map(f => f.decimals);
    const symbols = Object.values(FEEDS).map(f => f.symbol);
    
    const tx = await destination.registerFeeds(feedAddresses, decimals, symbols);
    await tx.wait();
    console.log("✅ All feeds registered");
    
    return address;
}

async function deployRSC(destinationAddress: string, selectedFeeds: typeof FEEDS[keyof typeof FEEDS][]): Promise<string> {
    console.log("\n🔗 Deploying MultiFeedMirrorRCv2 on Reactive Lasna...\n");
    
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== BigInt(NETWORKS.REACTIVE.chainId)) {
        throw new Error(`Wrong network! Expected Reactive (${NETWORKS.REACTIVE.chainId}), got ${network.chainId}`);
    }
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} REACT`);
    
    const feedAddresses = selectedFeeds.map(f => f.address);
    const decimals = selectedFeeds.map(f => f.decimals);
    const symbols = selectedFeeds.map(f => f.symbol);
    
    console.log(`\nSubscribing to ${selectedFeeds.length} feeds:`);
    selectedFeeds.forEach(f => console.log(`  - ${f.symbol}: ${f.address}`));
    
    const MultiFeedMirror = await ethers.getContractFactory("MultiFeedMirrorRCv2");
    const rsc = await MultiFeedMirror.deploy(
        NETWORKS.REACTIVE.serviceAddress,
        NETWORKS.ORIGIN.chainId,
        NETWORKS.DESTINATION.chainId,
        destinationAddress,
        feedAddresses,
        decimals,
        symbols,
        { gasLimit: 5000000 }
    );
    await rsc.waitForDeployment();
    
    const address = await rsc.getAddress();
    console.log(`✅ MultiFeedMirrorRCv2 deployed: ${address}`);
    
    return address;
}

async function authorizeRSC(destinationAddress: string, rscAddress: string): Promise<void> {
    console.log("\n🔐 Authorizing RSC on Destination...\n");
    
    const destination = await ethers.getContractAt("MultiFeedDestinationV2", destinationAddress);
    const tx = await destination.setAuthorizedReactiveContract(rscAddress);
    await tx.wait();
    console.log(`✅ RSC ${rscAddress} authorized on destination`);
}

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║           Multi-Feed Price Mirror Deployment V2              ║");
    console.log("║                                                              ║");
    console.log("║  Origin: Base Sepolia → Reactive Lasna → Destination: Sepolia║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    
    // Get deployment mode from args
    const args = process.argv.slice(2);
    
    if (args.includes("--destination")) {
        // Deploy destination only
        await deployDestination();
    } else if (args.includes("--rsc")) {
        // Deploy RSC only (requires destination address)
        const destIndex = args.indexOf("--dest");
        if (destIndex === -1 || !args[destIndex + 1]) {
            console.error("Error: --rsc requires --dest <address>");
            process.exit(1);
        }
        const destinationAddress = args[destIndex + 1];
        
        // Select feeds to deploy
        console.log("\nAvailable feeds:");
        const feedEntries = Object.entries(FEEDS);
        feedEntries.forEach(([key, feed], i) => {
            console.log(`  ${i + 1}. ${feed.symbol}: ${feed.address}`);
        });
        
        const selection = await prompt("\nEnter feed numbers to subscribe (comma-separated, or 'all'): ");
        
        let selectedFeeds: typeof FEEDS[keyof typeof FEEDS][];
        if (selection.toLowerCase() === 'all') {
            selectedFeeds = Object.values(FEEDS);
        } else {
            const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
            selectedFeeds = indices.map(i => feedEntries[i][1]);
        }
        
        await deployRSC(destinationAddress, selectedFeeds);
    } else if (args.includes("--authorize")) {
        // Authorize RSC on destination
        const destIndex = args.indexOf("--dest");
        const rscIndex = args.indexOf("--rsc-addr");
        
        if (destIndex === -1 || !args[destIndex + 1] || rscIndex === -1 || !args[rscIndex + 1]) {
            console.error("Error: --authorize requires --dest <address> --rsc-addr <address>");
            process.exit(1);
        }
        
        await authorizeRSC(args[destIndex + 1], args[rscIndex + 1]);
    } else {
        console.log("Usage:");
        console.log("  --destination           Deploy MultiFeedDestinationV2 on Sepolia");
        console.log("  --rsc --dest <addr>     Deploy MultiFeedMirrorRCv2 on Reactive");
        console.log("  --authorize --dest <addr> --rsc-addr <addr>  Authorize RSC");
        console.log("\nExample full deployment workflow:");
        console.log("  1. npx hardhat run scripts/deploy_multi_feed_v2.ts --network sepolia --destination");
        console.log("  2. npx hardhat run scripts/deploy_multi_feed_v2.ts --network reactive --rsc --dest 0x...");
        console.log("  3. npx hardhat run scripts/deploy_multi_feed_v2.ts --network sepolia --authorize --dest 0x... --rsc-addr 0x...");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
