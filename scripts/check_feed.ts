import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const feedAddress = process.env.ORIGIN_FEED;

  console.log(`Checking feed at: ${feedAddress}`);

  const abi = [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function description() view returns (string)",
    "function aggregator() view returns (address)"
  ];

  const feed = new ethers.Contract(feedAddress!, abi, provider);

  try {
    const desc = await feed.description();
    console.log(`Description: ${desc}`);

    const data = await feed.latestRoundData();
    console.log(`Latest Round: ${data.roundId}`);
    console.log(`Answer: ${data.answer}`);
    console.log(`UpdatedAt: ${data.updatedAt} (${new Date(Number(data.updatedAt) * 1000).toLocaleString()})`);
    
    const now = Math.floor(Date.now() / 1000);
    const diff = now - Number(data.updatedAt);
    console.log(`Time since last update: ${diff} seconds (${(diff/3600).toFixed(2)} hours)`);

    try {
        const agg = await feed.aggregator();
        console.log(`Underlying Aggregator: ${agg}`);
    } catch (e) {
        console.log("Could not fetch underlying aggregator (might not be a proxy)");
    }

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


