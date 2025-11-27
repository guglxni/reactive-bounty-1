import { ethers } from 'ethers';

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/aejFWwWsobhAYOLqU0u0t');
  
  const DEST = '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3';
  const CALLBACK_PROXY = '0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA';
  
  // Look for recent PriceUpdated events on destination
  const destAbi = ['event PriceUpdated(address indexed feed, int256 price, uint256 roundId, uint256 timestamp)'];
  const dest = new ethers.Contract(DEST, destAbi, sepoliaProvider);
  
  const currentBlock = await sepoliaProvider.getBlockNumber();
  console.log('Current block:', currentBlock);
  console.log('Looking for PriceUpdated events in last 10 blocks...\n');
  
  try {
    const filter = dest.filters.PriceUpdated();
    const events = await dest.queryFilter(filter, currentBlock - 10, currentBlock);
    
    console.log(`Found ${events.length} PriceUpdated events:\n`);
    
    // Show last 10 events
    const lastEvents = events.slice(-10);
    for (const event of lastEvents) {
      const args = event.args!;
      const feedAddr = args[0];
      const price = args[1];
      const roundId = args[2];
      
      let feedName = 'Unknown';
      if (feedAddr === '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3') feedName = 'ETH/USD';
      if (feedAddr === '0x961AD289351459A45fC90884eF3AB0278ea95DDE') feedName = 'BTC/USD';
      if (feedAddr === '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B') feedName = 'LINK/USD';
      
      console.log(`${feedName}: $${(Number(price) / 1e8).toFixed(2)} | Round: ${roundId} | Block: ${event.blockNumber}`);
    }
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
