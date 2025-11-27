import { ethers } from 'hardhat';

async function main() {
  const dest = await ethers.getContractAt('MultiFeedDestinationV2', '0x889c32f46E273fBd0d5B1806F3f1286010cD73B3');
  
  const owner = await dest.owner();
  const authRC = await dest.authorizedReactiveContract();
  
  console.log('Owner:', owner);
  console.log('AuthorizedRC:', authRC);
  
  // Check rvm_id - it's in the AbstractCallback so slot 0
  const provider = ethers.provider;
  const slot0 = await provider.getStorage('0x889c32f46E273fBd0d5B1806F3f1286010cD73B3', 0);
  console.log('Slot 0 (rvm_id from AbstractCallback):', slot0);
  
  // Also check the senders mapping - slot 1 is the mapping
  // To check if callback proxy is authorized:
  const CALLBACK_PROXY = '0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA';
  const senderSlot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256'],
    [CALLBACK_PROXY, 1]  // senders mapping is at slot 1
  ));
  const isAuth = await provider.getStorage('0x889c32f46E273fBd0d5B1806F3f1286010cD73B3', senderSlot);
  console.log('Callback Proxy authorized:', isAuth !== '0x0000000000000000000000000000000000000000000000000000000000000000');
}

main().catch(console.error);
