import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const FAUCET_ADDRESS = "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434";
const SYSTEM_CONTRACT = "0x0000000000000000000000000000000000fffFfF";

async function main() {
  const [signer] = await ethers.getSigners();
  
  console.log("═══════════════════════════════════════════════════════════");
  console.log("              FUND ALL RSCs & COVER DEBT                    ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n📍 Deployer: ${signer.address}\n`);

  // Setup providers
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const reactiveProvider = new ethers.JsonRpcProvider(process.env.REACTIVE_RPC_URL);
  
  const sepoliaWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, sepoliaProvider);
  const reactiveWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, reactiveProvider);

  // Check current REACT balance
  let reactBalance = await reactiveProvider.getBalance(reactiveWallet.address);
  console.log(`Current REACT Balance: ${ethers.formatEther(reactBalance)} REACT`);

  // Step 1: Convert some SepETH to REACT if needed
  const REQUIRED_REACT = ethers.parseEther("50"); // Need at least 50 REACT
  
  if (reactBalance < REQUIRED_REACT) {
    const sepoliaBalance = await sepoliaProvider.getBalance(sepoliaWallet.address);
    console.log(`\n💱 Converting SepETH to REACT...`);
    console.log(`   SepETH available: ${ethers.formatEther(sepoliaBalance)}`);
    
    // Convert 0.5 SepETH = 50 REACT
    const convertAmount = ethers.parseEther("0.5");
    
    if (sepoliaBalance > convertAmount) {
      console.log(`   Sending ${ethers.formatEther(convertAmount)} SepETH to faucet...`);
      
      const tx = await sepoliaWallet.sendTransaction({
        to: FAUCET_ADDRESS,
        value: convertAmount,
      });
      
      console.log(`   TX Hash: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);
      await tx.wait();
      console.log(`   ✅ Conversion initiated!`);
      
      // Wait for cross-chain transfer
      console.log(`   ⏳ Waiting 30s for REACT to arrive on Lasna...`);
      await new Promise(r => setTimeout(r, 30000));
      
      reactBalance = await reactiveProvider.getBalance(reactiveWallet.address);
      console.log(`   New REACT Balance: ${ethers.formatEther(reactBalance)} REACT`);
    } else {
      console.log(`   ⚠️ Not enough SepETH to convert!`);
    }
  }

  // Step 2: Fund RSCs and cover debt
  const RSC_ADDRESSES = [
    { name: "Multi-Feed RSC", address: process.env.MULTI_FEED_RSC_ADDRESS! },
    { name: "V2 RSC", address: process.env.RSC_V2_ADDRESS! },
    { name: "Original RSC", address: process.env.REACTIVE_CONTRACT! },
  ].filter(r => r.address);

  const systemAbi = ["function debt(address _contract) view returns (uint256)"];
  const systemContract = new ethers.Contract(SYSTEM_CONTRACT, systemAbi, reactiveProvider);

  const rscAbi = ["function coverDebt() external"];

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    FUNDING RSCs                            ");
  console.log("═══════════════════════════════════════════════════════════");

  for (const rsc of RSC_ADDRESSES) {
    console.log(`\n📋 ${rsc.name}: ${rsc.address}`);
    
    try {
      const balance = await reactiveProvider.getBalance(rsc.address);
      const debt = await systemContract.debt(rsc.address);
      
      console.log(`   Current Balance: ${ethers.formatEther(balance)} REACT`);
      console.log(`   Current Debt: ${ethers.formatEther(debt)} REACT`);

      // Calculate how much to send (debt + buffer for operations)
      const BUFFER = ethers.parseEther("5"); // 5 REACT buffer
      const needed = debt + BUFFER;
      
      if (needed > balance) {
        const toSend = needed - balance;
        console.log(`   Sending ${ethers.formatEther(toSend)} REACT...`);
        
        const fundTx = await reactiveWallet.sendTransaction({
          to: rsc.address,
          value: toSend,
        });
        
        console.log(`   Fund TX: ${fundTx.hash}`);
        await fundTx.wait();
        console.log(`   ✅ Funded!`);
      }

      // Cover debt if any
      if (debt > 0n) {
        console.log(`   Covering debt...`);
        
        const rscContract = new ethers.Contract(rsc.address, rscAbi, reactiveWallet);
        const coverTx = await rscContract.coverDebt();
        
        console.log(`   Cover TX: ${coverTx.hash}`);
        await coverTx.wait();
        console.log(`   ✅ Debt covered!`);
      }

      // Verify final state
      const newBalance = await reactiveProvider.getBalance(rsc.address);
      const newDebt = await systemContract.debt(rsc.address);
      
      console.log(`   Final Balance: ${ethers.formatEther(newBalance)} REACT`);
      console.log(`   Final Debt: ${ethers.formatEther(newDebt)} REACT`);
      console.log(`   ✅ STATUS: ${newDebt === 0n ? "ACTIVE" : "STILL HAS DEBT"}`);
      
    } catch (e: any) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                         DONE!                              ");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
