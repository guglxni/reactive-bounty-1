/**
 * Reactivate Deployment Script
 * 
 * Deploys the Reactivate auto-funding system:
 * 1. DevAccountFactory - For developers to create funding accounts
 * 2. FunderFactory - For creating Funder instances
 * 3. Funder - Individual auto-refill contract (created via factory)
 * 4. ReactivateFunderRC - Reactive contract to trigger callbacks
 * 
 * Usage:
 *   npx hardhat run scripts/deploy_reactivate.ts --network sepolia
 *   npx hardhat run scripts/deploy_reactivate.ts --network lasna
 */

import { ethers } from "hardhat";

// Configuration
const CONFIG = {
    // Sepolia configuration
    SEPOLIA: {
        CALLBACK_PROXY: "0x33Bbb7D0a2F1029550B0e91f653c4055DC9F4Dd8",
        CHAIN_ID: 11155111,
    },
    // Lasna (Reactive) configuration
    LASNA: {
        SYSTEM_CONTRACT: "0x0000000000000000000000000000000000FFFFFF",
        CHAIN_ID: 5318008,  // Lasna testnet
    },
    // Price Update event topic (from ChainlinkFeedMirrorRCv2)
    PRICE_UPDATE_TOPIC: ethers.id("PriceUpdated(bytes32,int256,uint256)"),
    
    // Default funder settings
    DEFAULT_REFILL_VALUE: ethers.parseEther("0.5"),  // 0.5 ETH per refill
    DEFAULT_REFILL_THRESHOLD: ethers.parseEther("0.1"),  // Refill when below 0.1 ETH
    MIN_BLOCKS_BETWEEN_CALLBACKS: 10,  // Rate limit
};

