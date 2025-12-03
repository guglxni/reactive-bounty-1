/**
 * Deploy Reactivate System on Lasna (Reactive Network)
 * 
 * This deploys the auto-funding infrastructure using REACT tokens:
 * 1. DevAccount - Holds REACT for auto-refills
 * 2. SimpleFunder - Monitors RSC balances and refills when low
 * 
 * The system monitors RSC balances and automatically:
 * - Refills when balance drops below threshold
 * - Covers debt if RSC becomes inactive
 */

import { ethers } from "hardhat";

// RSCs to monitor
const RSCS_TO_MONITOR = [
    {
        name: "Multi-Feed RSC",
        address: "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB",
    },
    {
        name: "V2 RSC", 
        address: "0x2D12283203b8d27757BF76B5416A0818b168e853",
    },
    {
        name: "Original RSC",
        address: "0xdC42Fc5E34a58Ad6Ee8fA9E2cfb67F7E34006A80",
    }
];

// Configuration
const CONFIG = {
    // Funding settings (in REACT)
    DEV_ACCOUNT_INITIAL_FUNDING: ethers.parseEther("20"),  // 20 REACT for DevAccount
    REFILL_THRESHOLD: ethers.parseEther("1"),               // Refill when below 1 REACT
    REFILL_AMOUNT: ethers.parseEther("3"),                  // Send 3 REACT per refill
    
    // System contract for debt queries
    SYSTEM_CONTRACT: "0x0000000000000000000000000000000000fffFfF",
};

async function main() {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("═══════════════════════════════════════════════════════════");
    console.log("       REACTIVATE DEPLOYMENT ON LASNA");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} REACT`);
    console.log("═══════════════════════════════════════════════════════════\n");

    // Check we have enough REACT
    const totalNeeded = CONFIG.DEV_ACCOUNT_INITIAL_FUNDING + ethers.parseEther("1"); // +1 for gas
    if (balance < totalNeeded) {
        console.error(`❌ Insufficient balance. Need ${ethers.formatEther(totalNeeded)} REACT`);
        process.exit(1);
    }

    // 1. Deploy DevAccount
    console.log("1️⃣  Deploying DevAccount...");
    const DevAccount = await ethers.getContractFactory("DevAccount");
    const devAccount = await DevAccount.deploy(deployer.address, { value: CONFIG.DEV_ACCOUNT_INITIAL_FUNDING });
    await devAccount.waitForDeployment();
    const devAccountAddr = await devAccount.getAddress();
    console.log(`   ✅ DevAccount: ${devAccountAddr}`);
    console.log(`   💰 Funded with: ${ethers.formatEther(CONFIG.DEV_ACCOUNT_INITIAL_FUNDING)} REACT`);

    // 2. Deploy SimpleFunder for each RSC
    console.log("\n2️⃣  Deploying SimpleFunders for RSCs...");
    const funderAddresses: string[] = [];
    
    for (const rsc of RSCS_TO_MONITOR) {
        console.log(`\n   📋 ${rsc.name}: ${rsc.address}`);
        
        const SimpleFunder = await ethers.getContractFactory("SimpleFunder");
        const funder = await SimpleFunder.deploy(
            rsc.address,                    // RSC to monitor
            devAccountAddr,                 // DevAccount for withdrawals
            CONFIG.REFILL_THRESHOLD,        // Threshold
            CONFIG.REFILL_AMOUNT,           // Refill amount
            { value: ethers.parseEther("0.5") }  // Initial gas funding
        );
        await funder.waitForDeployment();
        const funderAddr = await funder.getAddress();
        funderAddresses.push(funderAddr);
        console.log(`      ✅ SimpleFunder: ${funderAddr}`);
        
        // Whitelist funder on DevAccount
        const whitelistTx = await devAccount.whitelist(funderAddr);
        await whitelistTx.wait();
        console.log(`      ✅ Whitelisted on DevAccount`);
    }

    // Summary
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("       DEPLOYMENT COMPLETE");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`DevAccount:     ${devAccountAddr}`);
    console.log(`Balance:        ${ethers.formatEther(CONFIG.DEV_ACCOUNT_INITIAL_FUNDING)} REACT`);
    console.log("");
    console.log("SimpleFunders:");
    for (let i = 0; i < RSCS_TO_MONITOR.length; i++) {
        console.log(`  ${RSCS_TO_MONITOR[i].name}: ${funderAddresses[i]}`);
    }
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n📝 The SimpleFunders can be called manually to check and refill RSCs.");
    console.log("   Or deploy a ReactivateFunderRC to automate based on events.");

    return {
        devAccount: devAccountAddr,
        funders: funderAddresses,
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
