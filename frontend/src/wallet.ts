/**
 * Wallet Connection Module
 * Handles MetaMask and browser wallet connectivity
 */
import { ethers } from 'ethers';
import { CONFIG } from './config';

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
}

const initialState: WalletState = {
  connected: false,
  address: null,
  chainId: null,
  provider: null,
  signer: null,
};

let currentState: WalletState = { ...initialState };
let stateListeners: ((state: WalletState) => void)[] = [];

// Chain configurations for adding networks
const CHAIN_CONFIGS: Record<number, {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}> = {
  [CONFIG.chains.reactive]: {
    chainId: `0x${CONFIG.chains.reactive.toString(16)}`,
    chainName: 'Reactive Lasna',
    nativeCurrency: { name: 'REACT', symbol: 'REACT', decimals: 18 },
    rpcUrls: [CONFIG.rpc.reactive],
    blockExplorerUrls: [CONFIG.explorers.reactive],
  },
  [CONFIG.chains.baseSepolia]: {
    chainId: `0x${CONFIG.chains.baseSepolia.toString(16)}`,
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: [CONFIG.rpc.baseSepolia],
    blockExplorerUrls: [CONFIG.explorers.baseSepolia],
  },
  [CONFIG.chains.sepolia]: {
    chainId: `0x${CONFIG.chains.sepolia.toString(16)}`,
    chainName: 'Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth-sepolia.g.alchemy.com/v2/demo'],
    blockExplorerUrls: [CONFIG.explorers.sepolia],
  },
};

function notifyListeners() {
  stateListeners.forEach(listener => listener(currentState));
}

export function subscribeToWallet(listener: (state: WalletState) => void): () => void {
  stateListeners.push(listener);
  // Immediately call with current state
  listener(currentState);
  
  // Return unsubscribe function
  return () => {
    stateListeners = stateListeners.filter(l => l !== listener);
  };
}

export function getWalletState(): WalletState {
  return currentState;
}

export async function connectWallet(): Promise<WalletState> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    
    if (accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }
    
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    
    currentState = {
      connected: true,
      address: accounts[0],
      chainId: Number(network.chainId),
      provider,
      signer,
    };
    
    notifyListeners();
    
    // Set up event listeners
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    
    return currentState;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to connect wallet';
    throw new Error(message);
  }
}

export async function disconnectWallet(): Promise<void> {
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }
  
  currentState = { ...initialState };
  notifyListeners();
}

export async function switchChain(chainId: number): Promise<void> {
  if (!window.ethereum) {
    throw new Error('No wallet detected');
  }
  
  const hexChainId = `0x${chainId.toString(16)}`;
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError: unknown) {
    // Chain not added to wallet, try to add it
    const errorCode = (switchError as { code?: number })?.code;
    if (errorCode === 4902) {
      const config = CHAIN_CONFIGS[chainId];
      if (config) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [config],
        });
      } else {
        throw new Error(`Unknown chain: ${chainId}`);
      }
    } else {
      throw switchError;
    }
  }
}

// Typed handlers for wallet events
const handleAccountsChanged = (...args: unknown[]) => {
  const accounts = args[0] as string[];
  if (!accounts || accounts.length === 0) {
    disconnectWallet();
  } else if (accounts[0] !== currentState.address) {
    // Re-initialize with new account
    connectWallet().catch(console.error);
  }
};

const handleChainChanged = () => {
  // Reload on chain change for simplicity
  window.location.reload();
};

// Format address for display
export function formatAddress(address: string | null): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get chain name from ID
export function getChainName(chainId: number | null): string {
  if (!chainId) return 'Unknown';
  
  switch (chainId) {
    case CONFIG.chains.sepolia:
      return 'Sepolia';
    case CONFIG.chains.baseSepolia:
      return 'Base Sepolia';
    case CONFIG.chains.reactive:
      return 'Reactive Lasna';
    default:
      return `Chain ${chainId}`;
  }
}

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
