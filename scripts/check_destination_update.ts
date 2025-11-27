import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const OLD_RSC = '0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5';
  
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  
  const rscAbi = [
    'function destinationProxy() view returns (address)'
  ];
  
  const rsc = new ethers.Contract(OLD_RSC, rscAbi, provider);
  
  console.log('Checking RSC destination...');
  const dest = await rsc.destinationProxy();
  console.log(`Current destination: ${dest}`);
  
  if (dest.toLowerCase() === '0x8F12845f8cd649737041f2c9282bdAA94D12d669'.toLowerCase()) {
    console.log('✅ Destination successfully updated to NEW destination!');
  } else {
    console.log('⏳ Still pointing to OLD destination');
  }
}

main().catch(console.error);
