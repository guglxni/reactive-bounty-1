import { ethers } from 'hardhat';

async function main() {
  const NEW_RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  
  const rscAbi = [
    'function owner() view returns (address)',
    'function destination() view returns (address)',
    'function DESTINATION_CHAIN_ID() view returns (uint256)',
  ];
  
  const rsc = new ethers.Contract(NEW_RSC, rscAbi, provider);
  
  console.log('=== NEW RSC STATUS ===\n');
  console.log(`Owner: ${await rsc.owner()}`);
  console.log(`Destination: ${await rsc.destination()}`);
  console.log(`Dest Chain ID: ${await rsc.DESTINATION_CHAIN_ID()}`);
}

main().catch(console.error);
