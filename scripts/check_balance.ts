import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log(`Address: ${signer.address}`);
  console.log(`Balance on ${network.name}: ${ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

