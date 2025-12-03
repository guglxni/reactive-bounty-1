/**
 * Check Reactivate System Status
 * 
 * Checks the status of all SimpleFunders and RSCs
 */

import { ethers } from "hardhat";

// Deployed addresses
const REACTIVATE_ADDRESSES = {
    devAccount: "0x9178BB83aF9cDe4776aC11215EAa099511bBd242",
    funders: [
        {
            name: "Multi-Feed RSC",
            rsc: "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB",
            funder: "0x1cE8A544d14e02877623e9D5D2E3515CF07FC819"
        },
        {
            name: "V2 RSC",
            rsc: "0x2D12283203b8d27757BF76B5416A0818b168e853",
            funder: "0x2bD4eFc52190c394AD1172C415942d9ab7b95110"
        },
        {
            name: "Original RSC",
            rsc: "0xdC42Fc5E34a58Ad6Ee8fA9E2cfb67F7E34006A80",
            funder: "0x28aef09D2B54BB53528F9a6427805fabb263112B"
        }
    ]
};

async function main() {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("       REACTIVATE SYSTEM STATUS");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Check DevAccount
    const devAccountBalance = await ethers.provider.getBalance(REACTIVATE_ADDRESSES.devAccount);
    console.log(`📦 DevAccount: ${REACTIVATE_ADDRESSES.devAccount}`);
    console.log(`   Balance: ${ethers.formatEther(devAccountBalance)} REACT\n`);

    // Check each funder
    for (const funderInfo of REACTIVATE_ADDRESSES.funders) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📋 ${funderInfo.name}`);
        console.log(`   RSC: ${funderInfo.rsc}`);
        console.log(`   Funder: ${funderInfo.funder}`);
        
        try {
            const SimpleFunder = await ethers.getContractAt("SimpleFunder", funderInfo.funder);
            const status = await SimpleFunder.getStatus();
            
            console.log(`\n   📊 Status:`);
            console.log(`      RSC Balance: ${ethers.formatEther(status._rscBalance)} REACT`);
            console.log(`      RSC Debt: ${ethers.formatEther(status._rscDebt)} REACT`);
            console.log(`      Funder Balance: ${ethers.formatEther(status._funderBalance)} REACT`);
            console.log(`      Total Refills: ${status._totalRefills.toString()}`);
            console.log(`      Total Debt Payments: ${status._totalDebtPayments.toString()}`);
            console.log(`      Needs Refill: ${status._needsRefill ? "⚠️ YES" : "✅ No"}`);
            console.log(`      Has Debt: ${status._hasDebt ? "⚠️ YES" : "✅ No"}`);
            
            // Determine overall health
            const healthStatus = !status._needsRefill && !status._hasDebt ? "🟢 HEALTHY" : "🟡 NEEDS ATTENTION";
            console.log(`      Overall: ${healthStatus}`);
        } catch (error: any) {
            console.log(`   ❌ Error checking status: ${error.message}`);
        }
        console.log("");
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n📝 To manually trigger refill for an RSC:");
    console.log('   const funder = await ethers.getContractAt("SimpleFunder", "<funderAddress>")');
    console.log('   await funder.checkAndFund()');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
