# 🔒 Security Best Practices & Setup Guide

## Critical Security Issues Fixed

### 1. ❌ EXPOSED SECRETS (NOW FIXED)
**Problem:** Private key and Telegram bot token were committed to git
**Solution:** 
- Moved all sensitive values to `.env` (already in `.gitignore`)
- Created `.env.example` with safe placeholders
- Regenerate exposed keys immediately

**ACTION REQUIRED:**
```bash
# 1. Rotate your keys immediately (GitHub detected the compromise)
# 2. Update .env with new values (never commit)
# 3. Verify your Telegram bot token is changed
```

### 2. ❌ HARDCODED RPC URLS IN FRONTEND (NOW FIXED)
**Problem:** RPC URLs were hardcoded in source files
**Solution:**
- Moved to environment variables using Vite's `import.meta.env`
- Frontend only loads `VITE_*` prefixed variables (safe)
- Backend RPC URLs stay in `.env` (not exposed)

**Environment Variable Strategy:**
```
Frontend Safe (VITE_*):
- RPC endpoints (testnet, public)
- Contract addresses
- Feed aggregators

Backend Only (NO VITE_ prefix):
- PRIVATE_KEY
- Private RPC endpoints
- Telegram tokens
- API keys
```

## Setup Instructions

### Local Development Setup
```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Add actual values (never commit)
# Edit .env.local with real RPC keys and private key

# 3. Frontend setup
cd frontend
cp .env.example .env.local
# Frontend .env.local can be shared (only public vars)

# 4. Install and run
npm install
npm run dev
```

### Frontend Deployment (Vercel/Production)

**Step 1: Add to Vercel Environment Variables**
```
In Vercel Dashboard → Project Settings → Environment Variables
Add these (all public, testnet):

VITE_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
VITE_REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/

VITE_DESTINATION_CONTRACT=0x889c32f46E273fBd0d5B1806F3f1286010cD73B3
VITE_RSC_CONTRACT=0x70c6c95D4F75eE019Fa2c163519263a11AaC70f5
VITE_CALLBACK_PROXY=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA

VITE_ETH_USD_FEED=0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3
VITE_BTC_USD_FEED=0x961AD289351459A45fC90884eF3AB0278ea95DDE
VITE_LINK_USD_FEED=0xAc6DB6d5538Cd07f58afee9dA736ce192119017B
```

**Step 2: Deploy Frontend**
```bash
cd frontend
vercel deploy
```

### Backend Deployment (Hardhat Scripts)

Keep these in `.env` only:
```
PRIVATE_KEY=your-private-key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_CHAT_ID=your-chat-id
```

Never expose backend `.env` to git.

## Security Checklist

- [x] Removed hardcoded RPC URLs from source
- [x] Moved sensitive data to `.env`
- [x] Created `.env.example` with safe defaults
- [x] Configured Vite to only expose `VITE_*` variables
- [x] `.env` is in `.gitignore` (never committed)
- [x] Frontend can safely use environment-provided values
- [x] Backend keys stay private
- [] TODO: Rotate exposed private key
- [ ] TODO: Rotate exposed Telegram bot token
- [ ] TODO: Update GitHub secrets

## Environment Variables Reference

### Frontend-Safe (VITE_* - exposed to browser)
These variables are embedded in the frontend bundle and visible to users. Only use public, testnet values:
- `VITE_SEPOLIA_RPC_URL` - Public testnet RPC
- `VITE_BASE_SEPOLIA_RPC_URL` - Public testnet RPC
- `VITE_REACTIVE_RPC_URL` - Public testnet RPC
- `VITE_DESTINATION_CONTRACT` - Public contract address
- `VITE_RSC_CONTRACT` - Public contract address
- `VITE_CALLBACK_PROXY` - Public contract address
- `VITE_*_FEED` - Public aggregator addresses

### Backend-Only (NO VITE_ prefix)
These are NOT exposed to frontend and must be kept secret:
- `PRIVATE_KEY` - Your signing key
- `SEPOLIA_RPC_URL_PRIVATE` - Private RPC endpoint
- `REACTIVE_RPC_URL_PRIVATE` - Private RPC endpoint
- `TELEGRAM_BOT_TOKEN` - Bot authentication
- `TELEGRAM_CHAT_ID` - Chat identifier

## Vercel Deployment Steps

1. Push frontend to GitHub (no secrets!)
2. Connect GitHub repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy: `vercel deploy`

## Testing Environment Variables

```bash
# Verify frontend config loads correctly
cd frontend
npm run dev

# Check browser console:
# Should show contract addresses and RPC URLs
# No private keys or tokens!
```

## Monitoring & Alerts

GitHub automatically scans for exposed secrets:
- ✅ Check Security → Secret scanning alerts
- ✅ Rotate any exposed credentials
- ✅ Use deploy tokens instead of personal keys

## Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
