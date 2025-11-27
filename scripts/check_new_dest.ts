import { ethers } from 'hardhat';

async function main() {
  const NEW_DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';
  
  const dest = await ethers.getContractAt('MultiFeedDestinationV2', NEW_DEST);
  
  const count = await dest.getFeedCount();
  console.log('Feed count:', count.toString());
  
  const feeds = await dest.getRegisteredFeeds();
  console.log('Registered feeds:', feeds);
  
  const total = await dest.totalGlobalUpdates();
  console.log('Total updates:', total.toString());
  
  // Check if callbacks are authorized
  console.log('\n--- Authorization Check ---');
  
  // Check rvm_id (slot 2)
  const slot2 = await ethers.provider.getStorage(NEW_DEST, 2);
  const rvmId = '0x' + slot2.slice(-40);
  console.log('Stored rvm_id:', rvmId);
  
  // Check authorizedSender (callback proxy)
  const CALLBACK_PROXY = '0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA';
  const senderSlot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256'],
    [CALLBACK_PROXY, 1]
  ));
  const isAuth = await ethers.provider.getStorage(NEW_DEST, senderSlot);
  console.log('Callback proxy authorized:', isAuth !== '0x0000000000000000000000000000000000000000000000000000000000000000');
  
  // Check debt/reserves
  const proxyAbi = ['function debts(address) view returns (uint256)', 'function reserves(address) view returns (uint256)'];
  const proxy = new ethers.Contract(CALLBACK_PROXY, proxyAbi, ethers.provider);
  const debt = await proxy.debts(NEW_DEST);
  const reserves = await proxy.reserves(NEW_DEST);
  console.log('\nDebt:', ethers.formatEther(debt), 'ETH');
  console.log('Reserves:', ethers.formatEther(reserves), 'ETH');
}

main().catch(console.error);
