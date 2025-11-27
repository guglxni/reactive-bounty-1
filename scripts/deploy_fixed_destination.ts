import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  
  const CALLBACK_PROXY = '0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA';
  const RVM_ID = deployer.address; // ReactVM ID = deployer address
  
  console.log('\n=== Deploying MultiFeedDestinationV2 ===');
  console.log('Callback Proxy:', CALLBACK_PROXY);
  console.log('RVM ID:', RVM_ID);
  
  const MultiFeedDestinationV2 = await ethers.getContractFactory('MultiFeedDestinationV2');
  const dest = await MultiFeedDestinationV2.deploy(CALLBACK_PROXY, RVM_ID, {
    value: ethers.parseEther('0.05')  // Fund for callbacks
  });
  await dest.waitForDeployment();
  
  const destAddr = await dest.getAddress();
  console.log('\nNew Destination deployed to:', destAddr);
  
  // Register feeds
  console.log('\n=== Registering Feeds ===');
  const feeds = [
    { addr: '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3', name: 'ETH/USD', decimals: 8 },
    { addr: '0x961AD289351459A45fC90884eF3AB0278ea95DDE', name: 'BTC/USD', decimals: 8 },
    { addr: '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B', name: 'LINK/USD', decimals: 8 },
  ];
  
  for (const feed of feeds) {
    console.log(`Registering ${feed.name}...`);
    const tx = await dest.registerFeed(feed.addr, feed.decimals, feed.name);
    await tx.wait();
    console.log(`  ${feed.name} registered!`);
  }
  
  // Fund via callback proxy
  console.log('\n=== Funding via Callback Proxy ===');
  const proxyAbi = ['function depositTo(address) payable'];
  const proxy = new ethers.Contract(CALLBACK_PROXY, proxyAbi, deployer);
  
  const fundTx = await proxy.depositTo(destAddr, { value: ethers.parseEther('0.1') });
  await fundTx.wait();
  console.log('Funded destination with 0.1 ETH');
  
  // Verify setup
  console.log('\n=== Verification ===');
  const owner = await dest.owner();
  const feedCount = await dest.getFeedCount();
  console.log('Owner:', owner);
  console.log('Feed count:', feedCount.toString());
  
  // Check rvm_id is set correctly
  const slot0 = await ethers.provider.getStorage(destAddr, 0);
  const storedRvmId = '0x' + slot0.slice(26);
  console.log('Stored rvm_id:', storedRvmId);
  console.log('Expected rvm_id:', RVM_ID.toLowerCase());
  console.log('RVM ID Match:', storedRvmId.toLowerCase() === RVM_ID.toLowerCase() ? '✓ CORRECT' : '✗ WRONG');
  
  console.log('\n=== IMPORTANT: Update Frontend Config ===');
  console.log(`Update CONFIG.contracts.destination to: '${destAddr}'`);
  
  // Also update the RSC to point to new destination
  console.log('\n=== Update RSC to use new destination ===');
  console.log('Run: npx hardhat run scripts/update_rsc_destination.ts --network reactive');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
