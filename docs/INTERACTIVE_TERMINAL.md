# 🖥️ Interactive Terminal Documentation

## Cross-Chain Oracle Interactive Console

A command-line style interface built into the web dashboard for querying the Reactive Network Cross-Chain Price Oracle. Query real-time prices, system status, and transaction details without leaving the browser.

---

## 🚀 Quick Start

### Access the Terminal

1. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. Open http://localhost:3001

3. Click the **Terminal** tab (▸) in the navigation bar

### Terminal Interface
```
╔═══════════════════════════════════════════════════════════════╗
║  REACTIVE ORACLE TERMINAL v2.0                                ║
║  Cross-Chain Price Oracle Interactive Console                 ║
╚═══════════════════════════════════════════════════════════════╝
Connected to Reactive Network, Base Sepolia, and Ethereum Sepolia
Type "help" for available commands

$ _
```

---

## 📋 Available Commands

### Price Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `price eth` | `eth` | Get ETH/USD price with stats |
| `price btc` | `btc` | Get BTC/USD price with stats |
| `price link` | `link` | Get LINK/USD price with stats |
| `prices` | `all` | Get all 3 prices at once |
| `compare` | — | Origin vs mirrored price comparison |

### System Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `status` | — | Full system status and metrics |
| `feeds` | `list` | List all active feeds with stats |
| `debt` | — | Check callback proxy debt status |

### Transaction Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `txs` | `tx`, `transactions` | Recent transaction hashes |
| `workflow` | `flow` | Cross-chain workflow diagram |
| `history [feed]` | — | Detailed tx history per feed |
| `contracts` | `addresses` | All deployed contract addresses |

### Utility Commands

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `clear` | Clear terminal output |
| `subscribe` | Info about live monitoring |

---

## 📱 Sample Output

### `prices` - All Prices At Once
```
📊 Cross-Chain Price Oracle
Base Sepolia → Sepolia via Reactive
════════════════════════════════════════════

💎 ETH/USD
   Origin:  $3,031.88
   Mirror:  $3,031.88 ✅
   Updates: 238

🪙 BTC/USD
   Origin:  $91,331.95
   Mirror:  $91,331.95 ✅
   Updates: 241

🔗 LINK/USD
   Origin:  $13.46
   Mirror:  $13.46 ✅
   Updates: 168

────────────────────────────────────────────
📈 Total Cross-Chain Updates: 647
```

---

### `price eth` - Single Feed Price
```
💎 ETH/USD Price
════════════════════════════════════════

🔵 Origin (Base Sepolia):
   Price: $3,031.88
   Round: 18446744073709617381
   Updated: 12m ago

🟢 Mirrored (Sepolia):
   Price: $3,031.88
   Updates: 238
   Updated: 12m ago
   Status: ✅ Fresh

📊 Deviation: ✅ Synced
```

---

### `status` - Full System Status
```
🔧 System Status
════════════════════════════════════════════

📊 Statistics:
   Total Updates: 647
   Active Feeds: 3
   RSC Status: ✅ Active

📡 Contracts:
   RSC: 0x70c6c95D...eE019Fa2c
   Destination: 0x889c32f4...d5B1806F3
   Callback Proxy: 0xc9f36411...99ffca2a0

🌐 Networks:
   Origin: Base Sepolia (84532)
   Reactive: Lasna (5318007)
   Dest: Sepolia (11155111)

📈 Feed Updates:
   ✅ ETH/USD: 238 updates
   ✅ BTC/USD: 241 updates
   ✅ LINK/USD: 168 updates
```

---

### `compare` - Origin vs Mirrored
```
📊 Origin vs Mirrored Price Comparison
══════════════════════════════════════════════════

Feed        Origin         Mirrored       Deviation
──────────────────────────────────────────────────
ETH/USD     $3,031.88      $3,031.88      0.0000%
BTC/USD     $91,331.95     $91,331.95     0.0000%
LINK/USD    $13.46         $13.46         0.0000%
──────────────────────────────────────────────────
✅ All feeds within acceptable deviation
```

---

### `feeds` - List All Feeds
```
📋 Active Chainlink Feeds
3 volatile crypto feeds
════════════════════════════════════════════

💎 ETH/USD
   Aggregator: 0xa24A68DD...CA517765C
   Updates: 238
   Last: 12m ago
   Status: ✅ Active

🪙 BTC/USD
   Aggregator: 0x961AD289...f3AB0278e
   Updates: 241
   Last: 3m ago
   Status: ✅ Active

🔗 LINK/USD
   Aggregator: 0xAc6DB6d5...a736ce192
   Updates: 168
   Last: 8m ago
   Status: ✅ Active

────────────────────────────────────────────
ℹ️ These feeds update every ~15 min
```

---

### `workflow` - Cross-Chain Flow
```
🔄 Cross-Chain Workflow
Complete transaction flow with hashes
══════════════════════════════════════════════════

📍 Step 1: Origin Event
   Chain: Base Sepolia (84532)
   Source: Chainlink Aggregators
   TX: 0x205f180a...96c922c2f233e7

       │
       ▼ Event Replay
       │

⚡ Step 2: Reactive Processing
   Chain: Lasna (5318007)
   RSC: 0x70c6c95D...aac70f5
   TX: 0x45c06495...495affa7f1a

       │
       ▼ Callback
       │

🎯 Step 3: Destination Callback
   Chain: Sepolia (11155111)
   Target: 0x889c32f4...10cd73b3
   TX: 0x9c577f91...7a584bca2

──────────────────────────────────────────────────
✅ Workflow Complete
```

