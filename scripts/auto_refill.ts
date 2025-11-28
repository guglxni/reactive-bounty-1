/**
 * Auto-Refill Service for Reactive Smart Contracts
 * 
 * This script monitors RSC balances and automatically:
 * 1. Converts SepETH to REACT via the official faucet when wallet balance is low
 * 2. Funds RSCs when their balance drops below threshold
 * 3. Covers any outstanding debt to reactivate inactive RSCs
 * 
 * Usage:
 *   npx hardhat run scripts/auto_refill.ts --network reactive
 * 
 * Configuration (via environment variables):
 *   - PRIVATE_KEY: Deployer wallet private key
 *   - SEPOLIA_RPC_URL: Sepolia RPC endpoint
 *   - REACTIVE_RPC_URL: Reactive Network RPC endpoint
 *   - MULTI_FEED_RSC_ADDRESS, RSC_V2_ADDRESS, REACTIVE_CONTRACT: RSC addresses to monitor
 */

import { ethers } from "hardhat";
import type { JsonRpcProvider, Wallet, Contract } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Faucet for SepETH -> REACT conversion (1:100 ratio)
  FAUCET_ADDRESS: "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434",
  
  // System contract for debt queries
  SYSTEM_CONTRACT: "0x0000000000000000000000000000000000fffFfF",
  
  // Thresholds
  RSC_MIN_BALANCE: ethers.parseEther("2"),      // Alert when RSC < 2 REACT
  RSC_REFILL_AMOUNT: ethers.parseEther("5"),    // Refill to 5 REACT
  WALLET_MIN_REACT: ethers.parseEther("20"),    // Min REACT in wallet
  WALLET_REFILL_SEPETH: ethers.parseEther("0.5"), // Convert 0.5 SepETH when low
  
  // Timing
  CHECK_INTERVAL_MS: 60000, // Check every 60 seconds
  CROSS_CHAIN_WAIT_MS: 30000, // Wait 30s for cross-chain transfers
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface RSCInfo {
  name: string;
  address: string;
}

