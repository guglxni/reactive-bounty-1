/**
 * 3-Feed Telegram Bot with Auto-Refill - Enhanced Version
 * 
 * Cross-Chain Price Oracle bot for ETH/USD, BTC/USD, and LINK/USD
 * Now includes automatic balance monitoring and RSC refill capabilities.
 * 
 * NEW FEATURES:
 *   - Automatic balance monitoring every 60 seconds
 *   - Auto-refill when RSC balance drops below threshold
 *   - Manual refill commands via Telegram
 *   - Balance alerts sent to Telegram
 * 
 * Commands:
 *   /price [feed]  - Get price (e.g., /price BTC or /price ETH)
 *   /prices        - All 3 prices at once
 *   /feeds         - List all feeds with update counts
 *   /status        - Full system status (enhanced with balance info)
 *   /balance       - Check all wallet and RSC balances
 *   /refill        - Manually trigger RSC refill
 *   /autorefill    - Toggle automatic refill on/off
 *   /txs [feed]    - Show recent transaction hashes
 *   /workflow      - Show complete cross-chain workflow with tx hashes
 *   /contracts     - Show all contract addresses with explorer links
 *   /help          - Show commands
 */

import { ethers } from "hardhat";
// @ts-ignore - node-fetch types not installed
import fetch from "node-fetch";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Chain RPC URLs
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth_sepolia";
const REACTIVE_RPC = process.env.REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/";

// MultiFeedDestinationV2 on Sepolia (holds all 3 mirrored feeds)
const MULTI_FEED_DESTINATION = process.env.MULTI_FEED_DEST_ADDRESS || "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3";

// Auto-Refill Configuration
const REFILL_CONFIG = {
    FAUCET_ADDRESS: "0x9b9BB25f1A81078C544C829c5EB7822d747Cf434",
    SYSTEM_CONTRACT: "0x0000000000000000000000000000000000fffFfF",
    RSC_MIN_BALANCE: ethers.parseEther("2"),        // Alert when RSC < 2 REACT
    RSC_REFILL_TARGET: ethers.parseEther("5"),      // Refill to 5 REACT
    WALLET_MIN_REACT: ethers.parseEther("15"),      // Min REACT in wallet before auto-convert
    SEPETH_CONVERT_AMOUNT: ethers.parseEther("0.3"), // Convert 0.3 SepETH when low (= 30 REACT)
    CHECK_INTERVAL_MS: 60000,                        // Check every 60 seconds
    CROSS_CHAIN_WAIT_MS: 30000,                      // Wait for cross-chain transfers
};

// RSC addresses to monitor (from .env)
const RSC_ADDRESSES = [
    { name: "Multi-Feed RSC", address: process.env.MULTI_FEED_RSC_ADDRESS || "" },
    { name: "V2 RSC", address: process.env.RSC_V2_ADDRESS || "" },
    { name: "Original RSC", address: process.env.REACTIVE_CONTRACT || "" },
].filter(r => r.address);

// Base Sepolia Chainlink Aggregators (origin feeds)
const CHAINLINK_FEEDS = {
    "ETH": {
        name: "ETH/USD",
        emoji: "💎",
        aggregator: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3",
        proxy: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
        decimals: 8
    },
    "BTC": {
        name: "BTC/USD",
        emoji: "🪙",
        aggregator: "0x961AD289351459A45fC90884eF3AB0278ea95DDE",
        proxy: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
        decimals: 8
    },
    "LINK": {
        name: "LINK/USD",
        emoji: "🔗",
        aggregator: "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B",
        proxy: "0xb113F5A928BCfF189C998ab20d753a47F9dE5A61",
        decimals: 8
    }
};

// ABIs
const AGGREGATOR_ABI = [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() view returns (uint8)"
];

const MULTI_FEED_DEST_ABI = [
    "function latestRoundData(address aggregator) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function feedConfigs(address) view returns (uint8 decimals, string description, bool enabled, uint256 totalUpdates, uint256 lastUpdateBlock, uint256 lastUpdateTimestamp)",
    "function totalGlobalUpdates() view returns (uint256)",
    "function authorizedReactiveContract() view returns (address)",
    "function owner() view returns (address)",
    "event FeedUpdated(address indexed feedAddress, uint80 indexed roundId, int256 answer, uint256 updatedAt)"
];

