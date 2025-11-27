#!/bin/bash

# 🔒 Security-First Setup Script
# This script helps initialize the project safely

set -e

echo "🚀 Reactive Oracle - Security-First Setup"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
    echo "Creating from .env.example..."
    cp .env.example .env
    echo "✅ .env created (REMEMBER: Add your actual keys!)"
else
    echo "✅ .env exists"
fi

# Check if .env is in .gitignore
if grep -q "^\.env$" .gitignore; then
    echo "✅ .env is in .gitignore"
else
    echo "⚠️  Adding .env to .gitignore..."
    echo ".env" >> .gitignore
    echo "✅ .env added to .gitignore"
fi

# Setup frontend
echo ""
echo "Setting up frontend..."
cd frontend

if [ ! -f .env.local ]; then
    echo "Creating frontend/.env.local..."
    cp .env.example .env.local 2>/dev/null || cp ../.env.example .env.local
    echo "✅ frontend/.env.local created"
fi

# Check if frontend/.env.local is in .gitignore
if grep -q "\.env\.local" ../.gitignore; then
    echo "✅ .env.local is in .gitignore"
else
    echo "⚠️  Adding .env.local to .gitignore..."
    echo ".env.local" >> ../.gitignore
fi

echo ""
echo "Installing frontend dependencies..."
npm install

cd ..

echo ""
echo "🔒 Security Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env with your ACTUAL private key, RPC URLs, and tokens"
echo "2. Edit frontend/.env.local with your RPC URLs and contract addresses"
echo "3. NEVER commit .env or secrets to git"
echo "4. Rotate the exposed keys (GitHub detected them):"
echo "   - Private key"
echo "   - Telegram bot token"
echo ""
echo "✅ Both .env and .env.local are in .gitignore and won't be committed"
echo ""