// Our deployed contracts
const DEPLOYED = {
    // Multi-feed RSC
    MULTI_FEED_RSC: "0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5",
    // Destination proxy
    DESTINATION: "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3",
};

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log("=========================================");
    console.log("       REACTIVATE DEPLOYMENT");
    console.log("=========================================");
    console.log(`Network: ${network.name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log("=========================================\n");

    if (chainId === CONFIG.SEPOLIA.CHAIN_ID) {
        await deployOnSepolia(deployer);
    } else if (chainId === CONFIG.LASNA.CHAIN_ID) {
        await deployOnLasna(deployer);
    } else {
        console.log("⚠️  Unknown network. Running generic deployment...");
        await deployGeneric(deployer);
    }
}

/**
 * Deploy on Sepolia (L1) - DevAccountFactory, FunderFactory, Funder
 */
async function deployOnSepolia(deployer: any) {
    console.log("📦 Deploying Reactivate L1 contracts on Sepolia...\n");

    // 1. Deploy DevAccountFactory
    console.log("1️⃣  Deploying DevAccountFactory...");
    const DevAccountFactory = await ethers.getContractFactory("DevAccountFactory");
    const devAccountFactory = await DevAccountFactory.deploy();
    await devAccountFactory.waitForDeployment();
    const devAccountFactoryAddr = await devAccountFactory.getAddress();
    console.log(`   ✅ DevAccountFactory: ${devAccountFactoryAddr}`);

    // 2. Deploy FunderFactory
    console.log("\n2️⃣  Deploying FunderFactory...");
    const FunderFactory = await ethers.getContractFactory("FunderFactory");
    const funderFactory = await FunderFactory.deploy(
        devAccountFactoryAddr,
        CONFIG.SEPOLIA.CALLBACK_PROXY
    );
    await funderFactory.waitForDeployment();
    const funderFactoryAddr = await funderFactory.getAddress();
    console.log(`   ✅ FunderFactory: ${funderFactoryAddr}`);

    // 3. Create DevAccount for deployer
    console.log("\n3️⃣  Creating DevAccount for deployer...");
    const createTx = await devAccountFactory.createDevAccount({ value: ethers.parseEther("5") });
    await createTx.wait();
    const devAccountAddr = await devAccountFactory.devAccounts(deployer.address);
    console.log(`   ✅ DevAccount: ${devAccountAddr}`);

    // 4. Create Funder via factory
    console.log("\n4️⃣  Creating Funder for existing contracts...");
    const funderTx = await funderFactory.createFunder(
        DEPLOYED.DESTINATION,      // Callback contract (L1)
        DEPLOYED.MULTI_FEED_RSC,   // Reactive contract (L2)
        CONFIG.DEFAULT_REFILL_VALUE,
        CONFIG.DEFAULT_REFILL_THRESHOLD
    );
    await funderTx.wait();
    const funderAddr = await funderFactory.latestDeployed();
    console.log(`   ✅ Funder: ${funderAddr}`);

    // Summary
    console.log("\n=========================================");
    console.log("       SEPOLIA DEPLOYMENT COMPLETE");
    console.log("=========================================");
    console.log(`DevAccountFactory: ${devAccountFactoryAddr}`);
    console.log(`FunderFactory:     ${funderFactoryAddr}`);
    console.log(`DevAccount:        ${devAccountAddr}`);
    console.log(`Funder:            ${funderAddr}`);
    console.log("=========================================");
    console.log("\n📝 Next step: Deploy ReactivateFunderRC on Lasna");
    console.log(`   Use Funder address: ${funderAddr}`);
    
    // Save addresses
    return {
        devAccountFactory: devAccountFactoryAddr,
        funderFactory: funderFactoryAddr,
        devAccount: devAccountAddr,
        funder: funderAddr,
    };
}

/**
 * Deploy on Lasna (Reactive Network) - ReactivateFunderRC
 */
async function deployOnLasna(deployer: any) {
    console.log("📦 Deploying Reactivate RSC on Lasna...\n");

    // Get funder address from user (deployed on Sepolia)
    const funderAddress = process.env.FUNDER_ADDRESS;
    if (!funderAddress) {
        console.error("❌ Please set FUNDER_ADDRESS environment variable");
        console.log("   Export it after deploying on Sepolia:");
        console.log("   export FUNDER_ADDRESS=0x...");
        process.exit(1);
    }

    console.log(`Using Funder address: ${funderAddress}`);

    // Deploy ReactivateFunderRC
    console.log("\n1️⃣  Deploying ReactivateFunderRC...");
    const ReactivateFunderRC = await ethers.getContractFactory("ReactivateFunderRC");
    const funderRC = await ReactivateFunderRC.deploy(
        CONFIG.SEPOLIA.CHAIN_ID,           // Callback chain (Sepolia)
        funderAddress,                      // Funder on Sepolia
        CONFIG.SEPOLIA.CHAIN_ID,           // Source chain to monitor
        DEPLOYED.DESTINATION,               // Monitor destination updates
        CONFIG.PRICE_UPDATE_TOPIC,          // PriceUpdated event
        CONFIG.MIN_BLOCKS_BETWEEN_CALLBACKS,
        { value: ethers.parseEther("0.5") } // Initial funding for gas
    );
    await funderRC.waitForDeployment();
    const funderRCAddr = await funderRC.getAddress();
    console.log(`   ✅ ReactivateFunderRC: ${funderRCAddr}`);

    // Summary
    console.log("\n=========================================");
    console.log("       LASNA DEPLOYMENT COMPLETE");
    console.log("=========================================");
    console.log(`ReactivateFunderRC: ${funderRCAddr}`);
    console.log(`Monitors Funder:    ${funderAddress}`);
    console.log("=========================================");
    console.log("\n✅ Reactivate system fully deployed!");
    console.log("   The RSC will now trigger Funder callbacks on price updates.");
    
    return {
        funderRC: funderRCAddr,
    };
}

/**
 * Generic deployment (for testing)
 */
async function deployGeneric(deployer: any) {
    console.log("📦 Generic deployment (testing mode)...\n");
    
    // Deploy just DevAccountFactory for testing
    const DevAccountFactory = await ethers.getContractFactory("DevAccountFactory");
    const devAccountFactory = await DevAccountFactory.deploy();
    await devAccountFactory.waitForDeployment();
    console.log(`DevAccountFactory: ${await devAccountFactory.getAddress()}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
