import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const NEW_RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  const NEW_DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';
  
  const baseSepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const reactiveProvider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const sepoliaProvider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/aejFWwWsobhAYOLqU0u0t');
  
  const pk = process.env.PRIVATE_KEY!;
  const wallet = new ethers.Wallet(pk, reactiveProvider);
  
  const chainlinkAbi = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
  const rscAbi = ['function forceUpdate(address feedAddr, uint256 roundId, int256 answer, uint256 updatedAt) external payable'];
  const destAbi = [
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, uint256, uint256, bool)',
    'function totalGlobalUpdates() view returns (uint256)'
  ];
  
  const rscContract = new ethers.Contract(NEW_RSC, rscAbi, wallet);
  const destContract = new ethers.Contract(NEW_DEST, destAbi, sepoliaProvider);
  
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  console.log('=== BEFORE SYNC ===');
  const beforeUpdates = await destContract.totalGlobalUpdates();
  console.log(`Total updates: ${beforeUpdates}\n`);
  
  console.log('=== SYNCING ALL FEEDS ===\n');
  
  for (const [name, addr] of Object.entries(feeds)) {
    console.log(`${name} (${addr}):`);
    
    // Get origin data
    const chainlink = new ethers.Contract(addr, chainlinkAbi, baseSepoliaProvider);
    const [roundId, answer, , updatedAt] = await chainlink.latestRoundData();
    console.log(`  Origin: $${(Number(answer) / 1e8).toFixed(2)} (round ${roundId})`);
    
    // Sync
    try {
      console.log('  Calling forceUpdate...');
      const tx = await rscContract.forceUpdate(addr, roundId, answer, updatedAt, { gasLimit: 500000 });
      console.log(`  TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Confirmed in block ${receipt.blockNumber}`);
      
      // Parse events
      for (const log of receipt.logs) {
        console.log(`  Event: ${log.topics[0].substring(0, 10)}...`);
      }
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log();
  }
  
  console.log('Waiting 120s for bridge...\n');
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  console.log('=== AFTER SYNC ===');
  const afterUpdates = await destContract.totalGlobalUpdates();
  console.log(`Total updates: ${afterUpdates} (was ${beforeUpdates})\n`);
  
  for (const [name, addr] of Object.entries(feeds)) {
    try {
      const [totalUpdates] = await destContract.getFeedStats(addr);
      const [, answer, , updatedAt] = await destContract.latestRoundData(addr);
      const price = Number(answer) / 1e8;
      console.log(`${name}: $${price.toFixed(2)} | Updates: ${totalUpdates}`);
    } catch (e) {
      console.log(`${name}: No data`);
    }
  }
}

main().catch(console.error);
