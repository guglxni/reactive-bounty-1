/**
 * Live Feed Monitor Component
 * Real-time price updates with force sync capability
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedData, fetchAllFeeds, formatPrice, formatTimeAgo, forceSyncFeed, forceSyncAllFeeds } from '../api';
import { CONFIG } from '../config';
import { 
  connectWallet, 
  disconnectWallet, 
  subscribeToWallet, 
  formatAddress, 
  getChainName,
  WalletState 
} from '../wallet';

interface PriceUpdate {
  feed: string;
  oldPrice: bigint | null;
  newPrice: bigint | null;
  timestamp: Date;
}

interface SyncStatus {
  syncing: boolean;
  feed: string | null;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function LiveFeedMonitor() {
  const [feeds, setFeeds] = useState<FeedData[]>([]);
  const [updates, setUpdates] = useState<PriceUpdate[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    chainId: null,
    provider: null,
    signer: null,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    syncing: false,
    feed: null,
    message: '',
    type: 'info',
  });

  // Subscribe to wallet changes
  useEffect(() => {
    const unsubscribe = subscribeToWallet(setWallet);
    return unsubscribe;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const newFeeds = await fetchAllFeeds();
      
      // Check for price changes
      if (feeds.length > 0) {
        newFeeds.forEach((newFeed, i) => {
          const oldFeed = feeds[i];
          if (oldFeed && newFeed.mirroredPrice !== oldFeed.mirroredPrice) {
            setUpdates(prev => [{
              feed: newFeed.symbol,
              oldPrice: oldFeed.mirroredPrice,
              newPrice: newFeed.mirroredPrice,
              timestamp: new Date()
            }, ...prev.slice(0, 9)]);
          }
        });
      }
      
      setFeeds(newFeeds);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch feeds:', error);
    } finally {
      setLoading(false);
    }
  }, [feeds]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!isWatching) return;
    
    const interval = setInterval(fetchData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isWatching, refreshInterval, fetchData]);

  const getSelectedFeed = () => {
    if (!selectedFeed) return null;
    return feeds.find(f => f.symbol === selectedFeed);
  };

  const handleConnect = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Connection failed:', error);
      setSyncStatus({
        syncing: false,
        feed: null,
        message: error instanceof Error ? error.message : 'Connection failed',
        type: 'error',
      });
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
  };

  const handleForceSyncSingle = async (feedAddress: string, symbol: string) => {
    if (!wallet.connected) {
      setSyncStatus({
        syncing: false,
        feed: null,
        message: 'Connect wallet to sync feeds',
        type: 'error',
      });
      return;
    }

    setSyncStatus({
      syncing: true,
      feed: symbol,
      message: `Syncing ${symbol}...`,
      type: 'info',
    });

    const result = await forceSyncFeed(feedAddress);

    if (result.success) {
      setSyncStatus({
        syncing: false,
        feed: symbol,
        message: `${symbol} synced! TX: ${result.txHash?.slice(0, 10)}...`,
        type: 'success',
      });
      setTimeout(fetchData, 3000);
    } else {
      setSyncStatus({
        syncing: false,
        feed: symbol,
        message: result.error || 'Sync failed',
        type: 'error',
      });
    }
  };

  const handleForceSyncAll = async () => {
    if (!wallet.connected) {
      setSyncStatus({
        syncing: false,
        feed: null,
        message: 'Connect wallet to sync feeds',
        type: 'error',
      });
      return;
    }

    setSyncStatus({
      syncing: true,
      feed: 'ALL',
      message: 'Syncing all feeds...',
      type: 'info',
    });

    const results = await forceSyncAllFeeds();
    const successCount = results.results.filter(r => r.success).length;

    setSyncStatus({
      syncing: false,
      feed: null,
      message: `Synced ${successCount}/${results.results.length} feeds`,
      type: successCount === results.results.length ? 'success' : 'error',
    });

    setTimeout(fetchData, 3000);
  };

  const staleCount = feeds.filter(f => f.isStale).length;
  const unsyncedCount = feeds.filter(f => !f.isSynced).length;

  // Helper to get status for a feed
  const getFeedStatus = (feed: FeedData) => {
    if (!feed.isSynced) return { label: 'DESYNCED', class: 'desynced' };
    if (feed.isStale) return { label: 'SYNCED', class: 'synced-stale' }; // Data is old but synced
    return { label: 'LIVE', class: 'live' };
  };

  return (
    <div className="feed-monitor">
      {/* Header Bar */}
      <div className="monitor-bar">
        <div className="bar-left">
          <div className="monitor-title">
            <span className="pulse-ring"></span>
            <span className="title-text">LIVE FEED MONITOR</span>
          </div>
          {staleCount > 0 && (
            <div className="stale-warning">
              <span className="warning-icon">⚠</span>
              <span>{staleCount} OLD DATA</span>
            </div>
          )}
          {unsyncedCount > 0 && (
            <div className="desync-warning">
              <span className="warning-icon">◇</span>
              <span>{unsyncedCount} DESYNCED</span>
            </div>
          )}
        </div>
        
        <div className="bar-right">
          {/* Wallet Connection */}
          {wallet.connected ? (
            <div className="wallet-connected">
              <span className="chain-badge">{getChainName(wallet.chainId)}</span>
              <span className="address-badge">{formatAddress(wallet.address)}</span>
              <button className="disconnect-btn" onClick={handleDisconnect}>×</button>
            </div>
          ) : (
            <button className="connect-wallet-btn" onClick={handleConnect}>
              <span className="wallet-icon">◈</span>
              Connect Wallet
            </button>
          )}
          
          {/* Controls */}
          <div className="control-group">
            <select 
              value={refreshInterval} 
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="interval-selector"
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
            
            <button 
              className={`toggle-btn ${isWatching ? 'active' : ''}`}
              onClick={() => setIsWatching(!isWatching)}
            >
              {isWatching ? '◼ Pause' : '▶ Watch'}
            </button>
            
            <button 
              className="sync-btn"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? '◌' : '↻'}
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      <AnimatePresence>
        {syncStatus.message && (
          <motion.div
            className={`sync-banner ${syncStatus.type}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {syncStatus.syncing && <span className="sync-spinner">◐</span>}
            <span>{syncStatus.message}</span>
            {!syncStatus.syncing && (
              <button onClick={() => setSyncStatus({ ...syncStatus, message: '' })}>×</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid */}
      <div className="monitor-content">
        {/* Feed Cards */}
        <div className="feeds-column">
          <div className="column-header">
            <span>PRICE FEEDS</span>
            {wallet.connected && unsyncedCount > 0 && (
              <button 
                className="sync-all-btn"
                onClick={handleForceSyncAll}
                disabled={syncStatus.syncing}
              >
                {syncStatus.syncing && syncStatus.feed === 'ALL' ? '◐' : '⟳'} Sync All
              </button>
            )}
          </div>
          
          <div className="feed-cards">
            {feeds.map((feed) => {
              const status = getFeedStatus(feed);
              return (
              <motion.div
                key={feed.address}
                className={`feed-card ${selectedFeed === feed.symbol ? 'selected' : ''} ${status.class}`}
                onClick={() => setSelectedFeed(selectedFeed === feed.symbol ? null : feed.symbol)}
                whileHover={{ scale: 1.01, x: 4 }}
                whileTap={{ scale: 0.99 }}
                layout
                style={{ '--feed-color': feed.color } as React.CSSProperties}
              >
                <div className="card-accent"></div>
                <div className="card-body">
                  <div className="card-top">
                    <div className="feed-identity">
                      <span className="feed-icon">{feed.icon}</span>
                      <span className="feed-name">{feed.symbol}</span>
                    </div>
                    <div className={`status-indicator ${status.class}`}>
                      <span className="dot"></span>
                      <span className="label">{status.label}</span>
                    </div>
                  </div>
                  
                  <div className="price-display">
                    <span className="price-value">{formatPrice(feed.mirroredPrice)}</span>
                    {feed.deviation !== null && (
                      <span className={`deviation ${Math.abs(feed.deviation) < 0.5 ? 'low' : 'high'}`}>
                        {feed.deviation > 0 ? '+' : ''}{feed.deviation.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="card-footer">
                    <span className="update-count">{feed.totalUpdates} updates</span>
                    <span className="last-sync">{formatTimeAgo(feed.updatedAt)}</span>
                  </div>
                </div>
                
                {/* Sync Button - show for desynced feeds */}
                {wallet.connected && !feed.isSynced && (
                  <button
                    className="force-sync-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleForceSyncSingle(feed.address, feed.symbol);
                    }}
                    disabled={syncStatus.syncing}
                  >
                    {syncStatus.syncing && syncStatus.feed === feed.symbol ? '◐' : '⟳'} Sync
                  </button>
                )}
              </motion.div>
            );})}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="detail-column">
          <div className="column-header">
            <span>{selectedFeed ? `${selectedFeed} DETAILS` : 'SELECT A FEED'}</span>
          </div>
          
          <AnimatePresence mode="wait">
            {selectedFeed && getSelectedFeed() ? (
              <motion.div
                key={selectedFeed}
                className="detail-panel"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="detail-section">
                  <div className="section-title">Price Comparison</div>
                  <div className="price-comparison">
                    <div className="comp-row">
                      <span className="comp-label">Origin (Base Sepolia)</span>
                      <span className="comp-value origin">{formatPrice(getSelectedFeed()!.originPrice)}</span>
                    </div>
                    <div className="comp-arrow">⬇</div>
                    <div className="comp-row">
                      <span className="comp-label">Mirrored (Sepolia)</span>
                      <span className="comp-value mirrored">{formatPrice(getSelectedFeed()!.mirroredPrice)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="detail-section">
                  <div className="section-title">Feed Statistics</div>
                  <div className="stat-grid">
                    <div className="stat-box">
                      <span className="stat-label">Deviation</span>
                      <span className={`stat-value ${Math.abs(getSelectedFeed()!.deviation || 0) < 0.5 ? 'good' : 'warn'}`}>
                        {getSelectedFeed()!.deviation !== null ? `${getSelectedFeed()!.deviation!.toFixed(4)}%` : '—'}
                      </span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Total Updates</span>
                      <span className="stat-value">{getSelectedFeed()!.totalUpdates}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Last Sync</span>
                      <span className="stat-value">{formatTimeAgo(getSelectedFeed()!.updatedAt)}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Round ID</span>
                      <span className="stat-value mono">{getSelectedFeed()!.roundId?.toString() || '—'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="detail-section">
                  <div className="section-title">Contract</div>
                  <a 
                    href={`${CONFIG.explorers.baseSepolia}/address/${getSelectedFeed()!.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contract-link"
                  >
                    <span className="contract-address">
                      {getSelectedFeed()!.address.slice(0, 14)}...{getSelectedFeed()!.address.slice(-12)}
                    </span>
                    <span className="link-arrow">↗</span>
                  </a>
                </div>

                {/* Force Sync for Selected */}
                {wallet.connected && !getSelectedFeed()!.isSynced && (
                  <button
                    className="detail-sync-btn"
                    onClick={() => handleForceSyncSingle(getSelectedFeed()!.address, getSelectedFeed()!.symbol)}
                    disabled={syncStatus.syncing}
                  >
                    {syncStatus.syncing && syncStatus.feed === selectedFeed ? (
                      <>◐ Syncing...</>
                    ) : (
                      <>⟳ Force Sync {selectedFeed}</>
                    )}
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div 
                className="no-selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="empty-state">
                  <span className="empty-icon">◇</span>
                  <span className="empty-text">Select a feed to view details</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Activity Column */}
        <div className="activity-column">
          <div className="column-header">
            <span>LIVE ACTIVITY</span>
            {isWatching && <span className="watching-badge">● WATCHING</span>}
          </div>
          
          <div className="activity-feed">
            {updates.length === 0 ? (
              <div className="no-activity">
                <div className="radar">
                  <span className="radar-ring"></span>
                  <span className="radar-center">◉</span>
                </div>
                <span className="waiting-text">Watching for updates...</span>
              </div>
            ) : (
              <AnimatePresence>
                {updates.map((update) => (
                  <motion.div
                    key={`${update.feed}-${update.timestamp.getTime()}`}
                    className="activity-item"
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <span className="activity-flash">⚡</span>
                    <div className="activity-details">
                      <span className="activity-feed-name">{update.feed}</span>
                      <span className="activity-change">
                        {formatPrice(update.oldPrice)} → {formatPrice(update.newPrice)}
                      </span>
                    </div>
                    <span className="activity-time">
                      {update.timestamp.toLocaleTimeString()}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="monitor-footer">
        <div className="footer-left">
          {isWatching ? (
            <>
              <span className="footer-pulse"></span>
              <span>Polling every {refreshInterval}s</span>
            </>
          ) : (
            <span>Monitoring paused</span>
          )}
        </div>
        <div className="footer-right">
          Last update: {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
        </div>
      </div>
    </div>
  );
}
