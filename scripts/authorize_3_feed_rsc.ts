import { ethers } from "hardhat";

/**
 * Authorize the new 3-feed RSC on destination
 */

const NEW_RSC_ADDRESS = "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB";
const DESTINATION_ADDRESS = "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3";

// The RVM ID is the deployer address
const DEPLOYER_ADDRESS = "0xDDe9D31a31d6763612C7f535f51E5dC9f830682e";

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║          Authorize New RSC (3 Feeds) on Destination          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    
    const network = await ethers.provider.getNetwork();
    console.log(`Network: Chain ID ${network.chainId}`);
    
    if (network.chainId !== BigInt(11155111)) {
        throw new Error("Must run on Sepolia network");
    }
    
    const [signer] = await ethers.getSigners();
    console.log(`Signer: ${signer.address}\n`);
    
    // Get destination contract
    const destination = await ethers.getContractAt("MultiFeedDestinationV2", DESTINATION_ADDRESS);
    
    // Check current authorization
    const currentAuth = await destination.authorizedReactiveContract();
    console.log(`Current authorized: ${currentAuth}`);
    
    // The RVM ID is the deployer address, NOT the RSC address
    // When RSC sends a callback, the sender appears as the deployer address
    console.log(`\n📝 Setting authorized to deployer (RVM ID): ${DEPLOYER_ADDRESS}`);
    console.log(`   (This is the address that appears as msg.sender for callbacks)`);
    
    // Check if already correct
    if (currentAuth.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase()) {
        console.log("\n✅ Already correctly authorized to deployer address!");
    } else {
        const tx = await destination.setAuthorizedReactiveContract(DEPLOYER_ADDRESS);
        console.log(`\n⏳ Transaction: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Authorization updated!");
    }
    
    // Verify
    const newAuth = await destination.authorizedReactiveContract();
    console.log(`\n🔐 Verified authorized: ${newAuth}`);
    
    console.log("\n" + "═".repeat(60));
    console.log("📋 DEPLOYMENT COMPLETE - 3 Feed System");
    console.log("═".repeat(60));
    console.log(`
NEW RSC:     ${NEW_RSC_ADDRESS}
Destination: ${DESTINATION_ADDRESS}
RVM ID:      ${DEPLOYER_ADDRESS}
Feeds:       ETH/USD, BTC/USD, LINK/USD

The RSC is now subscribed to 3 volatile crypto feeds.
Callbacks should start arriving within ~15-20 minutes.

Monitor with:
  npx hardhat run scripts/multi_feed_status.ts --network sepolia
`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
