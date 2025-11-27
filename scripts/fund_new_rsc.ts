import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pk = process.env.PRIVATE_KEY!;
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const wallet = new ethers.Wallet(pk, provider);
  
  const RSC = '0xb51872d10b16C2f5ce3f58007198546Fe0cDE08f';
  const SYSTEM = '0x0000000000000000000000000000000000FFFFFF';
  
  const sysAbi = ['function depositTo(address) payable'];
  const sys = new ethers.Contract(SYSTEM, sysAbi, wallet);
  
  console.log('Funding RSC via depositTo...');
  const tx = await sys.depositTo(RSC, { value: ethers.parseEther('0.5') });
  console.log('TX:', tx.hash);
  await tx.wait();
  console.log('Done!');
  
  // Check reserves
  const sysRead = new ethers.Contract(SYSTEM, ['function reserves(address) view returns (uint256)'], provider);
  const reserves = await sysRead.reserves(RSC);
  console.log('RSC Reserves:', ethers.formatEther(reserves), 'REACT');
}

main().catch(console.error);
