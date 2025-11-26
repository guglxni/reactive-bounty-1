import { ethers } from "hardhat";

async function main() {
  const RC_ADDRESS = process.env.REACTIVE_CONTRACT;
  if (!RC_ADDRESS) {
      console.error("REACTIVE_CONTRACT not set in .env");
      process.exit(1);
  }

  console.log(`Checking debt for RC: ${RC_ADDRESS}`);
  const provider = new ethers.JsonRpcProvider(process.env.REACTIVE_RPC_URL);
  
  const SYSTEM_ADDR = "0x0000000000000000000000000000000000fffFfF";
  
  const ipayableAbi = [
    "function debt(address _contract) view returns (uint256)"
  ];
  
  const system = new ethers.Contract(SYSTEM_ADDR, ipayableAbi, provider);
  
  const debt = await system.debt(RC_ADDRESS);
  console.log(`RC Debt: ${ethers.formatEther(debt)} REACT`);
  
  if (debt > 0n) {
      console.log("\n⚠️ WARNING: RC has outstanding debt!");
      console.log("This will prevent new reactions from executing.");
      console.log("Action: Fund the RC and call coverDebt()");
  } else {
      console.log("✅ Debt is zero. Funding is not the issue.");
  }
  
  // Also check balance
  const balance = await provider.getBalance(RC_ADDRESS);
  console.log(`RC Balance: ${ethers.formatEther(balance)} REACT`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