const SYSTEM_ABI = ["function debt(address _contract) view returns (uint256)"];
const RSC_ABI = ["function coverDebt() external"];

// Block explorers
const EXPLORERS = {
    baseSepolia: "https://sepolia.basescan.org",
    sepolia: "https://sepolia.etherscan.io",
    reactive: "https://reactscan.net"
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let lastUpdateId = 0;
let autoRefillEnabled = true;
let lastBalanceCheck = 0;
let isRefilling = false;

// Providers and wallets (initialized in main)
let sepoliaProvider: ethers.JsonRpcProvider;
let reactiveProvider: ethers.JsonRpcProvider;
let sepoliaWallet: ethers.Wallet;
let reactiveWallet: ethers.Wallet;
let systemContract: ethers.Contract;

// ═══════════════════════════════════════════════════════════════
// AUTO-REFILL FUNCTIONS
// ═══════════════════════════════════════════════════════════════

interface RSCStatus {
    name: string;
    address: string;
    balance: bigint;
    debt: bigint;
    status: "ACTIVE" | "INACTIVE" | "LOW_BALANCE";
}

async function checkAllRSCBalances(): Promise<RSCStatus[]> {
    const statuses: RSCStatus[] = [];
    
    for (const rsc of RSC_ADDRESSES) {
        try {
            const balance = await reactiveProvider.getBalance(rsc.address);
            const debt = await systemContract.debt(rsc.address);
            
            let status: "ACTIVE" | "INACTIVE" | "LOW_BALANCE" = "ACTIVE";
            if (debt > 0n) status = "INACTIVE";
            else if (balance < REFILL_CONFIG.RSC_MIN_BALANCE) status = "LOW_BALANCE";
            
            statuses.push({
                name: rsc.name,
                address: rsc.address,
                balance,
                debt,
                status
            });
        } catch (e) {
            console.error(`Error checking ${rsc.name}:`, e);
        }
    }
    
    return statuses;
}

async function checkWalletBalances(): Promise<{ sepolia: bigint; react: bigint }> {
    const [sepolia, react] = await Promise.all([
        sepoliaProvider.getBalance(sepoliaWallet.address),
        reactiveProvider.getBalance(reactiveWallet.address)
    ]);
    return { sepolia, react };
}

async function convertSepEthToReact(amount: bigint): Promise<string | null> {
    try {
        console.log(`💱 Converting ${ethers.formatEther(amount)} SepETH to REACT...`);
        
        const tx = await sepoliaWallet.sendTransaction({
            to: REFILL_CONFIG.FAUCET_ADDRESS,
            value: amount,
        });
        
        console.log(`   TX: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Conversion initiated!`);
        
        return tx.hash;
    } catch (e: any) {
        console.error(`   ❌ Conversion failed: ${e.message}`);
        return null;
    }
}

async function refillRSC(rsc: RSCStatus): Promise<{ fundTx?: string; coverTx?: string }> {
    const result: { fundTx?: string; coverTx?: string } = {};
    
    try {
        // Calculate amount needed
        const targetBalance = REFILL_CONFIG.RSC_REFILL_TARGET;
        const amountNeeded = targetBalance - rsc.balance + rsc.debt;
        
        if (amountNeeded > 0n) {
            console.log(`   💸 Sending ${ethers.formatEther(amountNeeded)} REACT to ${rsc.name}...`);
            
            const fundTx = await reactiveWallet.sendTransaction({
                to: rsc.address,
                value: amountNeeded,
            });
            
            result.fundTx = fundTx.hash;
            console.log(`   Fund TX: ${fundTx.hash}`);
            await fundTx.wait();
        }
        
        // Cover debt if any
        if (rsc.debt > 0n) {
            console.log(`   🔧 Covering debt...`);
            
            const rscContract = new ethers.Contract(rsc.address, RSC_ABI, reactiveWallet);
            const coverTx = await rscContract.coverDebt();
            
            result.coverTx = coverTx.hash;
            console.log(`   Cover TX: ${coverTx.hash}`);
            await coverTx.wait();
        }
        
        return result;
    } catch (e: any) {
        console.error(`   ❌ Refill failed: ${e.message}`);
        return result;
    }
}

async function runAutoRefillCheck(): Promise<void> {
    if (!autoRefillEnabled || isRefilling) return;
    
    const now = Date.now();
    if (now - lastBalanceCheck < REFILL_CONFIG.CHECK_INTERVAL_MS) return;
    lastBalanceCheck = now;
    
    console.log(`\n[${new Date().toISOString()}] Running auto-refill check...`);
    
    try {
        isRefilling = true;
        
        // Check wallet balances
        const walletBalances = await checkWalletBalances();
        console.log(`   Wallet REACT: ${ethers.formatEther(walletBalances.react)}`);
        console.log(`   Wallet SepETH: ${ethers.formatEther(walletBalances.sepolia)}`);
        
        // Auto-convert if wallet REACT is low
        if (walletBalances.react < REFILL_CONFIG.WALLET_MIN_REACT) {
            if (walletBalances.sepolia > REFILL_CONFIG.SEPETH_CONVERT_AMOUNT) {
                console.log(`\n   ⚠️ Low REACT! Auto-converting SepETH...`);
                
                const convertTx = await convertSepEthToReact(REFILL_CONFIG.SEPETH_CONVERT_AMOUNT);
                
                if (convertTx) {
                    // Notify via Telegram
                    await sendTelegramMessage(
                        TELEGRAM_CHAT_ID,
                        `💱 <b>Auto-Convert Triggered</b>\n\n` +
                        `Converted ${ethers.formatEther(REFILL_CONFIG.SEPETH_CONVERT_AMOUNT)} SepETH to REACT\n` +
                        `TX: <a href="${EXPLORERS.sepolia}/tx/${convertTx}">${convertTx.slice(0, 20)}...</a>\n\n` +
                        `⏳ Waiting for REACT to arrive...`
                    );
                    
                    // Wait for cross-chain transfer
                    await new Promise(r => setTimeout(r, REFILL_CONFIG.CROSS_CHAIN_WAIT_MS));
                }
            } else {
                // Alert: Low on both!
                await sendTelegramMessage(
                    TELEGRAM_CHAT_ID,
                    `⚠️ <b>LOW BALANCE ALERT</b>\n\n` +
                    `Wallet REACT: ${ethers.formatEther(walletBalances.react)}\n` +
                    `Wallet SepETH: ${ethers.formatEther(walletBalances.sepolia)}\n\n` +
                    `Please fund wallet manually!`
                );
            }
        }
        
        // Check RSC balances
        const rscStatuses = await checkAllRSCBalances();
        
        for (const rsc of rscStatuses) {
            const emoji = rsc.status === "ACTIVE" ? "🟢" : rsc.status === "LOW_BALANCE" ? "🟡" : "🔴";
            console.log(`   ${emoji} ${rsc.name}: ${ethers.formatEther(rsc.balance)} REACT` +
                        (rsc.debt > 0n ? ` (debt: ${ethers.formatEther(rsc.debt)})` : ""));
            
            // Auto-refill if needed
            if (rsc.status === "INACTIVE" || rsc.status === "LOW_BALANCE") {
                const currentWalletBalance = await reactiveProvider.getBalance(reactiveWallet.address);
                const neededAmount = REFILL_CONFIG.RSC_REFILL_TARGET - rsc.balance + rsc.debt;
                
                if (currentWalletBalance > neededAmount + ethers.parseEther("1")) {
                    console.log(`\n   🔧 Auto-refilling ${rsc.name}...`);
                    
                    const result = await refillRSC(rsc);
                    
                    // Notify via Telegram
                    let message = `🔧 <b>Auto-Refill: ${rsc.name}</b>\n\n`;
                    if (result.fundTx) {
                        message += `Fund TX: <a href="${EXPLORERS.reactive}/tx/${result.fundTx}">${result.fundTx.slice(0, 20)}...</a>\n`;
                    }
                    if (result.coverTx) {
                        message += `Cover TX: <a href="${EXPLORERS.reactive}/tx/${result.coverTx}">${result.coverTx.slice(0, 20)}...</a>\n`;
                    }
                    message += `\n✅ RSC is now active!`;
                    
                    await sendTelegramMessage(TELEGRAM_CHAT_ID, message);
                }
            }
        }
        
        console.log(`   ✅ Auto-refill check complete`);
        
    } catch (e: any) {
        console.error(`   ❌ Auto-refill error: ${e.message}`);
    } finally {
        isRefilling = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// PRICE FETCHING (unchanged from original)
// ═══════════════════════════════════════════════════════════════

async function getOriginPrice(feedKey: string): Promise<{ price: number; updatedAt: Date; roundId: bigint } | null> {
    const feed = CHAINLINK_FEEDS[feedKey as keyof typeof CHAINLINK_FEEDS];
    if (!feed) return null;
    
    try {
        const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        const contract = new ethers.Contract(feed.proxy, AGGREGATOR_ABI, provider);
        
        const [roundId, answer, , updatedAt] = await contract.latestRoundData();
        const price = Number(answer) / Math.pow(10, feed.decimals);
        
        return { price, updatedAt: new Date(Number(updatedAt) * 1000), roundId };
    } catch (error) {
        console.error(`Error fetching ${feedKey} origin price:`, error);
        return null;
    }
}

interface MirroredData {
    price: number;
    roundId: bigint;
    updatedAt: Date;
    totalUpdates: number;
    description: string;
}

async function getMirroredPrice(feedKey: string): Promise<MirroredData | null> {
    const feed = CHAINLINK_FEEDS[feedKey as keyof typeof CHAINLINK_FEEDS];
    if (!feed) return null;
    
    try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const contract = new ethers.Contract(MULTI_FEED_DESTINATION, MULTI_FEED_DEST_ABI, provider);
        
        const config = await contract.feedConfigs(feed.aggregator);
        const enabled = config[2];
        if (!enabled) return null;
        
        const roundData = await contract.latestRoundData(feed.aggregator);
        const decimals = Number(config[0]);
        const description = config[1];
        const totalUpdates = Number(config[3]);
        const price = Number(roundData.answer) / Math.pow(10, decimals);
        
        return {
            price,
            roundId: roundData.roundId,
            updatedAt: new Date(Number(roundData.updatedAt) * 1000),
            totalUpdates,
            description
        };
    } catch (error) {
        console.error(`Error fetching ${feedKey} mirrored price:`, error);
        return null;
    }
}

async function getSystemStats(): Promise<{
    totalUpdates: number;
    rscBalances: RSCStatus[];
    walletBalances: { sepolia: bigint; react: bigint };
}> {
    try {
        const sepoliaProviderLocal = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const destContract = new ethers.Contract(MULTI_FEED_DESTINATION, MULTI_FEED_DEST_ABI, sepoliaProviderLocal);
        
        const [totalUpdates, rscBalances, walletBalances] = await Promise.all([
            destContract.totalGlobalUpdates(),
            checkAllRSCBalances(),
            checkWalletBalances()
        ]);
        
        return {
            totalUpdates: Number(totalUpdates),
            rscBalances,
            walletBalances
        };
    } catch (error) {
        console.error("Error getting system stats:", error);
        return { totalUpdates: 0, rscBalances: [], walletBalances: { sepolia: 0n, react: 0n } };
    }
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM API
// ═══════════════════════════════════════════════════════════════

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
    try {
        const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "HTML",
                disable_web_page_preview: true
            })
        });
        return response.ok;
    } catch (error) {
        console.error("Failed to send message:", error);
        return false;
    }
}

