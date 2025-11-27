# Reactive Oracle Dashboard

A live cross-chain price oracle dashboard for the Reactive Bounties 2.0 Sprint #1 submission.

## Features

- **Live Price Feeds**: Real-time display of ETH/USD, BTC/USD, and LINK/USD prices
- **Origin vs Mirrored Comparison**: See prices from Base Sepolia (origin) and Sepolia (destination)
- **Cross-Chain Workflow Visualization**: Interactive flow showing Origin → Reactive → Destination
- **Bounty Requirements Checklist**: Visual confirmation all requirements are met
- **Contract Information**: All deployed addresses with explorer links
- **System Statistics**: Total updates, RSC status, and more

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **Framer Motion** for animations
- **ethers.js v6** for blockchain interactions

## Design

The dashboard features a cyberpunk/terminal aesthetic with:
- **Typography**: JetBrains Mono (code) + Outfit (display)
- **Colors**: Dark theme with neon cyan (#00ffd5) accents
- **Animations**: Staggered reveals, scan lines, glowing effects
- **Grid Background**: Subtle animated grid pattern

## Data Sources

- **Origin Prices**: Chainlink aggregators on Base Sepolia (chain 84532)
- **Mirrored Prices**: MultiFeedDestinationV2 on Sepolia (chain 11155111)
- **RSC Stats**: MultiFeedMirrorRCv2 on Reactive Lasna (chain 5318007)

## Contract Addresses

| Contract | Address | Chain |
|----------|---------|-------|
| RSC | `0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5` | Reactive Lasna |
| Destination | `0x889c32f46E273fBd0d5B1806F3f1286010cD73B3` | Sepolia |
| Callback Proxy | `0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA` | Sepolia |

## Building for Production

```bash
npm run build
npm run preview
```

The built files will be in the `dist/` directory.