interface BalanceStatus {
  balance: bigint;
  debt: bigint;
  needsRefill: boolean;
  needsDebtCover: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-REFILL SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class AutoRefillService {
  private sepoliaProvider: JsonRpcProvider;
  private reactiveProvider: JsonRpcProvider;
  private sepoliaWallet: Wallet;
  private reactiveWallet: Wallet;
  private systemContract: Contract;
  private rscs: RSCInfo[];
  private isRunning: boolean = false;
  
  constructor() {
    // Initialize providers
    this.sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    this.reactiveProvider = new ethers.JsonRpcProvider(process.env.REACTIVE_RPC_URL);
    
    // Initialize wallets
    const privateKey = process.env.PRIVATE_KEY!;
    this.sepoliaWallet = new ethers.Wallet(privateKey, this.sepoliaProvider);
    this.reactiveWallet = new ethers.Wallet(privateKey, this.reactiveProvider);
    
    // Initialize system contract
    const systemAbi = ["function debt(address _contract) view returns (uint256)"];
    this.systemContract = new ethers.Contract(
      CONFIG.SYSTEM_CONTRACT, 
      systemAbi, 
      this.reactiveProvider
    );
    
    // RSCs to monitor
    this.rscs = [
      { name: "Multi-Feed RSC", address: process.env.MULTI_FEED_RSC_ADDRESS! },
      { name: "V2 RSC", address: process.env.RSC_V2_ADDRESS! },
      { name: "Original RSC", address: process.env.REACTIVE_CONTRACT! },
    ].filter(r => r.address);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    console.log("═══════════════════════════════════════════════════════════");
    console.log("           🔄 AUTO-REFILL SERVICE STARTED                  ");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n📍 Wallet: ${this.reactiveWallet.address}`);
    console.log(`📊 Monitoring ${this.rscs.length} RSCs`);
    console.log(`⏰ Check interval: ${CONFIG.CHECK_INTERVAL_MS / 1000}s`);
    console.log(`💰 RSC min balance: ${ethers.formatEther(CONFIG.RSC_MIN_BALANCE)} REACT`);
    console.log(`💰 RSC refill amount: ${ethers.formatEther(CONFIG.RSC_REFILL_AMOUNT)} REACT\n`);
    
    // Initial check
    await this.runCheck();
    
    // Continuous monitoring
    while (this.isRunning) {
      await this.sleep(CONFIG.CHECK_INTERVAL_MS);
      await this.runCheck();
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log("\n🛑 Auto-refill service stopped");
  }

  async runCheck(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Running balance check...`);
    
    try {
      // Step 1: Check wallet balances
      await this.checkWalletBalances();
      
      // Step 2: Check and refill RSCs
      for (const rsc of this.rscs) {
        await this.checkAndRefillRSC(rsc);
      }
      
      console.log(`[${timestamp}] ✅ Check complete`);
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Error: ${error.message}`);
    }
  }

  private async checkWalletBalances(): Promise<void> {
    const reactBalance = await this.reactiveProvider.getBalance(this.reactiveWallet.address);
    const sepoliaBalance = await this.sepoliaProvider.getBalance(this.sepoliaWallet.address);
    
    console.log(`   Wallet REACT: ${ethers.formatEther(reactBalance)}`);
    console.log(`   Wallet SepETH: ${ethers.formatEther(sepoliaBalance)}`);
    
    // Auto-convert SepETH to REACT if wallet balance is low
    if (reactBalance < CONFIG.WALLET_MIN_REACT) {
      if (sepoliaBalance > CONFIG.WALLET_REFILL_SEPETH) {
        console.log(`\n   ⚠️ Low REACT balance! Converting SepETH...`);
        await this.convertSepEthToReact(CONFIG.WALLET_REFILL_SEPETH);
      } else {
        console.log(`\n   ⚠️ Low REACT and SepETH! Please fund wallet manually.`);
      }
    }
  }

  private async convertSepEthToReact(amount: bigint): Promise<void> {
    console.log(`   💱 Sending ${ethers.formatEther(amount)} SepETH to faucet...`);
    
    const tx = await this.sepoliaWallet.sendTransaction({
      to: CONFIG.FAUCET_ADDRESS,
      value: amount,
    });
    
    console.log(`   TX: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ Conversion initiated!`);
    
    // Wait for cross-chain transfer
    console.log(`   ⏳ Waiting ${CONFIG.CROSS_CHAIN_WAIT_MS / 1000}s for REACT...`);
    await this.sleep(CONFIG.CROSS_CHAIN_WAIT_MS);
    
    const newBalance = await this.reactiveProvider.getBalance(this.reactiveWallet.address);
    console.log(`   New REACT balance: ${ethers.formatEther(newBalance)}`);
  }

  private async checkAndRefillRSC(rsc: RSCInfo): Promise<void> {
    const status = await this.getRSCStatus(rsc.address);
    
    const statusEmoji = status.debt > 0n ? "🔴" : 
                        status.balance < CONFIG.RSC_MIN_BALANCE ? "🟡" : "🟢";
    
    console.log(`   ${statusEmoji} ${rsc.name}: ${ethers.formatEther(status.balance)} REACT` +
                (status.debt > 0n ? ` (debt: ${ethers.formatEther(status.debt)})` : ""));
    
    if (status.needsRefill || status.needsDebtCover) {
      await this.refillRSC(rsc, status);
    }
  }

  private async getRSCStatus(address: string): Promise<BalanceStatus> {
    const balance = await this.reactiveProvider.getBalance(address);
    const debt = await this.systemContract.debt(address);
    
    return {
      balance,
      debt,
      needsRefill: balance < CONFIG.RSC_MIN_BALANCE,
      needsDebtCover: debt > 0n,
    };
  }

  private async refillRSC(rsc: RSCInfo, status: BalanceStatus): Promise<void> {
    console.log(`\n   🔧 Refilling ${rsc.name}...`);
    
    // Calculate amount to send
    const targetBalance = CONFIG.RSC_REFILL_AMOUNT;
    const amountNeeded = targetBalance - status.balance + status.debt;
    
    if (amountNeeded > 0n) {
      // Check wallet balance
      const walletBalance = await this.reactiveProvider.getBalance(this.reactiveWallet.address);
      
      if (walletBalance < amountNeeded + ethers.parseEther("1")) {
        console.log(`   ⚠️ Insufficient wallet balance for refill`);
        return;
      }
      
      // Send REACT to RSC
      console.log(`   Sending ${ethers.formatEther(amountNeeded)} REACT...`);
      const fundTx = await this.reactiveWallet.sendTransaction({
        to: rsc.address,
        value: amountNeeded,
      });
      console.log(`   Fund TX: ${fundTx.hash}`);
      await fundTx.wait();
      console.log(`   ✅ Funded!`);
    }
    
    // Cover debt if any
    if (status.needsDebtCover) {
      console.log(`   Covering debt...`);
      
      const rscAbi = ["function coverDebt() external"];
      const rscContract = new ethers.Contract(rsc.address, rscAbi, this.reactiveWallet);
      
      const coverTx = await rscContract.coverDebt();
      console.log(`   Cover TX: ${coverTx.hash}`);
      await coverTx.wait();
      console.log(`   ✅ Debt covered!`);
    }
    
    // Verify final state
    const newStatus = await this.getRSCStatus(rsc.address);
    console.log(`   Final: ${ethers.formatEther(newStatus.balance)} REACT, ` +
                `Debt: ${ethers.formatEther(newStatus.debt)}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const service = new AutoRefillService();
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\nReceived SIGINT, shutting down...");
    service.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    console.log("\n\nReceived SIGTERM, shutting down...");
    service.stop();
    process.exit(0);
  });
  
  await service.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
