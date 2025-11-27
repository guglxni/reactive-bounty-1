import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');
  
  // OLD contracts
  const OLD_DEST = '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3';
  // NEW contracts  
  const NEW_DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';
  
  const destAbi = [
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, uint256, uint256, bool)',
    'function rvm_id() view returns (address)',
    'function vendor() view returns (address)',
    'function getFeedCount() view returns (uint256)',
    'function totalGlobalUpdates() view returns (uint256)'
  ];
  
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  console.log('=== OLD DESTINATION STATUS ===');
  const oldDest = new ethers.Contract(OLD_DEST, destAbi, sepoliaProvider);
  try {
    const oldGlobal = await oldDest.totalGlobalUpdates();
    console.log(`Total updates: ${oldGlobal}`);
    console.log(`rvm_id: ${await oldDest.rvm_id()}`);
    
    for (const [name, addr] of Object.entries(feeds)) {
      try {
        const [totalUpdates, lastBlock, lastTs, , isStale] = await oldDest.getFeedStats(addr);
        const [, answer, , updatedAt] = await oldDest.latestRoundData(addr);
        const price = Number(answer) / 1e8;
        const ago = Math.floor((Date.now()/1000 - Number(updatedAt)) / 60);
        console.log(`  ${name}: $${price.toFixed(2)} | Updates: ${totalUpdates} | ${ago} min ago`);
      } catch (e) {
        console.log(`  ${name}: No data`);
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
  
  console.log('\n=== NEW DESTINATION STATUS ===');
  const newDest = new ethers.Contract(NEW_DEST, destAbi, sepoliaProvider);
  try {
    const newGlobal = await newDest.totalGlobalUpdates();
    console.log(`Total updates: ${newGlobal}`);
    console.log(`rvm_id: ${await newDest.rvm_id()}`);
    
    for (const [name, addr] of Object.entries(feeds)) {
      try {
        const [totalUpdates, lastBlock, lastTs, , isStale] = await newDest.getFeedStats(addr);
        const [, answer, , updatedAt] = await newDest.latestRoundData(addr);
        const price = Number(answer) / 1e8;
        const ago = Math.floor((Date.now()/1000 - Number(updatedAt)) / 60);
        console.log(`  ${name}: $${price.toFixed(2)} | Updates: ${totalUpdates} | ${ago} min ago`);
      } catch (e) {
        console.log(`  ${name}: No data`);
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
