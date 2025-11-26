import { ethers } from "hardhat";

async function main() {
  const DEST_PROXY = process.env.DEST_PROXY;
  const CALLBACK_PROXY_ADDR = "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA";

  if (!DEST_PROXY) {
    console.error("Missing DEST_PROXY in .env");
    return;
  }

  console.log(`Checking Debt for Destination: ${DEST_PROXY}`);
  console.log(`Callback Proxy: ${CALLBACK_PROXY_ADDR}`);

  // ABI for debts mapping
  const abi = ["function debts(address) view returns (uint256)"];
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const callbackProxy = new ethers.Contract(CALLBACK_PROXY_ADDR, abi, provider);

  try {
    const debt = await callbackProxy.debts(DEST_PROXY);
    console.log(`\n💸 Current Debt: ${ethers.formatEther(debt)} ETH`);
    
    if (debt > 0n) {
        console.error("🚨 CRITICAL: Contract has debt! This explains the silent drops.");
    } else {
        console.log("✅ No debt. The contract is in good standing.");
    }
  } catch (e) {
    console.error("Error fetching debt:", e);
  }
}

main().catch(console.error);