---

### `contracts` - All Addresses
```
📋 Contract Addresses
All deployed contracts with explorer links
══════════════════════════════════════════════════

🔵 Origin (Base Sepolia)
   💎 ETH/USD: 0xa24A68DD...7e217e7a3
   🪙 BTC/USD: 0x961AD289...B0278ea95DDE
   🔗 LINK/USD: 0xAc6DB6d5...9017B

⚡ Reactive (Lasna)
   RSC (3-Feed Mirror):
   0x692C332E692A3fD3eFE04a7f6502854e1f6A1bcB

🟢 Destination (Sepolia)
   MultiFeedDestinationV2:
   0x889c32f46E273fBd0d5B1806F3f1286010cD73B3
   Callback Proxy:
   0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA

──────────────────────────────────────────────────
ℹ️ Use the Contract panel to copy addresses
```

---

### `txs` - Transaction Hashes
```
🔗 Transaction Hashes
Cross-chain workflow transactions
══════════════════════════════════════════════════

🔵 Origin (Base Sepolia)
   0x205f180a...c922c2f233e7
   https://sepolia.basescan.org/tx/0x205f...

⚡ Reactive (Lasna)
   0x45c06495...495affa7f1a
   https://reactscan.net/tx/0x45c0...

🟢 Destination (Sepolia)
   0x9c577f91...7a584bca2
   https://sepolia.etherscan.io/tx/0x9c57...

──────────────────────────────────────────────────
ℹ️ Click links in Transaction Explorer to view details
```

---

### `debt` - Callback Proxy Debt
```
💰 Callback Proxy Debt Status
════════════════════════════════════════

Callback Proxy: 0xc9f36411...99ffca2a0
Balance: 0.109 ETH
Debt: 0.0 ETH

✅ No debt - system operating normally
```

---

### `help` - All Commands
```
Available Commands:
─────────────────────────────────────────
  price [feed]    Get live price (eth/btc/link)
  prices          All 3 prices at once
  feeds           List all feeds with stats
  status          Full system status
  txs [feed]      Recent transaction hashes
  workflow        Cross-chain workflow
  contracts       All contract addresses
  history [feed]  Detailed tx history
  compare         Compare origin vs mirrored
  debt            Check callback proxy debt
  subscribe       Watch for updates
  help            Show this help
  clear           Clear terminal
─────────────────────────────────────────
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` Arrow Up | Previous command from history |
| `↓` Arrow Down | Next command from history |
| `Enter` | Execute command |
| `Ctrl+L` | Clear terminal (or type `clear`) |

---

## 🎨 Terminal Features

### Command History
The terminal remembers your command history. Use the up/down arrow keys to navigate through previous commands.

### Auto-Scroll
Output automatically scrolls to the latest content. The terminal maintains history so you can scroll back.

### Status Indicator
- **● Ready** - Terminal is ready for input
- **⏳ Processing...** - Command is being executed

### Color-Coded Output
- **Green** - Success messages and active statuses
- **Yellow** - Warnings (e.g., stale prices)
- **Red** - Errors
- **Blue** - Informational messages
- **White** - Standard output

---

## 🔧 Technical Details

### Data Sources
The terminal fetches real-time data from:
- **Base Sepolia RPC** - Origin Chainlink prices
- **Ethereum Sepolia RPC** - Mirrored prices and stats
- **Reactive Lasna RPC** - RSC status

### Refresh Behavior
- Each command fetches fresh data from the blockchain
- No caching - always real-time
- Use `compare` to verify origin vs mirrored sync

### Error Handling
```
Error executing command: Network request failed
```
If you see network errors:
1. Check your internet connection
2. RPC endpoints may be rate-limited
3. Try again in a few seconds

---

## 📊 Use Cases

### 1. Quick Price Check
```bash
$ eth
$ btc
$ link
```

### 2. Verify Cross-Chain Sync
```bash
$ compare
```
Shows deviation between origin and mirrored prices. 0.0000% means perfect sync.

### 3. Debug Issues
```bash
$ status     # Check overall system health
$ debt       # Check if callbacks are failing
$ feeds      # Check individual feed status
```

### 4. Get Transaction Proof
```bash
$ txs       # Get sample transaction hashes
$ workflow  # See full cross-chain flow
```

### 5. Find Contract Addresses
```bash
$ contracts  # All deployed addresses
```

---

## 🔗 Related Documentation

- **[Telegram Bot](TELEGRAM_BOT.md)** - Mobile monitoring via Telegram
- **[Design Document](design.md)** - Architecture overview
- **[Security Architecture](security-architecture.md)** - Security analysis

---

## 📞 Support

- **Reactive Network Docs**: https://dev.reactive.network/
- **Project Repository**: https://github.com/guglxni/reactive-bounty-1

---

*Part of the Reactive Cross-Chain Oracle Bounty Submission - November 2025*
