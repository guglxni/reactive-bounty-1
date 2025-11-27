import { ethers } from 'hardhat';

async function main() {
  const dest = await ethers.getContractAt('MultiFeedDestinationV2', '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3');
  
  const owner = await dest.owner();
  console.log('Contract Owner (Deployer):', owner);
  console.log('This should be the RVM ID that Reactive Network sends');
  
  // Current state
  const provider = ethers.provider;
  const slot0 = await provider.getStorage('0x889c32f46E273fBd0d5B1806F3f1286010cD73B3', 0);
  const storedRvmId = '0x' + slot0.slice(26);  // Last 20 bytes
  console.log('\nCurrently stored rvm_id:', storedRvmId);
  
  console.log('\n--- THE PROBLEM ---');
  console.log('rvm_id stored:', storedRvmId.toLowerCase());
  console.log('ReactVM sends:', owner.toLowerCase());
  console.log('Match:', storedRvmId.toLowerCase() === owner.toLowerCase() ? 'YES ✓' : 'NO ✗ (callbacks fail!)');
  
  // We need to update rvm_id to match the deployer
  // Check if there's a function to update it
  console.log('\nFix needed: Call setAuthorizedReactiveContract with deployer address');
  console.log('Or: Update rvm_id storage directly');
}

main().catch(console.error);
