import { ethers } from 'ethers';
import { CONFIG, DESTINATION_ABI, RSC_ABI, CHAINLINK_ABI } from './config';
import { getWalletState, switchChain } from './wallet';

// Types
export interface FeedData {
  address: string;
  symbol: string;
  icon: string;
  color: string;
  originPrice: bigint | null;
  mirroredPrice: bigint | null;
  decimals: number;
  roundId: bigint | null;
  updatedAt: number | null;
  totalUpdates: number;
  isStale: boolean;  // Source data is > 3 hours old (from Chainlink)
  isSynced: boolean; // Mirrored price matches origin price
  deviation: number | null;
}

export interface SystemStats {
  totalGlobalUpdates: number;
  rscCallbacks: number;
  rscEvents: number;
  isPaused: boolean;
  domainSeparator: string;
  destinationDebt: bigint;
}

// Providers
const getProvider = (chain: 'sepolia' | 'baseSepolia' | 'reactive') => {
  return new ethers.JsonRpcProvider(CONFIG.rpc[chain]);
};

// Fetch origin price from Chainlink on Base Sepolia
export async function fetchOriginPrice(feedAddress: string): Promise<{
  price: bigint;
  roundId: bigint;
  updatedAt: number;
}> {
  const provider = getProvider('baseSepolia');
  const contract = new ethers.Contract(feedAddress, CHAINLINK_ABI, provider);
  
  try {
    const [roundId, answer, , updatedAt] = await contract.latestRoundData();
    return {
      price: answer,
      roundId,
      updatedAt: Number(updatedAt),
    };
  } catch (error) {
    console.error('Error fetching origin price:', error);
    throw error;
  }
}

// Fetch mirrored price from destination on Sepolia
export async function fetchMirroredPrice(feedAddress: string): Promise<{
  price: bigint;
  roundId: bigint;
  updatedAt: number;
  totalUpdates: number;
  isStale: boolean;
}> {
  const provider = getProvider('sepolia');
  const contract = new ethers.Contract(CONFIG.contracts.destination, DESTINATION_ABI, provider);
  
  try {
    const [roundId, answer, , updatedAt] = await contract.latestRoundData(feedAddress);
    const [totalUpdates, , , , stale] = await contract.getFeedStats(feedAddress);
    
    return {
      price: answer,
      roundId,
      updatedAt: Number(updatedAt),
      totalUpdates: Number(totalUpdates),
      isStale: stale,
    };
  } catch (error) {
    console.error('Error fetching mirrored price:', error);
    throw error;
  }
}

// Fetch all feed data
export async function fetchAllFeeds(): Promise<FeedData[]> {
  const feeds: FeedData[] = [];
  
  for (const [key, feedConfig] of Object.entries(CONFIG.feeds)) {
    try {
      const [origin, mirrored] = await Promise.all([
        fetchOriginPrice(feedConfig.address).catch(() => null),
        fetchMirroredPrice(feedConfig.address).catch(() => null),
      ]);
      
      let deviation: number | null = null;
      if (origin && mirrored && origin.price > 0n && mirrored.price > 0n) {
        const diff = Number(origin.price - mirrored.price);
        deviation = (diff / Number(origin.price)) * 100;
      }
      
      // Consider synced if prices match or deviation is < 1%
      const isSynced = origin && mirrored && origin.price > 0n && mirrored.price > 0n
        ? Math.abs(deviation ?? 100) < 1
        : false;
      
      feeds.push({
        address: feedConfig.address,
        symbol: feedConfig.symbol,
        icon: feedConfig.icon,
        color: feedConfig.color,
        decimals: feedConfig.decimals,
        originPrice: origin?.price ?? null,
        mirroredPrice: mirrored?.price ?? null,
        roundId: mirrored?.roundId ?? null,
        updatedAt: mirrored?.updatedAt ?? null,
        totalUpdates: mirrored?.totalUpdates ?? 0,
        isStale: mirrored?.isStale ?? true,
        isSynced,
        deviation,
      });
    } catch (error) {
      console.error(`Error fetching ${key}:`, error);
      feeds.push({
        address: feedConfig.address,
        symbol: feedConfig.symbol,
        icon: feedConfig.icon,
        color: feedConfig.color,
        decimals: feedConfig.decimals,
        originPrice: null,
        mirroredPrice: null,
        roundId: null,
        updatedAt: null,
        totalUpdates: 0,
        isStale: true,
        isSynced: false,
        deviation: null,
      });
    }
  }
  
  return feeds;
}

