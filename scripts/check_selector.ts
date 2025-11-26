import { ethers } from "ethers";

async function main() {
    const sig = ethers.id("cron()").slice(0, 10);
    console.log(`cron(): ${sig}`);
    
    const sig2 = ethers.id("tick()").slice(0, 10);
    console.log(`tick(): ${sig2}`);

    const sig3 = ethers.id("heartbeat()").slice(0, 10);
    console.log(`heartbeat(): ${sig3}`);
    
    // 0xb90dc8ff analysis
    // Maybe "callback(uint256,...)"?
}

main();


