import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const FAUCET_ADDRESS = "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434";
const SYSTEM_CONTRACT = "0x0000000000000000000000000000000000fffFfF";

async function main() {
  const [signer] = await ethers.getSigners();
  
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    BALANCE CHECK REPORT                    ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n📍 Deployer Address: ${signer.address}\n`);

  // Check Sepolia balance
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const sepoliaBalance = await sepoliaProvider.getBalance(signer.address);
  console.log(`💰 Sepolia ETH Balance: ${ethers.formatEther(sepoliaBalance)} SepETH`);

  // Check Reactive (Lasna) balance
  const reactiveProvider = new ethers.JsonRpcProvider(process.env.REACTIVE_RPC_URL);
  const reactBalance = await reactiveProvider.getBalance(signer.address);
  console.log(`💰 Reactive (Lasna) Balance: ${ethers.formatEther(reactBalance)} REACT`);

  // Check RSC balances
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    RSC CONTRACT STATUS                     ");
  console.log("═══════════════════════════════════════════════════════════");

  const RSC_ADDRESSES = [
    { name: "Multi-Feed RSC", address: process.env.MULTI_FEED_RSC_ADDRESS },
    { name: "V2 RSC", address: process.env.RSC_V2_ADDRESS },
    { name: "Original RSC", address: process.env.REACTIVE_CONTRACT },
  ];

  const systemAbi = ["function debt(address _contract) view returns (uint256)"];
  const systemContract = new ethers.Contract(SYSTEM_CONTRACT, systemAbi, reactiveProvider);

  for (const rsc of RSC_ADDRESSES) {
    if (!rsc.address) continue;
    
    console.log(`\n📋 ${rsc.name}: ${rsc.address}`);
    
    try {
      const balance = await reactiveProvider.getBalance(rsc.address);
      const debt = await systemContract.debt(rsc.address);
      
      console.log(`   Balance: ${ethers.formatEther(balance)} REACT`);
      console.log(`   Debt: ${ethers.formatEther(debt)} REACT`);
      
      if (debt > 0n) {
        console.log(`   ⚠️  STATUS: INACTIVE (has debt)`);
      } else if (balance < ethers.parseEther("1")) {
        console.log(`   ⚠️  STATUS: LOW BALANCE`);
      } else {
        console.log(`   ✅ STATUS: HEALTHY`);
      }
    } catch (e: any) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }

  // Check Destination balances
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                 DESTINATION CONTRACT STATUS                ");
  console.log("═══════════════════════════════════════════════════════════");

  const DEST_ADDRESSES = [
    { name: "Multi-Feed Dest", address: process.env.MULTI_FEED_DEST_ADDRESS },
    { name: "V2 Dest", address: process.env.DEST_V2_ADDRESS },
    { name: "Original Dest", address: process.env.DEST_PROXY },
  ];

  for (const dest of DEST_ADDRESSES) {
    if (!dest.address) continue;
    
    console.log(`\n📋 ${dest.name}: ${dest.address}`);
    
    try {
      const balance = await sepoliaProvider.getBalance(dest.address);
      console.log(`   Balance: ${ethers.formatEther(balance)} SepETH`);
    } catch (e: any) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                       RECOMMENDATIONS                      ");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (sepoliaBalance < ethers.parseEther("0.1")) {
    console.log("⚠️  Low SepETH! Get more from: https://sepoliafaucet.com/");
  }
  
  if (reactBalance < ethers.parseEther("10")) {
    console.log("⚠️  Low REACT! Convert SepETH via faucet:");
    console.log(`   Send SepETH to ${FAUCET_ADDRESS} (1 SepETH = 100 REACT)`);
  }

  console.log("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