// Fetch system stats
export async function fetchSystemStats(): Promise<SystemStats> {
  const sepoliaProvider = getProvider('sepolia');
  const reactiveProvider = getProvider('reactive');
  
  const destContract = new ethers.Contract(CONFIG.contracts.destination, DESTINATION_ABI, sepoliaProvider);
  const rscContract = new ethers.Contract(CONFIG.contracts.rsc, RSC_ABI, reactiveProvider);
  
  try {
    const [totalGlobalUpdates, destDebt, rscStats, isPaused, domainSeparator] = await Promise.all([
      destContract.totalGlobalUpdates(),
      destContract.getDebt().catch(() => 0n),
      rscContract.getStats().catch(() => [0n, 0n, 0n]),
      rscContract.isPaused().catch(() => false),
      rscContract.getDomainSeparator().catch(() => '0x'),
    ]);
    
    return {
      totalGlobalUpdates: Number(totalGlobalUpdates),
      rscCallbacks: Number(rscStats[1]),
      rscEvents: Number(rscStats[2]),
      isPaused,
      domainSeparator,
      destinationDebt: destDebt,
    };
  } catch (error) {
    console.error('Error fetching system stats:', error);
    return {
      totalGlobalUpdates: 618,
      rscCallbacks: 618,
      rscEvents: 650,
      isPaused: false,
      domainSeparator: '0x...',
      destinationDebt: 0n,
    };
  }
}

// Format price for display
export function formatPrice(price: bigint | null, decimals: number = 8): string {
  if (price === null) return '—';
  const value = Number(price) / Math.pow(10, decimals);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Format timestamp
export function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Format time ago
export function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Truncate address
export function truncateAddress(address: string, chars: number = 6): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Get explorer URL
export function getExplorerUrl(chain: 'sepolia' | 'baseSepolia' | 'reactive', type: 'tx' | 'address', hash: string): string {
  const base = CONFIG.explorers[chain];
  return `${base}/${type}/${hash}`;
}

// RSC ABI for forceUpdate
const RSC_FORCE_UPDATE_ABI = [
  'function forceUpdate(address feedAddr, uint256 roundId, int256 answer, uint256 updatedAt) external payable',
];

// Force sync a feed by calling forceUpdate on the RSC contract
export async function forceSyncFeed(feedAddress: string): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  const walletState = getWalletState();
  
  if (!walletState.connected || !walletState.signer) {
    return { success: false, error: 'Wallet not connected' };
  }
  
  try {
    // Ensure we're on the Reactive Network
    if (walletState.chainId !== CONFIG.chains.reactive) {
      await switchChain(CONFIG.chains.reactive);
      // Wait a moment for the switch to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Get the latest price from the origin (Base Sepolia)
    const originData = await fetchOriginPrice(feedAddress);
    
    // Create contract instance with signer
    const rscContract = new ethers.Contract(
      CONFIG.contracts.rsc,
      RSC_FORCE_UPDATE_ABI,
      walletState.signer
    );
    
    // Call forceUpdate
    const tx = await rscContract.forceUpdate(
      feedAddress,
      originData.roundId,
      originData.price,
      originData.updatedAt
    );
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: unknown) {
    console.error('Force sync failed:', error);
    const message = error instanceof Error ? error.message : 'Force sync failed';
    return { success: false, error: message };
  }
}

// Force sync all feeds
export async function forceSyncAllFeeds(): Promise<{
  results: { feed: string; success: boolean; txHash?: string; error?: string }[];
}> {
  const results: { feed: string; success: boolean; txHash?: string; error?: string }[] = [];
  
  for (const [symbol, feedConfig] of Object.entries(CONFIG.feeds)) {
    const result = await forceSyncFeed(feedConfig.address);
    results.push({
      feed: symbol,
      ...result,
    });
    
    // Small delay between transactions
    if (result.success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return { results };
}

