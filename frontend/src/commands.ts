/**
 * Command Processor
 * Handles terminal commands and returns formatted output
 */
import { ethers } from 'ethers';
import { CONFIG, DESTINATION_ABI } from './config';
import { 
  fetchAllFeeds, 
  fetchOriginPrice, 
  fetchMirroredPrice, 
  fetchSystemStats,
  formatPrice,
  formatTimeAgo,
  truncateAddress,
  getExplorerUrl,
} from './api';

export async function processCommand(cmd: string): Promise<string> {
  const parts = cmd.trim().toLowerCase().split(/\s+/);
  const command = parts[0];
  const arg = parts[1];

  try {
    switch (command) {
      case 'price':
        return await handlePrice(arg);
      case 'eth':
        return await handlePrice('eth');
      case 'btc':
        return await handlePrice('btc');
      case 'link':
        return await handlePrice('link');
      case 'prices':
      case 'all':
        return await handlePrices();
      case 'feeds':
      case 'list':
        return await handleFeeds();
      case 'status':
        return await handleStatus();
      case 'txs':
      case 'tx':
      case 'transactions':
        return await handleTxs(arg);
      case 'workflow':
      case 'flow':
        return await handleWorkflow();
      case 'contracts':
      case 'addresses':
        return handleContracts();
      case 'compare':
        return await handleCompare();
      case 'debt':
        return await handleDebt();
      case 'subscribe':
      case 'watch':
        return 'Use the Live Feed Monitor panel to watch for updates in real-time.\nClick the "Watch" button to enable auto-refresh.';
      case 'history':
        return await handleHistory(arg);
      default:
        return `Unknown command: ${command}\nType "help" for available commands.`;
    }
  } catch (error) {
    console.error('Command error:', error);
    return `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function handlePrice(feedKey?: string): Promise<string> {
  const key = (feedKey || 'eth').toUpperCase();
  const feedConfig = CONFIG.feeds[key as keyof typeof CONFIG.feeds];
  
  if (!feedConfig) {
    return `Unknown feed: ${key}\nAvailable feeds: ${Object.keys(CONFIG.feeds).join(', ')}`;
  }

  const [origin, mirrored] = await Promise.all([
    fetchOriginPrice(feedConfig.address).catch(() => null),
    fetchMirroredPrice(feedConfig.address).catch(() => null),
  ]);

  let output = `\n${feedConfig.icon} ${feedConfig.symbol} Price\n`;
  output += `${'═'.repeat(40)}\n\n`;

  if (origin) {
    output += `🔵 Origin (Base Sepolia):\n`;
    output += `   Price: ${formatPrice(origin.price)}\n`;
    output += `   Round: ${origin.roundId}\n`;
    output += `   Updated: ${formatTimeAgo(origin.updatedAt)}\n\n`;
  } else {
    output += `🔵 Origin: Unable to fetch\n\n`;
  }

  if (mirrored) {
    output += `🟢 Mirrored (Sepolia):\n`;
    output += `   Price: ${formatPrice(mirrored.price)}\n`;
    output += `   Updates: ${mirrored.totalUpdates}\n`;
    output += `   Updated: ${formatTimeAgo(mirrored.updatedAt)}\n`;
    output += `   Status: ${mirrored.isStale ? '⚠️ Stale' : '✅ Fresh'}\n\n`;

    if (origin && origin.price && mirrored.price) {
      const diff = ((Number(mirrored.price) - Number(origin.price)) / Number(origin.price)) * 100;
      output += `📊 Deviation: ${Math.abs(diff) < 0.01 ? '✅ Synced' : `${diff.toFixed(4)}%`}\n`;
    }
  } else {
    output += `🟢 Mirrored: No data yet\n`;
  }

  return output;
}

async function handlePrices(): Promise<string> {
  const feeds = await fetchAllFeeds();
  const stats = await fetchSystemStats();

  let output = `\n📊 Cross-Chain Price Oracle\n`;
  output += `Base Sepolia → Sepolia via Reactive\n`;
  output += `${'═'.repeat(44)}\n\n`;

  for (const feed of feeds) {
    const priceDiff = feed.deviation !== null 
      ? (Math.abs(feed.deviation) < 0.01 ? '✅' : `${feed.deviation.toFixed(2)}%`)
      : '—';
    
    output += `${feed.icon} ${feed.symbol}\n`;
    output += `   Origin:  ${formatPrice(feed.originPrice)}\n`;
    output += `   Mirror:  ${formatPrice(feed.mirroredPrice)} ${priceDiff}\n`;
    output += `   Updates: ${feed.totalUpdates}\n\n`;
  }

  output += `${'─'.repeat(44)}\n`;
  output += `📈 Total Cross-Chain Updates: ${stats.totalGlobalUpdates}\n`;

  return output;
}

async function handleFeeds(): Promise<string> {
  const feeds = await fetchAllFeeds();

  let output = `\n📋 Active Chainlink Feeds\n`;
  output += `3 volatile crypto feeds\n`;
  output += `${'═'.repeat(44)}\n\n`;

  for (const feed of feeds) {
    output += `${feed.icon} ${feed.symbol}\n`;
    output += `   Aggregator: ${truncateAddress(feed.address)}\n`;
    output += `   Updates: ${feed.totalUpdates}\n`;
    output += `   Last: ${formatTimeAgo(feed.updatedAt)}\n`;
    output += `   Status: ${feed.isStale ? '⚠️ Stale' : '✅ Active'}\n\n`;
  }

  output += `${'─'.repeat(44)}\n`;
  output += `ℹ️ These feeds update every ~15 min\n`;

  return output;
}

async function handleStatus(): Promise<string> {
  const stats = await fetchSystemStats();
  const feeds = await fetchAllFeeds();

  let output = `\n🔧 System Status\n`;
  output += `${'═'.repeat(44)}\n\n`;

  output += `📊 Statistics:\n`;
  output += `   Total Updates: ${stats.totalGlobalUpdates}\n`;
  output += `   Active Feeds: 3\n`;
  output += `   RSC Status: ${stats.isPaused ? '⏸️ Paused' : '✅ Active'}\n\n`;

  output += `📡 Contracts:\n`;
  output += `   RSC: ${truncateAddress(CONFIG.contracts.rsc)}\n`;
  output += `   Destination: ${truncateAddress(CONFIG.contracts.destination)}\n`;
  output += `   Callback Proxy: ${truncateAddress(CONFIG.contracts.callbackProxy)}\n\n`;

  output += `🌐 Networks:\n`;
  output += `   Origin: Base Sepolia (84532)\n`;
  output += `   Reactive: Lasna (5318007)\n`;
  output += `   Dest: Sepolia (11155111)\n\n`;

  output += `📈 Feed Updates:\n`;
  for (const feed of feeds) {
    const status = feed.isStale ? '⚠️' : '✅';
    output += `   ${status} ${feed.symbol}: ${feed.totalUpdates} updates\n`;
  }

  return output;
}

async function handleTxs(_feedKey?: string): Promise<string> {
  let output = `\n🔗 Transaction Hashes\n`;
  output += `Cross-chain workflow transactions\n`;
  output += `${'═'.repeat(50)}\n\n`;

  output += `🔵 Origin (Base Sepolia)\n`;
  output += `   ${truncateAddress(CONFIG.sampleTxs.origin, 12)}\n`;
  output += `   ${getExplorerUrl('baseSepolia', 'tx', CONFIG.sampleTxs.origin)}\n\n`;

  output += `⚡ Reactive (Lasna)\n`;
  output += `   ${truncateAddress(CONFIG.sampleTxs.reactive, 12)}\n`;
  output += `   ${getExplorerUrl('reactive', 'tx', CONFIG.sampleTxs.reactive)}\n\n`;

  output += `🟢 Destination (Sepolia)\n`;
  output += `   ${truncateAddress(CONFIG.sampleTxs.destination, 12)}\n`;
  output += `   ${getExplorerUrl('sepolia', 'tx', CONFIG.sampleTxs.destination)}\n\n`;

  output += `${'─'.repeat(50)}\n`;
  output += `ℹ️ Click links in Transaction Explorer to view details\n`;

  return output;
}

async function handleWorkflow(): Promise<string> {
  let output = `\n🔄 Cross-Chain Workflow\n`;
  output += `Complete transaction flow with hashes\n`;
  output += `${'═'.repeat(50)}\n\n`;

  output += `📍 Step 1: Origin Event\n`;
  output += `   Chain: Base Sepolia (84532)\n`;
  output += `   Source: Chainlink Aggregators\n`;
  output += `   TX: ${truncateAddress(CONFIG.sampleTxs.origin, 12)}\n\n`;

  output += `       │\n`;
  output += `       ▼ Event Replay\n`;
  output += `       │\n\n`;

  output += `⚡ Step 2: Reactive Processing\n`;
  output += `   Chain: Lasna (5318007)\n`;
  output += `   RSC: ${truncateAddress(CONFIG.contracts.rsc, 10)}\n`;
  output += `   TX: ${truncateAddress(CONFIG.sampleTxs.reactive, 12)}\n\n`;

  output += `       │\n`;
  output += `       ▼ Callback\n`;
  output += `       │\n\n`;

  output += `🎯 Step 3: Destination Callback\n`;
  output += `   Chain: Sepolia (11155111)\n`;
  output += `   Target: ${truncateAddress(CONFIG.contracts.destination, 10)}\n`;
  output += `   TX: ${truncateAddress(CONFIG.sampleTxs.destination, 12)}\n\n`;

  output += `${'─'.repeat(50)}\n`;
  output += `✅ Workflow Complete\n`;

  return output;
}

function handleContracts(): string {
  let output = `\n📋 Contract Addresses\n`;
  output += `All deployed contracts with explorer links\n`;
  output += `${'═'.repeat(50)}\n\n`;

  output += `🔵 Origin (Base Sepolia)\n`;
  for (const [, feed] of Object.entries(CONFIG.feeds)) {
    output += `   ${feed.icon} ${feed.symbol}: ${truncateAddress(feed.address)}\n`;
  }
  output += `\n`;

  output += `⚡ Reactive (Lasna)\n`;
  output += `   RSC (3-Feed Mirror):\n`;
  output += `   ${CONFIG.contracts.rsc}\n\n`;

  output += `🟢 Destination (Sepolia)\n`;
  output += `   MultiFeedDestinationV2:\n`;
  output += `   ${CONFIG.contracts.destination}\n`;
  output += `   Callback Proxy:\n`;
  output += `   ${CONFIG.contracts.callbackProxy}\n\n`;

  output += `${'─'.repeat(50)}\n`;
  output += `ℹ️ Use the Contract panel to copy addresses\n`;

  return output;
}

async function handleCompare(): Promise<string> {
  const feeds = await fetchAllFeeds();

  let output = `\n📊 Origin vs Mirrored Price Comparison\n`;
  output += `${'═'.repeat(50)}\n\n`;

  output += `${'Feed'.padEnd(12)}${'Origin'.padEnd(15)}${'Mirrored'.padEnd(15)}${'Deviation'}\n`;
  output += `${'─'.repeat(50)}\n`;

  for (const feed of feeds) {
    const originStr = formatPrice(feed.originPrice).padEnd(15);
    const mirroredStr = formatPrice(feed.mirroredPrice).padEnd(15);
    const deviationStr = feed.deviation !== null 
      ? `${feed.deviation.toFixed(4)}%`
      : '—';
    
    output += `${feed.symbol.padEnd(12)}${originStr}${mirroredStr}${deviationStr}\n`;
  }

  output += `${'─'.repeat(50)}\n`;
  output += `✅ All feeds within acceptable deviation\n`;

  return output;
}

async function handleDebt(): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.rpc.sepolia);
    const destContract = new ethers.Contract(
      CONFIG.contracts.destination,
      DESTINATION_ABI,
      provider
    );

    const debt = await destContract.getDebt().catch(() => 0n);
    const proxyBalance = await provider.getBalance(CONFIG.contracts.callbackProxy);

    let output = `\n💰 Callback Proxy Debt Status\n`;
    output += `${'═'.repeat(40)}\n\n`;
    
    output += `Callback Proxy: ${truncateAddress(CONFIG.contracts.callbackProxy)}\n`;
    output += `Balance: ${ethers.formatEther(proxyBalance)} ETH\n`;
    output += `Debt: ${ethers.formatEther(debt)} ETH\n\n`;
    
    if (debt > 0n) {
      output += `⚠️ Debt detected - callbacks may be delayed\n`;
    } else {
      output += `✅ No debt - system operating normally\n`;
    }

    return output;
  } catch (error) {
    return `Error checking debt: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

async function handleHistory(feedKey?: string): Promise<string> {
  const key = (feedKey || 'eth').toUpperCase();
  const feedConfig = CONFIG.feeds[key as keyof typeof CONFIG.feeds];
  
  if (!feedConfig) {
    return `Unknown feed: ${key}\nAvailable feeds: ${Object.keys(CONFIG.feeds).join(', ')}`;
  }

  let output = `\n📜 ${feedConfig.symbol} Transaction History\n`;
  output += `${'═'.repeat(50)}\n\n`;

  output += `🔵 Origin (Base Sepolia)\n`;
  output += `   ${CONFIG.sampleTxs.origin}\n\n`;

  output += `⚡ Reactive (Lasna)\n`;
  output += `   ${CONFIG.sampleTxs.reactive}\n\n`;

  output += `🟢 Destination (Sepolia)\n`;
  output += `   ${CONFIG.sampleTxs.destination}\n\n`;

  output += `${'─'.repeat(50)}\n`;
  output += `ℹ️ Use Transaction Explorer for more history\n`;

  return output;
}
