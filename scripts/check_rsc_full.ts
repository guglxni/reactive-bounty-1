import { ethers } from 'hardhat';

async function main() {
  const NEW_RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  const SYSTEM = '0x0000000000000000000000000000000000FFFFFF';
  
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  
  const systemAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function debtOf(address) view returns (uint256)'
  ];
  
  const rscAbi = [
    'function owner() view returns (address)',
    'function destination() view returns (address)',
    'function DESTINATION_CHAIN_ID() view returns (uint256)',
    'function feeds(uint256) view returns (address)',
    'function feedRoundIds(address) view returns (uint80)',
  ];
  
  const system = new ethers.Contract(SYSTEM, systemAbi, provider);
  const rsc = new ethers.Contract(NEW_RSC, rscAbi, provider);
  
  console.log('=== NEW RSC STATUS ===\n');
  
  const balance = await system.balanceOf(NEW_RSC);
  const debt = await system.debtOf(NEW_RSC);
  console.log(`Balance: ${ethers.formatEther(balance)} REACT`);
  console.log(`Debt: ${ethers.formatEther(debt)} REACT`);
  console.log(`Net: ${ethers.formatEther(balance - debt)} REACT`);
  
  console.log('\n--- Contract State ---');
  console.log(`Owner: ${await rsc.owner()}`);
  console.log(`Destination: ${await rsc.destination()}`);
  console.log(`Dest Chain ID: ${await rsc.DESTINATION_CHAIN_ID()}`);
  
  console.log('\n--- Feed Round IDs ---');
  const feeds: Record<string, string> = {
    'ETH/USD': '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3',
    'BTC/USD': '0x961AD289351459A45fC90884eF3AB0278ea95DDE',
    'LINK/USD': '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B',
  };
  
  for (const [name, addr] of Object.entries(feeds)) {
    const roundId = await rsc.feedRoundIds(addr);
    console.log(`${name}: Last round synced = ${roundId}`);
  }
}

main().catch(console.error);
