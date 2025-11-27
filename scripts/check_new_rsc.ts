import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  const SYSTEM = '0x0000000000000000000000000000000000FFFFFF';
  
  const balance = await provider.getBalance(RSC);
  console.log('RSC Balance:', ethers.formatEther(balance), 'REACT');
  
  const sysAbi = ['function debts(address) view returns (uint256)', 'function reserves(address) view returns (uint256)'];
  const sys = new ethers.Contract(SYSTEM, sysAbi, provider);
  
  const debt = await sys.debts(RSC);
  const reserves = await sys.reserves(RSC);
  console.log('RSC Debt:', ethers.formatEther(debt), 'REACT');
  console.log('RSC Reserves:', ethers.formatEther(reserves), 'REACT');
}

main().catch(console.error);
