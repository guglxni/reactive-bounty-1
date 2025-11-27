import { ethers } from 'hardhat';

async function main() {
  const DEST = '0x8F12845f8cd649737041f2c9282bdAA94D12d669';  // New destination
  
  console.log('Checking storage slots for new destination:');
  for (let i = 0; i < 5; i++) {
    const slot = await ethers.provider.getStorage(DEST, i);
    console.log(`Slot ${i}:`, slot);
    if (slot.length >= 42) {
      const addr = '0x' + slot.slice(-40);
      console.log(`  -> Address: ${addr}`);
    }
  }
  
  // Direct check
  const dest = await ethers.getContractAt('MultiFeedDestinationV2', DEST);
  const owner = await dest.owner();
  console.log('\nContract owner:', owner);
}

main().catch(console.error);
