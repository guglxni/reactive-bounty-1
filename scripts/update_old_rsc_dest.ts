import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const OLD_RSC = '0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5';
  const NEW_DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';
  
  const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
  const pk = process.env.PRIVATE_KEY!;
  const wallet = new ethers.Wallet(pk, provider);
  
  const rscAbi = [
    'function setDestinationProxy(address _newDestination) external',
    'function destinationProxy() view returns (address)',
    'function owner() view returns (address)'
  ];
  
  const rsc = new ethers.Contract(OLD_RSC, rscAbi, wallet);
  
  console.log('=== Checking OLD RSC ===');
  console.log(`Owner: ${await rsc.owner()}`);
  console.log(`Current destination: ${await rsc.destinationProxy()}`);
  
  // Check if we're owner
  const myAddr = await wallet.getAddress();
  console.log(`My address: ${myAddr}`);
  
  console.log('\nUpdating destination to:', NEW_DEST);
  const tx = await rsc.setDestinationProxy(NEW_DEST, { gasLimit: 100000 });
  console.log(`TX: ${tx.hash}`);
  await tx.wait();
  
  console.log('Destination updated!');
  console.log(`New destination: ${await rsc.destinationProxy()}`);
}

main().catch(console.error);
