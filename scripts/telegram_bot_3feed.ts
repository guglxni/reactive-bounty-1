/**
 * 3-Feed Telegram Bot - Bounty Enhanced Version
 * 
 * Cross-Chain Price Oracle bot for ETH/USD, BTC/USD, and LINK/USD
 * Mirrors prices from Base Sepolia to Sepolia via Reactive Network.
 * 
 * Commands:
 *   /price [feed]  - Get price (e.g., /price BTC or /price ETH)
 *   /prices        - All 3 prices at once
 *   /feeds         - List all feeds with update counts
 *   /status        - Full system status
 *   /txs [feed]    - Show recent transaction hashes (BOUNTY REQUIREMENT)
 *   /workflow      - Show complete cross-chain workflow with tx hashes
 *   /contracts     - Show all contract addresses with explorer links
 *   /help          - Show commands
 * 
 * BOUNTY COMPLIANCE:
 * "The application MUST include the transaction hashes for every step of the workflow,
 *  for Origin transactions, Reactive transactions, and Destination transactions."
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
const REACTIVE_RPC = "https://lasna-rpc.rnk.dev/";

// MultiFeedDestinationV2 on Sepolia (holds all 3 mirrored feeds)
const MULTI_FEED_DESTINATION = "0x889c32f46E273fBd0d5B1806F3f1286010cD73B3";

// RSC addresses
const NEW_RSC = "0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB";  // 3 feeds (ETH, BTC, LINK)

// Base Sepolia Chainlink Aggregators (origin feeds)
// 3 volatile crypto feeds that update every ~15 minutes
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

// ABIs - CORRECT ABI matching MultiFeedDestinationV2.sol
const AGGREGATOR_ABI = [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() view returns (uint8)"
];

// FeedConfig struct: { decimals, description, enabled, totalUpdates, lastUpdateBlock, lastUpdateTimestamp }
const MULTI_FEED_DEST_ABI = [
    "function latestRoundData(address aggregator) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function feedConfigs(address) view returns (uint8 decimals, string description, bool enabled, uint256 totalUpdates, uint256 lastUpdateBlock, uint256 lastUpdateTimestamp)",
    "function totalGlobalUpdates() view returns (uint256)",
    "function authorizedReactiveContract() view returns (address)",
    "function owner() view returns (address)",
    "function registeredFeeds(uint256) view returns (address)",
    "function getRegisteredFeedCount() view returns (uint256)",
    "event FeedUpdated(address indexed feedAddress, uint80 indexed roundId, int256 answer, uint256 updatedAt)",
    "event CallbackReceived(address indexed sender, address indexed feedAddress, uint80 roundId, int256 answer)"
];

// Callback Proxy on Sepolia (receives callbacks from Reactive)
const CALLBACK_PROXY = "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA";

// Block explorers
const EXPLORERS = {
    baseSepolia: "https://sepolia.basescan.org",
    sepolia: "https://sepolia.etherscan.io",
    reactive: "https://reactscan.net"
};

let lastUpdateId = 0;

// ═══════════════════════════════════════════════════════════════
// PRICE FETCHING
// ═══════════════════════════════════════════════════════════════

async function getOriginPrice(feedKey: string): Promise<{ price: number; updatedAt: Date; roundId: bigint } | null> {
    const feed = CHAINLINK_FEEDS[feedKey as keyof typeof CHAINLINK_FEEDS];
    if (!feed) return null;
    
    try {
        const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        const contract = new ethers.Contract(feed.proxy, AGGREGATOR_ABI, provider);
        
        const [roundId, answer, , updatedAt] = await contract.latestRoundData();
        const price = Number(answer) / Math.pow(10, feed.decimals);
        
        return {
            price,
            updatedAt: new Date(Number(updatedAt) * 1000),
            roundId
        };
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
        
        // First check if feed is registered
        const config = await contract.feedConfigs(feed.aggregator);
        
        // Config tuple: [decimals, description, enabled, totalUpdates, lastUpdateBlock, lastUpdateTimestamp]
        const enabled = config[2];  // enabled is at index 2
        if (!enabled) {
            console.log(`Feed ${feedKey} not enabled`);
            return null;
        }
        
        // Get round data
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
    rscBalance: string;
}> {
    try {
        const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const reactiveProvider = new ethers.JsonRpcProvider(REACTIVE_RPC);
        
        const destContract = new ethers.Contract(MULTI_FEED_DESTINATION, MULTI_FEED_DEST_ABI, sepoliaProvider);
        
        const [totalUpdates, rscBalance] = await Promise.all([
            destContract.totalGlobalUpdates(),
            reactiveProvider.getBalance(NEW_RSC)
        ]);
        
        return {
            totalUpdates: Number(totalUpdates),
            rscBalance: ethers.formatEther(rscBalance)
        };
    } catch (error) {
        console.error("Error getting system stats:", error);
        return { totalUpdates: 0, rscBalance: "?" };
    }
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION HASH FETCHING (BOUNTY REQUIREMENT)
// ═══════════════════════════════════════════════════════════════

interface TxInfo {
    hash: string;
    blockNumber: number;
    timestamp: number;
    chain: string;
}

interface WorkflowTxs {
    origin?: TxInfo;
    reactive?: TxInfo;
    destination?: TxInfo;
    feedKey: string;
    roundId: bigint;
    price: number;
}

// Get recent destination transactions (FeedUpdated events)
async function getDestinationTxs(feedKey?: string, limit: number = 5): Promise<TxInfo[]> {
    try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const contract = new ethers.Contract(MULTI_FEED_DESTINATION, MULTI_FEED_DEST_ABI, provider);
        
        const currentBlock = await provider.getBlockNumber();
        const txs: TxInfo[] = [];
        
        // Use small block ranges to work with free RPC tier (10 block limit)
        // Search in chunks of 10 blocks, going backwards
        for (let i = 0; i < 50 && txs.length < limit; i++) {
            const toBlock = currentBlock - (i * 10);
            const fromBlock = Math.max(0, toBlock - 9);
            
            if (fromBlock <= 0) break;
            
            try {
                // Build filter
                let filter;
                if (feedKey) {
                    const feed = CHAINLINK_FEEDS[feedKey as keyof typeof CHAINLINK_FEEDS];
                    if (feed) {
                        filter = contract.filters.FeedUpdated(feed.aggregator);
                    } else {
                        filter = contract.filters.FeedUpdated();
                    }
                } else {
                    filter = contract.filters.FeedUpdated();
                }
                
                const events = await contract.queryFilter(filter, fromBlock, toBlock);
                
                // Get unique transactions (dedupe by hash)
                const seenHashes = new Set(txs.map(t => t.hash));
                for (const event of events.reverse()) {
                    if (seenHashes.has(event.transactionHash)) continue;
                    seenHashes.add(event.transactionHash);
                    
                    const block = await provider.getBlock(event.blockNumber);
                    txs.push({
                        hash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        timestamp: block?.timestamp || 0,
                        chain: "sepolia"
                    });
                    
                    if (txs.length >= limit) break;
                }
            } catch (e) {
                // Skip this chunk if it fails
            }
        }
        
        return txs;
    } catch (error) {
        console.error("Error fetching destination txs:", error);
        return [];
    }
}

// Get recent origin transactions (AnswerUpdated events from Chainlink)
async function getOriginTxs(feedKey: string, limit: number = 5): Promise<TxInfo[]> {
    try {
        const feed = CHAINLINK_FEEDS[feedKey as keyof typeof CHAINLINK_FEEDS];
        if (!feed) return [];
        
        const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        
        const aggregatorAbi = [
            "event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)"
        ];
        const contract = new ethers.Contract(feed.aggregator, aggregatorAbi, provider);
        
        const currentBlock = await provider.getBlockNumber();
        const txs: TxInfo[] = [];
        
        // Use smaller block ranges (Base Sepolia RPCs may have limits too)
        for (let i = 0; i < 100 && txs.length < limit; i++) {
            const toBlock = currentBlock - (i * 50);
            const fromBlock = Math.max(0, toBlock - 49);
            
            if (fromBlock <= 0) break;
            
            try {
                const events = await contract.queryFilter(contract.filters.AnswerUpdated(), fromBlock, toBlock);
                
                const seenHashes = new Set(txs.map(t => t.hash));
                for (const event of events.reverse()) {
                    if (seenHashes.has(event.transactionHash)) continue;
                    seenHashes.add(event.transactionHash);
                    
                    const block = await provider.getBlock(event.blockNumber);
                    txs.push({
                        hash: event.transactionHash,
                        blockNumber: event.blockNumber,
                        timestamp: block?.timestamp || 0,
                        chain: "baseSepolia"
                    });
                    
                    if (txs.length >= limit) break;
                }
            } catch (e) {
                // Skip this chunk if it fails
            }
        }
        
        return txs;
    } catch (error) {
        console.error("Error fetching origin txs:", error);
        return [];
    }
}

// Get RSC transactions from Reactive network (event replays)
async function getReactiveTxs(limit: number = 5): Promise<TxInfo[]> {
    try {
        // Query AnswerUpdated event replays on Reactive network
        // Topic: 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f
        const ANSWER_UPDATED_TOPIC = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";
        
        const response = await fetch(REACTIVE_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_getLogs",
                params: [{
                    fromBlock: "0x000001",
                    toBlock: "latest",
                    topics: [ANSWER_UPDATED_TOPIC]
                }],
                id: 1
            })
        });
        
        const data = await response.json() as any;
        if (!data.result) return [];
        
        // Get unique transaction hashes
        const seenHashes = new Set<string>();
        const txs: TxInfo[] = [];
        
        for (const log of data.result.reverse()) {
            if (seenHashes.has(log.transactionHash)) continue;
            seenHashes.add(log.transactionHash);
            
            txs.push({
                hash: log.transactionHash,
                blockNumber: parseInt(log.blockNumber, 16),
                timestamp: log.blockTimestamp ? parseInt(log.blockTimestamp, 16) : 0,
                chain: "reactive"
            });
            
            if (txs.length >= limit) break;
        }
        
        return txs;
    } catch (error) {
        console.error("Error fetching reactive txs:", error);
        return [];
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
                parse_mode: "HTML"
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
            `❌ Unknown feed: ${key}\n\n` +
            `Available feeds: ${Object.keys(CHAINLINK_FEEDS).join(", ")}`
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
    message += `📈 Total Cross-Chain Updates: <b>${stats.totalUpdates}</b>`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleFeeds(chatId: string) {
    let message = `📋 <b>Active Chainlink Feeds</b>\n`;
    message += `<i>3 volatile crypto feeds</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        const mirrored = await getMirroredPrice(key);
        
        message += `${feed.emoji} <b>${feed.name}</b> /${key.toLowerCase()}\n`;
        message += `   Aggregator: <code>${feed.aggregator.slice(0, 10)}...</code>\n`;
        
        if (mirrored) {
            message += `   Updates: ${mirrored.totalUpdates}\n`;
            message += `   Last: ${formatAge(mirrored.updatedAt)}\n`;
        } else {
            message += `   Updates: Pending\n`;
        }
        message += `\n`;
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `ℹ️ These feeds update every ~15 min`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleStatus(chatId: string) {
    const stats = await getSystemStats();
    
    let message = `🔧 <b>System Status</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>📊 Statistics:</b>\n`;
    message += `   Total Updates: ${stats.totalUpdates}\n`;
    message += `   Active Feeds: 3\n\n`;
    
    message += `<b>💰 RSC Balance:</b>\n`;
    message += `   ${parseFloat(stats.rscBalance).toFixed(2)} REACT\n\n`;
    
    message += `<b>📡 Contracts:</b>\n`;
    message += `   Destination: <code>${MULTI_FEED_DESTINATION.slice(0, 14)}...</code>\n`;
    message += `   RSC: <code>${NEW_RSC.slice(0, 14)}...</code>\n\n`;
    
    message += `<b>🌐 Networks:</b>\n`;
    message += `   Origin: Base Sepolia (84532)\n`;
    message += `   Reactive: Lasna (5318007)\n`;
    message += `   Dest: Sepolia (11155111)\n\n`;
    
    message += `<b>📈 Feed Updates:</b>\n`;
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        const mirrored = await getMirroredPrice(key);
        const updates = mirrored?.totalUpdates || 0;
        const status = mirrored ? "✅" : "⏳";
        message += `   ${status} ${feed.name}: ${updates}\n`;
    }
    
    await sendTelegramMessage(chatId, message);
}

async function handleHelp(chatId: string) {
    const message = 
        `📖 <b>Cross-Chain Oracle Bot</b>\n` +
        `<i>Reactive Network Price Mirror</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>💰 Price Commands:</b>\n` +
        `   /price [feed] - Get specific price\n` +
        `   /eth /btc /link - Quick shortcuts\n` +
        `   /prices - All 3 prices at once\n\n` +
        `<b>📋 Info Commands:</b>\n` +
        `   /feeds - List feeds with stats\n` +
        `   /status - Full system status\n` +
        `   /contracts - All contract addresses\n\n` +
        `<b>🔗 Transaction Commands:</b>\n` +
        `   /txs [feed] - Recent tx hashes\n` +
        `   /workflow - Full cross-chain flow\n` +
        `   /history [feed] - Detailed tx history\n\n` +
        `<b>How It Works:</b>\n` +
        `Chainlink feeds on Base Sepolia are\n` +
        `monitored by a Reactive Smart Contract.\n` +
        `Price updates trigger cross-chain\n` +
        `callbacks to Sepolia destination.\n\n` +
        `<i>Updates every ~15 minutes per feed</i>`;
    
    await sendTelegramMessage(chatId, message);
}

// ═══════════════════════════════════════════════════════════════
// NEW BOUNTY-COMPLIANT COMMANDS
// ═══════════════════════════════════════════════════════════════

async function handleTxs(chatId: string, feedKey?: string) {
    const key = feedKey?.toUpperCase();
    
    await sendTelegramMessage(chatId, `⏳ Fetching transaction hashes...`);
    
    let message = `🔗 <b>Recent Transaction Hashes</b>\n`;
    message += `<i>Cross-chain workflow transactions</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Origin transactions (Base Sepolia)
    const originKey = key || "ETH";
    if (CHAINLINK_FEEDS[originKey as keyof typeof CHAINLINK_FEEDS]) {
        const originTxs = await getOriginTxs(originKey, 3);
        message += `🔵 <b>Origin (Base Sepolia)</b>\n`;
        if (originTxs.length > 0) {
            for (const tx of originTxs) {
                const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;
                message += `   <a href="${EXPLORERS.baseSepolia}/tx/${tx.hash}">${shortHash}</a>\n`;
            }
        } else {
            message += `   No recent transactions\n`;
        }
        message += `\n`;
    }
    
    // Reactive transactions (Lasna - event replays)
    const reactiveTxs = await getReactiveTxs(3);
    message += `⚡ <b>Reactive (Lasna)</b>\n`;
    if (reactiveTxs.length > 0) {
        for (const tx of reactiveTxs) {
            const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;
            message += `   <a href="${EXPLORERS.reactive}/tx/${tx.hash}">${shortHash}</a>\n`;
        }
    } else {
        message += `   RSC: <a href="${EXPLORERS.reactive}/address/${NEW_RSC}">${NEW_RSC.slice(0, 14)}...</a>\n`;
    }
    message += `\n`;
    
    // Destination transactions (Sepolia)
    const destTxs = await getDestinationTxs(key, 3);
    message += `🟢 <b>Destination (Sepolia)</b>\n`;
    if (destTxs.length > 0) {
        for (const tx of destTxs) {
            const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;
            message += `   <a href="${EXPLORERS.sepolia}/tx/${tx.hash}">${shortHash}</a>\n`;
        }
    } else {
        message += `   No recent transactions\n`;
    }
    message += `\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `ℹ️ Click links to view on explorer`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleWorkflow(chatId: string) {
    await sendTelegramMessage(chatId, `⏳ Building cross-chain workflow...`);
    
    // Fetch all transactions in parallel
    const [ethOrigin, reactiveTxs, destTx, stats] = await Promise.all([
        getOriginTxs("ETH", 1),
        getReactiveTxs(1),
        getDestinationTxs(undefined, 1),
        getSystemStats()
    ]);
    
    let message = `🔄 <b>Cross-Chain Workflow</b>\n`;
    message += `<i>Complete transaction flow with hashes</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>📍 Step 1: Origin Event</b>\n`;
    message += `Chain: Base Sepolia (84532)\n`;
    message += `Source: Chainlink Aggregators\n`;
    if (ethOrigin.length > 0) {
        message += `TX: <a href="${EXPLORERS.baseSepolia}/tx/${ethOrigin[0].hash}">${ethOrigin[0].hash.slice(0, 22)}...</a>\n`;
    } else {
        message += `TX: Querying...\n`;
    }
    message += `\n`;
    
    message += `<b>⚡ Step 2: Reactive Processing</b>\n`;
    message += `Chain: Lasna (5318007)\n`;
    message += `RSC: <a href="${EXPLORERS.reactive}/address/${NEW_RSC}">${NEW_RSC.slice(0, 18)}...</a>\n`;
    if (reactiveTxs.length > 0) {
        message += `TX: <a href="${EXPLORERS.reactive}/tx/${reactiveTxs[0].hash}">${reactiveTxs[0].hash.slice(0, 22)}...</a>\n`;
    } else {
        message += `TX: Event replays processed\n`;
    }
    message += `\n`;
    
    message += `<b>🎯 Step 3: Destination Callback</b>\n`;
    message += `Chain: Sepolia (11155111)\n`;
    message += `Target: <a href="${EXPLORERS.sepolia}/address/${MULTI_FEED_DESTINATION}">${MULTI_FEED_DESTINATION.slice(0, 18)}...</a>\n`;
    if (destTx.length > 0) {
        message += `TX: <a href="${EXPLORERS.sepolia}/tx/${destTx[0].hash}">${destTx[0].hash.slice(0, 22)}...</a>\n`;
    } else {
        message += `TX: Querying...\n`;
    }
    message += `\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<b>📊 Summary:</b>\n`;
    message += `Total Updates: ${stats.totalUpdates}\n`;
    message += `Active Feeds: 3 (ETH, BTC, LINK)\n`;
    message += `RSC Balance: ${parseFloat(stats.rscBalance).toFixed(2)} REACT`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleContracts(chatId: string) {
    let message = `📋 <b>Contract Addresses</b>\n`;
    message += `<i>All deployed contracts with explorer links</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `<b>🔵 Origin (Base Sepolia)</b>\n`;
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        message += `${feed.emoji} ${feed.name}:\n`;
        message += `   <a href="${EXPLORERS.baseSepolia}/address/${feed.aggregator}">${feed.aggregator.slice(0, 18)}...</a>\n`;
    }
    message += `\n`;
    
    message += `<b>⚡ Reactive (Lasna)</b>\n`;
    message += `RSC (3-Feed Mirror):\n`;
    message += `   <a href="${EXPLORERS.reactive}/address/${NEW_RSC}">${NEW_RSC}</a>\n\n`;
    
    message += `<b>🟢 Destination (Sepolia)</b>\n`;
    message += `MultiFeedDestinationV2:\n`;
    message += `   <a href="${EXPLORERS.sepolia}/address/${MULTI_FEED_DESTINATION}">${MULTI_FEED_DESTINATION}</a>\n`;
    message += `Callback Proxy:\n`;
    message += `   <a href="${EXPLORERS.sepolia}/address/${CALLBACK_PROXY}">${CALLBACK_PROXY}</a>\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `ℹ️ Click addresses to view on explorer`;
    
    await sendTelegramMessage(chatId, message);
}

async function handleHistory(chatId: string, feedKey?: string) {
    const key = (feedKey || "ETH").toUpperCase();
    const feed = CHAINLINK_FEEDS[key as keyof typeof CHAINLINK_FEEDS];
    
    if (!feed) {
        await sendTelegramMessage(chatId, `❌ Unknown feed: ${key}`);
        return;
    }
    
    await sendTelegramMessage(chatId, `⏳ Fetching ${key} transaction history...`);
    
    // Fetch all in parallel
    const [originTxs, reactiveTxs, destTxs] = await Promise.all([
        getOriginTxs(key, 3),
        getReactiveTxs(3),
        getDestinationTxs(key, 3)
    ]);
    
    let message = `📜 <b>${feed.name} Transaction History</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Origin events
    message += `<b>🔵 Origin (Base Sepolia)</b>\n`;
    if (originTxs.length > 0) {
        for (const tx of originTxs) {
            const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`;
            message += `<a href="${EXPLORERS.baseSepolia}/tx/${tx.hash}">${shortHash}</a>\n`;
        }
    } else {
        message += `No recent transactions\n`;
    }
    message += `\n`;
    
    // Reactive events
    message += `<b>⚡ Reactive (Lasna)</b>\n`;
    if (reactiveTxs.length > 0) {
        for (const tx of reactiveTxs) {
            const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`;
            message += `<a href="${EXPLORERS.reactive}/tx/${tx.hash}">${shortHash}</a>\n`;
        }
    } else {
        message += `<a href="${EXPLORERS.reactive}/address/${NEW_RSC}">View RSC</a>\n`;
    }
    message += `\n`;
    
    // Destination events
    message += `<b>🟢 Destination (Sepolia)</b>\n`;
    if (destTxs.length > 0) {
        for (const tx of destTxs) {
            const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`;
            message += `<a href="${EXPLORERS.sepolia}/tx/${tx.hash}">${shortHash}</a>\n`;
        }
    } else {
        message += `No recent transactions\n`;
    }
    
    await sendTelegramMessage(chatId, message);
}

async function processCommand(chatId: string, text: string) {
    const parts = text.trim().toLowerCase().split(/\s+/);
    const command = parts[0];
    const arg = parts[1];
    
    console.log(`📥 Processing: ${command} ${arg || ""}`);
    
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
        case "/feeds":
        case "/list":
            await handleFeeds(chatId);
            break;
        case "/status":
            await handleStatus(chatId);
            break;
        // New bounty-compliant commands
        case "/txs":
        case "/tx":
        case "/transactions":
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
        case "/history":
        case "/hist":
            await handleHistory(chatId, arg);
            break;
        case "/start":
        case "/help":
            await handleHelp(chatId);
            break;
        default:
            await sendTelegramMessage(chatId, 
                `❓ Unknown command: ${command}\n\nType /help for available commands`
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
    
    console.log("\n╔═══════════════════════════════════════════════════════════════╗");
    console.log("║  CROSS-CHAIN ORACLE BOT - 3 FEED EDITION                      ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");
    
    // Get initial stats
    const stats = await getSystemStats();
    
    console.log("📊 System Status:");
    console.log(`   Destination: ${MULTI_FEED_DESTINATION}`);
    console.log(`   RSC: ${NEW_RSC}`);
    console.log(`   Total Updates: ${stats.totalUpdates}`);
    console.log(`   RSC Balance: ${stats.rscBalance} REACT\n`);
    
    console.log("📈 Active Feeds:");
    for (const [key, feed] of Object.entries(CHAINLINK_FEEDS)) {
        console.log(`   ✅ ${feed.emoji} ${feed.name} (/${key.toLowerCase()})`);
    }
    
    console.log("\n👀 Listening for commands... (Ctrl+C to stop)\n");
    
    // Send startup message
    await sendTelegramMessage(
        TELEGRAM_CHAT_ID,
        `🤖 <b>Cross-Chain Oracle Bot Online</b>\n\n` +
        `📊 Feeds: ETH/USD, BTC/USD, LINK/USD\n` +
        `📈 Total Updates: ${stats.totalUpdates}\n` +
        `💰 RSC Balance: ${parseFloat(stats.rscBalance).toFixed(2)} REACT\n\n` +
        `<b>Commands:</b>\n` +
        `/prices - All prices\n` +
        `/txs - Transaction hashes\n` +
        `/workflow - Cross-chain flow\n` +
        `/help - All commands`
    );
    
    // Main polling loop
    while (true) {
        try {
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
            // Silent retry on error
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
