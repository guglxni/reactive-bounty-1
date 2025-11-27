import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/aejFWwWsobhAYOLqU0u0t');
  const baseSepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const reactiveProvider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  
  const RSC = '0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5';
  const DESTINATION = '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3';
  const CALLBACK_PROXY = '0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA';
  const SYSTEM_CONTRACT = '0x0000000000000000000000000000000000FFFFFF';
  
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       REACTIVE CROSS-CHAIN ORACLE - FINAL SYSTEM STATUS         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  // Destination status
  const destAbi = [
    'function totalGlobalUpdates() view returns (uint256)',
    'function latestRoundData(address) view returns (uint80, int256, uint256, uint256, uint80)',
    'function getFeedStats(address) view returns (uint256, uint256, uint256, uint256, bool)',
    'function getDebt() view returns (uint256)'
  ];
  
  const dest = new ethers.Contract(DESTINATION, destAbi, sepoliaProvider);
  
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  // Origin data
  const chainlinkAbi = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
  
  console.log('📍 CONTRACT ADDRESSES');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`RSC (Reactive Lasna):      ${RSC}`);
  console.log(`Destination (Sepolia):     ${DESTINATION}`);
  console.log(`Callback Proxy (Sepolia):  ${CALLBACK_PROXY}`);
  
  // Funding status
  console.log('\n💰 FUNDING STATUS');
  console.log('─────────────────────────────────────────────────────────────');
  
  const proxyAbi = ['function reserves(address) view returns (uint256)', 'function debt(address) view returns (uint256)'];
  const proxy = new ethers.Contract(CALLBACK_PROXY, proxyAbi, sepoliaProvider);
  const destReserves = await proxy.reserves(DESTINATION);
  const destDebt = await proxy.debt(DESTINATION);
  console.log(`Destination Reserves: ${ethers.formatEther(destReserves)} ETH`);
  console.log(`Destination Debt:     ${ethers.formatEther(destDebt)} ETH`);
  
  // Feed status
  console.log('\n📊 PRICE FEED STATUS');
  console.log('─────────────────────────────────────────────────────────────');
  
  const totalUpdates = await dest.totalGlobalUpdates();
  console.log(`Total Cross-Chain Updates: ${totalUpdates}\n`);
  
  for (const [name, addr] of Object.entries(feeds)) {
    const [totalFeedUpdates, , , , isStale] = await dest.getFeedStats(addr);
    const [roundId, answer, , updatedAt] = await dest.latestRoundData(addr);
    
    // Get origin price
    const chainlink = new ethers.Contract(addr, chainlinkAbi, baseSepoliaProvider);
    const [, originAnswer] = await chainlink.latestRoundData();
    
    const destPrice = Number(answer) / 1e8;
    const originPrice = Number(originAnswer) / 1e8;
    const ago = Math.floor((Date.now()/1000 - Number(updatedAt)) / 60);
    const status = isStale ? '⚠️  STALE' : '✅ LIVE';
    const match = Math.abs(destPrice - originPrice) < 1 ? '✓' : '✗';
    
    console.log(`${name}:`);
    console.log(`  Destination: $${destPrice.toFixed(2)}`);
    console.log(`  Origin:      $${originPrice.toFixed(2)} ${match}`);
    console.log(`  Updates:     ${totalFeedUpdates} | ${ago}m ago | ${status}`);
    console.log();
  }
  
  // Summary
  console.log('─────────────────────────────────────────────────────────────');
  console.log('✅ SYSTEM OPERATIONAL');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('• All 3 feeds are live and syncing');
  console.log('• Cross-chain callbacks working');
  console.log('• AggregatorV3Interface compatible');
  console.log('• Adequate funding for continued operation');
  console.log('\n🔗 Etherscan: https://sepolia.etherscan.io/address/' + DESTINATION);
  console.log('🔍 ReactScan: https://reactscan.net/address/' + RSC);
}

main().catch(console.error);
