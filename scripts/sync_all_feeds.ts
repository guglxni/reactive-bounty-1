import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pk = process.env.PRIVATE_KEY!;
  
  const baseSepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const reactiveProvider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const sepoliaProvider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');
  const wallet = new ethers.Wallet(pk, reactiveProvider);
  
  const RSC = '0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB';
  const DEST = '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3';
  
  const rscAbi = ['function forceUpdate(address feedAddr, uint256 roundId, int256 answer, uint256 updatedAt) external payable'];
  const rscContract = new ethers.Contract(RSC, rscAbi, wallet);
  
  const destAbi = [
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, int256, uint256, bool)'
  ];
  const destContract = new ethers.Contract(DEST, destAbi, sepoliaProvider);
  
  const chainlinkAbi = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
  
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  console.log('=== SYNCING ALL FEEDS ===\n');
  
  for (const [name, addr] of Object.entries(feeds)) {
    console.log(`${name}:`);
    
    // Get origin data
    const chainlink = new ethers.Contract(addr, chainlinkAbi, baseSepoliaProvider);
    const [roundId, answer, , updatedAt] = await chainlink.latestRoundData();
    console.log(`  Origin: $${(Number(answer) / 1e8).toFixed(2)} (round ${roundId})`);
    
    // Get destination data
    const [destRoundId, destAnswer] = await destContract.latestRoundData(addr);
    console.log(`  Dest:   $${(Number(destAnswer) / 1e8).toFixed(2)} (round ${destRoundId})`);
    
    // Sync if different
    if (roundId > destRoundId) {
      console.log('  Syncing...');
      const tx = await rscContract.forceUpdate(addr, roundId, answer, updatedAt, { gasLimit: 500000 });
      console.log(`  TX: ${tx.hash}`);
      await tx.wait();
      console.log('  Callback emitted!');
    } else {
      console.log('  Already synced!');
    }
    console.log();
  }
  
  console.log('Waiting 60s for bridge to process...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  console.log('\n=== FINAL STATUS ===\n');
  for (const [name, addr] of Object.entries(feeds)) {
    const [roundId, answer, , updatedAt] = await destContract.latestRoundData(addr);
    const [totalUpdates, , , , isStale] = await destContract.getFeedStats(addr);
    console.log(`${name}: $${(Number(answer) / 1e8).toFixed(2)} | Updates: ${totalUpdates} | Stale: ${isStale}`);
  }
}

main().catch(console.error);
