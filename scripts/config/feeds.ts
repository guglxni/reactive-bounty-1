/**
 * Available Chainlink Price Feeds on Base Sepolia
 * 
 * These are the aggregator addresses (not proxy addresses).
 * The RSC subscribes to AnswerUpdated events from the aggregator.
 * 
 * To find the aggregator for any proxy:
 *   cast call <PROXY_ADDRESS> "aggregator()" --rpc-url https://sepolia.base.org
 */

export const BASE_SEPOLIA_FEEDS = {
    // ETH / USD - Already deployed
    "ETH/USD": {
        proxy: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",
        aggregator: "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3",
        decimals: 8,
        description: "ETH / USD",
        heartbeat: 3600 // 1 hour
    },
    
    // BTC / USD
    "BTC/USD": {
        proxy: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
        aggregator: null, // Need to fetch
        decimals: 8,
        description: "BTC / USD",
        heartbeat: 3600
    },
    
    // LINK / USD
    "LINK/USD": {
        proxy: "0xb113F5A928BCfF189C998ab20d753a47F9dE5A61",
        aggregator: null,
        decimals: 8,
        description: "LINK / USD",
        heartbeat: 3600
    },
    
    // USDC / USD
    "USDC/USD": {
        proxy: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
        aggregator: null,
        decimals: 8,
        description: "USDC / USD",
        heartbeat: 86400 // 24 hours for stablecoins
    }
};

// Sepolia (Ethereum) Feeds - for comparison/testing
export const SEPOLIA_FEEDS = {
    "ETH/USD": {
        proxy: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
        aggregator: "0x719E22E3D4b690E5d96cCb40619180B5427F14AE",
        decimals: 8,
        description: "ETH / USD"
    },
    "BTC/USD": {
        proxy: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
        aggregator: null,
        decimals: 8,
        description: "BTC / USD"
    },
    "LINK/USD": {
        proxy: "0xc59E3633BAAC79493d908e63626716e204A45EdF",
        aggregator: null,
        decimals: 8,
        description: "LINK / USD"
    }
};

// Callback Proxies for each destination chain
export const CALLBACK_PROXIES = {
    sepolia: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA",
    // Add more as they become available
};

// System contract (same for all Reactive chains)
export const SYSTEM_CONTRACT = "0x0000000000000000000000000000000000fffFfF";
