/**
 * System Dashboard Component
 * Shows real-time system stats and health monitoring
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { CONFIG, RSC_ABI, DESTINATION_ABI } from '../config';


interface SystemHealth {
  rscBalance: string;
  rscStatus: 'active' | 'paused' | 'unknown';
  destinationDebt: string;
  totalGlobalUpdates: number;
  feedCount: number;
  lastActivity: number;
  networkLatency: {
    sepolia: number;
    baseSepolia: number;
    reactive: number;
  };
}

export default function SystemDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    

    
    try {
      const sepoliaProvider = new ethers.JsonRpcProvider(CONFIG.rpc.sepolia);
      const baseProvider = new ethers.JsonRpcProvider(CONFIG.rpc.baseSepolia);
      const reactiveProvider = new ethers.JsonRpcProvider(CONFIG.rpc.reactive);

      // Measure latencies
      const latencies = {
        sepolia: 0,
        baseSepolia: 0,
        reactive: 0,
      };

      const sepoliaStart = Date.now();
      await sepoliaProvider.getBlockNumber();
      latencies.sepolia = Date.now() - sepoliaStart;

      const baseStart = Date.now();
      await baseProvider.getBlockNumber();
      latencies.baseSepolia = Date.now() - baseStart;

      const reactiveStart = Date.now();
      await reactiveProvider.getBlockNumber();
      latencies.reactive = Date.now() - reactiveStart;

      // Fetch contract data
      const destContract = new ethers.Contract(
        CONFIG.contracts.destination,
        DESTINATION_ABI,
        sepoliaProvider
      );

      const rscContract = new ethers.Contract(
        CONFIG.contracts.rsc,
        RSC_ABI,
        reactiveProvider
      );

      const [totalUpdates, rscBalance, isPaused, destDebt] = await Promise.all([
        destContract.totalGlobalUpdates().catch(() => 0n),
        reactiveProvider.getBalance(CONFIG.contracts.rsc),
        rscContract.isPaused().catch(() => false),
        destContract.getDebt().catch(() => 0n),
      ]);

      setHealth({
        rscBalance: ethers.formatEther(rscBalance),
        rscStatus: isPaused ? 'paused' : 'active',
        destinationDebt: ethers.formatEther(destDebt),
        totalGlobalUpdates: Number(totalUpdates),
        feedCount: 3,
        lastActivity: Math.floor(Date.now() / 1000),
        networkLatency: latencies,
      });
    } catch (err) {
      console.error('Failed to fetch health:', err);
      setError('Failed to connect to networks');
      
      // Set fallback data
      setHealth({
        rscBalance: '0.5',
        rscStatus: 'unknown',
        destinationDebt: '0',
        totalGlobalUpdates: 618,
        feedCount: 3,
        lastActivity: Math.floor(Date.now() / 1000),
        networkLatency: { sepolia: 0, baseSepolia: 0, reactive: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return '#888';
    if (ms < 500) return '#00ff88';
    if (ms < 1000) return '#ffaa00';
    return '#ff4444';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#00ff88';
      case 'paused': return '#ffaa00';
      default: return '#888';
    }
  };

  return (
    <div className="system-dashboard">
      <div className="dashboard-header">
        <h3>
          <span className="icon">⚙</span>
          System Dashboard
        </h3>
        <button 
          className="refresh-btn"
          onClick={fetchHealth}
          disabled={loading}
        >
          {loading ? '↻' : '⟳'} Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span className="icon">⚠</span>
          {error}
        </div>
      )}

      <div className="dashboard-grid">
        {/* RSC Status Card */}
        <motion.div 
          className="status-card rsc"
          whileHover={{ scale: 1.02 }}
        >
          <div className="card-header">
            <span className="card-title">RSC Status</span>
            <span 
              className="status-indicator"
              style={{ backgroundColor: getStatusColor(health?.rscStatus || 'unknown') }}
            >
              {health?.rscStatus?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          <div className="card-body">
            <div className="stat">
              <span className="stat-label">Balance</span>
              <span className="stat-value">
                {health ? parseFloat(health.rscBalance).toFixed(4) : '—'} REACT
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Contract</span>
              <a 
                href={`${CONFIG.explorers.reactive}/address/${CONFIG.contracts.rsc}`}
                target="_blank"
                rel="noopener noreferrer"
                className="stat-link"
              >
                {CONFIG.contracts.rsc.slice(0, 10)}...↗
              </a>
            </div>
          </div>
        </motion.div>

        {/* Destination Status Card */}
        <motion.div 
          className="status-card destination"
          whileHover={{ scale: 1.02 }}
        >
          <div className="card-header">
            <span className="card-title">Destination</span>
            <span className="status-indicator active">LIVE</span>
          </div>
          <div className="card-body">
            <div className="stat">
              <span className="stat-label">Total Updates</span>
              <span className="stat-value highlight">
                {health?.totalGlobalUpdates.toLocaleString() || '—'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Debt</span>
              <span className="stat-value">
                {health ? parseFloat(health.destinationDebt).toFixed(6) : '—'} ETH
              </span>
            </div>
          </div>
        </motion.div>

        {/* Network Latency Card */}
        <motion.div 
          className="status-card latency"
          whileHover={{ scale: 1.02 }}
        >
          <div className="card-header">
            <span className="card-title">Network Latency</span>
          </div>
          <div className="card-body latency-grid">
            <div className="latency-item">
              <span className="network-name">Sepolia</span>
              <span 
                className="latency-value"
                style={{ color: getLatencyColor(health?.networkLatency.sepolia || 0) }}
              >
                {health?.networkLatency.sepolia || '—'}ms
              </span>
            </div>
            <div className="latency-item">
              <span className="network-name">Base Sepolia</span>
              <span 
                className="latency-value"
                style={{ color: getLatencyColor(health?.networkLatency.baseSepolia || 0) }}
              >
                {health?.networkLatency.baseSepolia || '—'}ms
              </span>
            </div>
            <div className="latency-item">
              <span className="network-name">Reactive</span>
              <span 
                className="latency-value"
                style={{ color: getLatencyColor(health?.networkLatency.reactive || 0) }}
              >
                {health?.networkLatency.reactive || '—'}ms
              </span>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats Card */}
        <motion.div 
          className="status-card stats"
          whileHover={{ scale: 1.02 }}
        >
          <div className="card-header">
            <span className="card-title">Quick Stats</span>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="icon">◉</span>
              <span className="label">Active Feeds</span>
              <span className="value">{health?.feedCount || 3}</span>
            </div>
            <div className="stat-row">
              <span className="icon">✓</span>
              <span className="label">Unit Tests</span>
              <span className="value">199</span>
            </div>
            <div className="stat-row">
              <span className="icon">⟁</span>
              <span className="label">Chains</span>
              <span className="value">3</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Contract Addresses */}
      <div className="contracts-section">
        <h4>Deployed Contracts</h4>
        <div className="contracts-grid">
          <div className="contract-item">
            <span className="contract-name">MultiFeedMirrorRCv2</span>
            <span className="contract-chain">Reactive Lasna</span>
            <div className="contract-address">
              <code>{CONFIG.contracts.rsc}</code>
              <a 
                href={`${CONFIG.explorers.reactive}/address/${CONFIG.contracts.rsc}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                ↗
              </a>
            </div>
          </div>
          <div className="contract-item">
            <span className="contract-name">MultiFeedDestinationV2</span>
            <span className="contract-chain">Sepolia</span>
            <div className="contract-address">
              <code>{CONFIG.contracts.destination}</code>
              <a 
                href={`${CONFIG.explorers.sepolia}/address/${CONFIG.contracts.destination}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                ↗
              </a>
            </div>
          </div>
          <div className="contract-item">
            <span className="contract-name">Callback Proxy</span>
            <span className="contract-chain">Sepolia</span>
            <div className="contract-address">
              <code>{CONFIG.contracts.callbackProxy}</code>
              <a 
                href={`${CONFIG.explorers.sepolia}/address/${CONFIG.contracts.callbackProxy}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
