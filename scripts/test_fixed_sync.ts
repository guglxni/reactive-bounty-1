import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const NEW_RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  const NEW_DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';
  
  // Get providers and wallets
  const baseSepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const reactiveProvider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const sepoliaProvider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/aejFWwWsobhAYOLqU0u0t');
  
  const pk = process.env.PRIVATE_KEY!;
  const wallet = new ethers.Wallet(pk, reactiveProvider);
  
  const chainlinkAbi = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
  const rscAbi = ['function forceUpdate(address feedAddr, uint256 roundId, int256 answer, uint256 updatedAt) external payable'];
  const destAbi = [
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, uint256, uint256, bool)'
  ];
  
  const rscContract = new ethers.Contract(NEW_RSC, rscAbi, wallet);
  const destContract = new ethers.Contract(NEW_DEST, destAbi, sepoliaProvider);
  
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  console.log('=== SYNCING ALL FEEDS TO NEW DESTINATION ===\n');
  
  for (const [name, addr] of Object.entries(feeds)) {
    console.log(`${name}:`);
    
    // Get origin data
    const chainlink = new ethers.Contract(addr, chainlinkAbi, baseSepoliaProvider);
    const [roundId, answer, , updatedAt] = await chainlink.latestRoundData();
    console.log(`  Origin: $${(Number(answer) / 1e8).toFixed(2)} (round ${roundId})`);
    
    // Sync
    console.log('  Syncing...');
    const tx = await rscContract.forceUpdate(addr, roundId, answer, updatedAt, { gasLimit: 500000 });
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log('  Callback emitted!');
    console.log();
  }
  
  console.log('Waiting 90s for bridge to process...\n');
  await new Promise(resolve => setTimeout(resolve, 90000));
  
  console.log('=== FINAL STATUS ===\n');
  for (const [name, addr] of Object.entries(feeds)) {
    try {
      const [roundId, answer, , updatedAt] = await destContract.latestRoundData(addr);
      const [totalUpdates, , , , isStale] = await destContract.getFeedStats(addr);
      console.log(`${name}: $${(Number(answer) / 1e8).toFixed(2)} | Updates: ${totalUpdates} | Stale: ${isStale}`);
    } catch (e: any) {
      console.log(`${name}: Error - ${e.message.substring(0, 50)}`);
    }
  }
}

main().catch(console.error);
