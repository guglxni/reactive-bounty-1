import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  
  const SYSTEM_CONTRACT = '0x0000000000000000000000000000000000FFFFFF';
  const ORIGIN_CHAIN_ID = 84532;  // Base Sepolia
  const DESTINATION_CHAIN_ID = 11155111;  // Sepolia
  const NEW_DESTINATION = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';  // Fixed destination
  
  const feeds = [
    { addr: '0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3', decimals: 8, symbol: 'ETH/USD' },
    { addr: '0x961AD289351459A45fC90884eF3AB0278ea95DDE', decimals: 8, symbol: 'BTC/USD' },
    { addr: '0xAc6DB6d5538Cd07f58afee9dA736ce192119017B', decimals: 8, symbol: 'LINK/USD' },
  ];
  
  const aggregators = feeds.map(f => f.addr);
  const decimals = feeds.map(f => f.decimals);
  const symbols = feeds.map(f => f.symbol);
  
  console.log('\n=== Deploying MultiFeedMirrorRCv2 ===');
  console.log('System Contract:', SYSTEM_CONTRACT);
  console.log('Origin Chain:', ORIGIN_CHAIN_ID);
  console.log('Destination Chain:', DESTINATION_CHAIN_ID);
  console.log('Destination:', NEW_DESTINATION);
  console.log('Feeds:', symbols.join(', '));
  
  const MultiFeedMirrorRCv2 = await ethers.getContractFactory('MultiFeedMirrorRCv2');
  const rsc = await MultiFeedMirrorRCv2.deploy(
    SYSTEM_CONTRACT,
    ORIGIN_CHAIN_ID,
    DESTINATION_CHAIN_ID,
    NEW_DESTINATION,
    aggregators,
    decimals,
    symbols,
    { value: ethers.parseEther('1') }  // Fund with 1 REACT
  );
  await rsc.waitForDeployment();
  
  const rscAddr = await rsc.getAddress();
  console.log('\nNew RSC deployed to:', rscAddr);
  
  // Verify configuration
  const destProxy = await rsc.destinationProxy();
  const feedCount = await rsc.getFeedCount();
  const isPaused = await rsc.isPaused();
  
  console.log('\n=== Verification ===');
  console.log('Destination Proxy:', destProxy);
  console.log('Feed Count:', feedCount.toString());
  console.log('Is Paused:', isPaused);
  
  // Check RSC balance
  const balance = await ethers.provider.getBalance(rscAddr);
  console.log('RSC Balance:', ethers.formatEther(balance), 'REACT');
  
  console.log('\n=== IMPORTANT: Update Frontend Config ===');
  console.log(`Update CONFIG.contracts.rsc to: '${rscAddr}'`);
  console.log(`Update CONFIG.contracts.destination to: '${NEW_DESTINATION}'`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