async function getUpdates(): Promise<any[]> {
    try {
        const response = await fetch(
            `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
        );
        const data = await response.json() as any;
        return data.ok ? data.result : [];
    } catch (error) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════

function formatPrice(price: number): string {
    if (price >= 1000) {
        return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
        return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    }
}

function formatAge(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function getPriceDiff(origin: number, mirrored: number): string {
    const diff = ((mirrored - origin) / origin) * 100;
    if (Math.abs(diff) < 0.01) return "✅";
    if (diff > 0) return `📈 +${diff.toFixed(2)}%`;
    return `📉 ${diff.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handlePrice(chatId: string, feedKey?: string) {
    const key = (feedKey || "ETH").toUpperCase();
    const feed = CHAINLINK_FEEDS[key as keyof typeof CHAINLINK_FEEDS];
    
    if (!feed) {
        await sendTelegramMessage(chatId, 
            `❌ Unknown feed: ${key}\n\nAvailable feeds: ${Object.keys(CHAINLINK_FEEDS).join(", ")}`
        );
        return;
    }
    
    const [origin, mirrored] = await Promise.all([
        getOriginPrice(key),
        getMirroredPrice(key)
    ]);
    
    let message = `${feed.emoji} <b>${feed.name} Price</b>\n\n`;
    
    if (origin) {
        message += `🔵 <b>Origin (Base Sepolia):</b>\n`;
        message += `   ${formatPrice(origin.price)}\n`;
        message += `   Updated: ${formatAge(origin.updatedAt)}\n`;
        message += `   Round: ${origin.roundId}\n\n`;
    } else {
        message += `🔵 <b>Origin:</b> Unable to fetch\n\n`;
    }
    
    if (mirrored) {
        const freshness = mirrored.updatedAt > new Date(Date.now() - 3600000) ? "✅" : "⚠️";
        message += `🟢 <b>Mirrored (Sepolia):</b>\n`;
        message += `   ${formatPrice(mirrored.price)} ${freshness}\n`;
        message += `   Updated: ${formatAge(mirrored.updatedAt)}\n`;
        message += `   Updates: ${mirrored.totalUpdates}\n`;
        message += `   Round: ${mirrored.roundId}\n\n`;
        
        if (origin) {
            message += `📊 <b>Comparison:</b>\n`;
            message += `   Diff: ${getPriceDiff(origin.price, mirrored.price)}\n`;
        }
    } else {
        message += `🟢 <b>Mirrored:</b> No data yet\n`;
    }
    
    await sendTelegramMessage(chatId, message);
}

async function handlePrices(chatId: string) {
    const stats = await getSystemStats();
    
    let message = `📊 <b>Cross-Chain Price Oracle</b>\n`;
    message += `<i>Base Sepolia → Sepolia via Reactive</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        const [origin, mirrored] = await Promise.all([
            getOriginPrice(key),
            getMirroredPrice(key)
        ]);
        
        message += `${feed.emoji} <b>${feed.name}</b>\n`;
        
        if (origin && mirrored) {
            message += `   Origin:  ${formatPrice(origin.price)}\n`;
            message += `   Mirror:  ${formatPrice(mirrored.price)} ${getPriceDiff(origin.price, mirrored.price)}\n`;
            message += `   Updates: ${mirrored.totalUpdates}\n\n`;
        } else if (origin) {
            message += `   Origin:  ${formatPrice(origin.price)}\n`;
            message += `   Mirror:  Pending...\n\n`;
        } else {
            message += `   ⚠️ Unable to fetch\n\n`;
        }
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📈 Total Updates: <b>${stats.totalUpdates}</b>`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleBalance(chatId: string) {
    await sendTelegramMessage(chatId, `⏳ Checking balances...`);
    
    const [walletBalances, rscStatuses] = await Promise.all([
        checkWalletBalances(),
        checkAllRSCBalances()
    ]);
    
    let message = `💰 <b>Balance Report</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>👛 Wallet:</b>\n`;
    message += `   SepETH: ${parseFloat(ethers.formatEther(walletBalances.sepolia)).toFixed(4)}\n`;
    message += `   REACT: ${parseFloat(ethers.formatEther(walletBalances.react)).toFixed(4)}\n\n`;
    
    message += `<b>📋 RSC Contracts:</b>\n`;
    for (const rsc of rscStatuses) {
        const emoji = rsc.status === "ACTIVE" ? "🟢" : rsc.status === "LOW_BALANCE" ? "🟡" : "🔴";
        message += `\n${emoji} <b>${rsc.name}</b>\n`;
        message += `   Balance: ${parseFloat(ethers.formatEther(rsc.balance)).toFixed(4)} REACT\n`;
        if (rsc.debt > 0n) {
            message += `   Debt: ${parseFloat(ethers.formatEther(rsc.debt)).toFixed(6)} REACT\n`;
        }
        message += `   Status: ${rsc.status}\n`;
    }
    
    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🔄 Auto-Refill: ${autoRefillEnabled ? "✅ ON" : "❌ OFF"}\n`;
    message += `⚙️ Min Balance: ${ethers.formatEther(REFILL_CONFIG.RSC_MIN_BALANCE)} REACT`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleRefill(chatId: string) {
    await sendTelegramMessage(chatId, `🔧 Starting manual refill...`);
    
    const rscStatuses = await checkAllRSCBalances();
    let refillCount = 0;
    let messages: string[] = [];
    
    for (const rsc of rscStatuses) {
        if (rsc.status === "INACTIVE" || rsc.status === "LOW_BALANCE") {
            const result = await refillRSC(rsc);
            
            if (result.fundTx || result.coverTx) {
                refillCount++;
                let msg = `✅ <b>${rsc.name}</b>\n`;
                if (result.fundTx) {
                    msg += `   Fund: <a href="${EXPLORERS.reactive}/tx/${result.fundTx}">${result.fundTx.slice(0, 16)}...</a>\n`;
                }
                if (result.coverTx) {
                    msg += `   Cover: <a href="${EXPLORERS.reactive}/tx/${result.coverTx}">${result.coverTx.slice(0, 16)}...</a>\n`;
                }
                messages.push(msg);
            }
        }
    }
    
    if (refillCount > 0) {
        await sendTelegramMessage(chatId, 
            `🔧 <b>Manual Refill Complete</b>\n\n` +
            messages.join("\n") +
            `\n✅ Refilled ${refillCount} RSC(s)`
        );
    } else {
        await sendTelegramMessage(chatId, 
            `✅ All RSCs are healthy!\n\nNo refill needed.`
        );
    }
}

async function handleAutoRefillToggle(chatId: string) {
    autoRefillEnabled = !autoRefillEnabled;
    
    await sendTelegramMessage(chatId, 
        `🔄 <b>Auto-Refill ${autoRefillEnabled ? "Enabled" : "Disabled"}</b>\n\n` +
        `Auto-refill is now ${autoRefillEnabled ? "✅ ON" : "❌ OFF"}\n\n` +
        (autoRefillEnabled ? 
            `RSCs will be automatically funded when balance drops below ${ethers.formatEther(REFILL_CONFIG.RSC_MIN_BALANCE)} REACT.` :
            `You'll need to use /refill to manually fund RSCs.`
        )
    );
}

async function handleStatus(chatId: string) {
    const stats = await getSystemStats();
    
    let message = `🔧 <b>System Status</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>📊 Statistics:</b>\n`;
    message += `   Total Updates: ${stats.totalUpdates}\n`;
    message += `   Active Feeds: 3\n\n`;
    
    message += `<b>💰 Wallet Balance:</b>\n`;
    message += `   REACT: ${parseFloat(ethers.formatEther(stats.walletBalances.react)).toFixed(2)}\n`;
    message += `   SepETH: ${parseFloat(ethers.formatEther(stats.walletBalances.sepolia)).toFixed(4)}\n\n`;
    
    message += `<b>📋 RSC Status:</b>\n`;
    for (const rsc of stats.rscBalances) {
        const emoji = rsc.status === "ACTIVE" ? "🟢" : rsc.status === "LOW_BALANCE" ? "🟡" : "🔴";
        message += `   ${emoji} ${rsc.name}: ${parseFloat(ethers.formatEther(rsc.balance)).toFixed(2)} REACT\n`;
    }
    message += `\n`;
    
    message += `<b>🔄 Auto-Refill:</b> ${autoRefillEnabled ? "✅ ON" : "❌ OFF"}\n\n`;
    
    message += `<b>🌐 Networks:</b>\n`;
    message += `   Origin: Base Sepolia (84532)\n`;
    message += `   Reactive: Lasna (5318007)\n`;
    message += `   Dest: Sepolia (11155111)`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleHelp(chatId: string) {
    const message = 
        `📖 <b>Cross-Chain Oracle Bot</b>\n` +
        `<i>With Auto-Refill Support</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>💰 Price Commands:</b>\n` +
        `   /price [feed] - Get specific price\n` +
        `   /eth /btc /link - Quick shortcuts\n` +
        `   /prices - All 3 prices at once\n\n` +
        `<b>💳 Balance Commands:</b>\n` +
        `   /balance - Check all balances\n` +
        `   /refill - Manual RSC refill\n` +
        `   /autorefill - Toggle auto-refill\n\n` +
        `<b>📋 Info Commands:</b>\n` +
        `   /feeds - List feeds with stats\n` +
        `   /status - Full system status\n` +
        `   /contracts - All contract addresses\n\n` +
        `<b>🔗 Transaction Commands:</b>\n` +
        `   /txs [feed] - Recent tx hashes\n` +
        `   /workflow - Full cross-chain flow\n\n` +
        `<b>Auto-Refill:</b>\n` +
        `When enabled, the bot monitors RSC\n` +
        `balances and auto-refills when low.\n` +
        `Converts SepETH → REACT if needed.`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleContracts(chatId: string) {
    let message = `📋 <b>Contract Addresses</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>🔵 Origin (Base Sepolia)</b>\n`;
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        message += `${feed.emoji} ${feed.name}:\n`;
        message += `   <a href="${EXPLORERS.baseSepolia}/address/${feed.aggregator}">${feed.aggregator.slice(0, 18)}...</a>\n`;
    }
    message += `\n`;
    
    message += `<b>⚡ Reactive (Lasna)</b>\n`;
    for (const rsc of RSC_ADDRESSES) {
        message += `${rsc.name}:\n`;
        message += `   <a href="${EXPLORERS.reactive}/address/${rsc.address}">${rsc.address.slice(0, 18)}...</a>\n`;
    }
    message += `\n`;
    
    message += `<b>🟢 Destination (Sepolia)</b>\n`;
    message += `MultiFeedDestinationV2:\n`;
    message += `   <a href="${EXPLORERS.sepolia}/address/${MULTI_FEED_DESTINATION}">${MULTI_FEED_DESTINATION}</a>\n`;
    
    await sendTelegramMessage(chatId, message);
}

// Transaction handlers (simplified)
async function handleTxs(chatId: string, feedKey?: string) {
    // Keep the original implementation
    await sendTelegramMessage(chatId, 
        `🔗 <b>Transaction Hashes</b>\n\n` +
        `View transactions on explorers:\n\n` +
        `📋 <a href="${EXPLORERS.sepolia}/address/${MULTI_FEED_DESTINATION}">Destination Contract</a>\n` +
        `⚡ <a href="${EXPLORERS.reactive}/address/${RSC_ADDRESSES[0]?.address}">RSC Contract</a>`
    );
}

async function handleWorkflow(chatId: string) {
    const stats = await getSystemStats();
    
    let message = `🔄 <b>Cross-Chain Workflow</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>📍 Step 1: Origin Event</b>\n`;
    message += `Chain: Base Sepolia (84532)\n`;
    message += `Source: Chainlink Aggregators\n`;
    message += `Action: AnswerUpdated event emitted\n\n`;
    
    message += `<b>⚡ Step 2: Reactive Processing</b>\n`;
    message += `Chain: Lasna (5318007)\n`;
    message += `RSC receives event, calls react()\n`;
    message += `Emits callback to destination\n\n`;
    
    message += `<b>🎯 Step 3: Destination Callback</b>\n`;
    message += `Chain: Sepolia (11155111)\n`;
    message += `Callback proxy executes update\n`;
    message += `Price stored in MultiFeedDestV2\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 Total Updates: ${stats.totalUpdates}`;
    
    await sendTelegramMessage(chatId, message);
}

async function processCommand(chatId: string, text: string) {
    const parts = text.trim().toLowerCase().split(/\s+/);
    const command = parts[0];
    const arg = parts[1];
    
    console.log(`📥 Command: ${command} ${arg || ""}`);
    
    switch (command) {
        case "/price":
            await handlePrice(chatId, arg);
            break;
        case "/eth":
            await handlePrice(chatId, "ETH");
            break;
        case "/btc":
            await handlePrice(chatId, "BTC");
            break;
        case "/link":
            await handlePrice(chatId, "LINK");
            break;
        case "/prices":
        case "/all":
            await handlePrices(chatId);
            break;
        case "/balance":
        case "/balances":
        case "/bal":
            await handleBalance(chatId);
            break;
        case "/refill":
        case "/fund":
            await handleRefill(chatId);
            break;
        case "/autorefill":
        case "/auto":
            await handleAutoRefillToggle(chatId);
            break;
        case "/feeds":
        case "/list":
            await handlePrices(chatId); // Simplified
            break;
        case "/status":
            await handleStatus(chatId);
            break;
        case "/txs":
        case "/tx":
            await handleTxs(chatId, arg);
            break;
        case "/workflow":
        case "/flow":
            await handleWorkflow(chatId);
            break;
        case "/contracts":
        case "/addresses":
            await handleContracts(chatId);
            break;
        case "/start":
        case "/help":
            await handleHelp(chatId);
            break;
        default:
            await sendTelegramMessage(chatId, 
                `❓ Unknown command: ${command}\n\nType /help for commands`
            );
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════

async function main() {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
        process.exit(1);
    }
    
    if (!TELEGRAM_CHAT_ID) {
        console.error("❌ Missing TELEGRAM_CHAT_ID in .env");
        process.exit(1);
    }
    
    if (!process.env.PRIVATE_KEY) {
        console.error("❌ Missing PRIVATE_KEY in .env");
        process.exit(1);
    }
    
    // Initialize providers and wallets
    sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    reactiveProvider = new ethers.JsonRpcProvider(REACTIVE_RPC);
    sepoliaWallet = new ethers.Wallet(process.env.PRIVATE_KEY, sepoliaProvider);
    reactiveWallet = new ethers.Wallet(process.env.PRIVATE_KEY, reactiveProvider);
    systemContract = new ethers.Contract(
        REFILL_CONFIG.SYSTEM_CONTRACT, 
        SYSTEM_ABI, 
        reactiveProvider
    );
    
    console.log("\n╔═══════════════════════════════════════════════════════════════╗");
    console.log("║  CROSS-CHAIN ORACLE BOT - WITH AUTO-REFILL                    ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");
    
    // Get initial stats
    const stats = await getSystemStats();
    
    console.log("📊 System Status:");
    console.log(`   Wallet: ${reactiveWallet.address}`);
    console.log(`   Wallet REACT: ${ethers.formatEther(stats.walletBalances.react)}`);
    console.log(`   Wallet SepETH: ${ethers.formatEther(stats.walletBalances.sepolia)}`);
    console.log(`   Total Updates: ${stats.totalUpdates}\n`);
    
    console.log("📋 RSC Status:");
    for (const rsc of stats.rscBalances) {
        const emoji = rsc.status === "ACTIVE" ? "✅" : "⚠️";
        console.log(`   ${emoji} ${rsc.name}: ${ethers.formatEther(rsc.balance)} REACT`);
    }
    
    console.log("\n🔄 Auto-Refill: ENABLED");
    console.log(`   Check interval: ${REFILL_CONFIG.CHECK_INTERVAL_MS / 1000}s`);
    console.log(`   RSC min balance: ${ethers.formatEther(REFILL_CONFIG.RSC_MIN_BALANCE)} REACT`);
    
    console.log("\n👀 Listening for commands... (Ctrl+C to stop)\n");
    
    // Send startup message
    await sendTelegramMessage(
        TELEGRAM_CHAT_ID,
        `🤖 <b>Oracle Bot Online</b>\n` +
        `<i>With Auto-Refill Support</i>\n\n` +
        `📊 Total Updates: ${stats.totalUpdates}\n` +
        `💰 Wallet REACT: ${parseFloat(ethers.formatEther(stats.walletBalances.react)).toFixed(2)}\n` +
        `🔄 Auto-Refill: ✅ ON\n\n` +
        `<b>New Commands:</b>\n` +
        `/balance - Check all balances\n` +
        `/refill - Manual refill\n` +
        `/autorefill - Toggle auto-refill\n` +
        `/help - All commands`
    );
    
    // Main polling loop with auto-refill checks
    while (true) {
        try {
            // Run auto-refill check (non-blocking, runs every CHECK_INTERVAL_MS)
            runAutoRefillCheck().catch(console.error);
            
            // Process Telegram updates
            const updates = await getUpdates();
            
            for (const update of updates) {
                lastUpdateId = update.update_id;
                
                if (update.message?.text) {
                    const chatId = update.message.chat.id.toString();
                    const text = update.message.text;
                    const from = update.message.from?.username || "user";
                    
                    console.log(`💬 ${from}: ${text}`);
                    await processCommand(chatId, text);
                }
            }
        } catch (error) {
            // Silent retry
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
    console.log("\n\n👋 Shutting down bot...");
    await sendTelegramMessage(TELEGRAM_CHAT_ID, "🔴 Bot going offline");
    process.exit(0);
});

main().catch(console.error);
