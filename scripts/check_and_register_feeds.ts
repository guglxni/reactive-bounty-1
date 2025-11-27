import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pk = process.env.PRIVATE_KEY!;
  const sepoliaProvider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');
  const wallet = new ethers.Wallet(pk, sepoliaProvider);
  
  const DEST = '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3';
  
  const feeds: Record<string, string> = {
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE', 
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  const destAbi = [
    'function feedConfigs(address) view returns (uint8, string, bool, uint256, uint256, uint256)',
    'function registerFeed(address feedAddress, uint8 feedDecimals, string description) external'
  ];
  const dest = new ethers.Contract(DEST, destAbi, wallet);
  
  // Check registration status
  for (const [name, addr] of Object.entries(feeds)) {
    const [decimals, desc, enabled] = await dest.feedConfigs(addr);
    console.log(`${name}: ${enabled ? 'REGISTERED' : 'NOT REGISTERED'}`);
    
    if (!enabled) {
      console.log('  Registering...');
      const tx = await dest.registerFeed(addr, 8, name);
      console.log('  TX:', tx.hash);
      await tx.wait();
      console.log('  Registered!');
    }
  }
}

main().catch(console.error);
