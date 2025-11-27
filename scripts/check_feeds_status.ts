import { ethers } from 'ethers';

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/aejFWwWsobhAYOLqU0u0t');
  
  const DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';  // NEW Fixed destination
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE', 
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  const destAbi = [
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, int256, uint256, bool)'
  ];
  const dest = new ethers.Contract(DEST, destAbi, sepoliaProvider);
  
  console.log('=== ALL FEEDS STATUS ===\n');
  
  for (const [name, addr] of Object.entries(feeds)) {
    const [roundId, answer, , updatedAt] = await dest.latestRoundData(addr);
    const [totalUpdates, , , , isStale] = await dest.getFeedStats(addr);
    const date = new Date(Number(updatedAt) * 1000);
    console.log(`${name}:`);
    console.log(`  Price: $${(Number(answer) / 1e8).toFixed(2)}`);
    console.log(`  Round: ${roundId}`);
    console.log(`  Updated: ${date.toISOString()}`);
    console.log(`  Total Updates: ${totalUpdates}`);
    console.log(`  Is Stale: ${isStale}`);
    console.log();
  }
}

main().catch(console.error);
