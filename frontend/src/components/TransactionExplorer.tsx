/**
 * Transaction Explorer Component
 * Browse and search cross-chain transactions
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONFIG } from '../config';
import { getExplorerUrl, truncateAddress } from '../api';

interface Transaction {
  hash: string;
  chain: 'origin' | 'reactive' | 'destination';
  chainName: string;
  blockNumber: number;
  timestamp: number;
  feed?: string;
  type: string;
  status: 'confirmed' | 'pending';
}

export default function TransactionExplorer() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>('all');
  const [selectedFeed, setSelectedFeed] = useState<string>('all');
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      // Fetch from all three chains in parallel
      const [originTxs, reactiveTxs, destTxs] = await Promise.all([
        fetchOriginTransactions(),
        fetchReactiveTransactions(),
        fetchDestinationTransactions(),
      ]);
      
      const allTxs = [...originTxs, ...reactiveTxs, ...destTxs]
        .sort((a, b) => b.timestamp - a.timestamp);
      
      setTransactions(allTxs);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOriginTransactions = async (): Promise<Transaction[]> => {
    // For demo, return sample transactions - in production this would query the chain
    const sampleTxs: Transaction[] = [];
    
    for (const [key] of Object.entries(CONFIG.feeds)) {
      sampleTxs.push({
        hash: CONFIG.sampleTxs.origin,
        chain: 'origin',
        chainName: 'Base Sepolia',
        blockNumber: 20584021,
        timestamp: Date.now() / 1000 - Math.random() * 3600,
        feed: key,
        type: 'AnswerUpdated',
        status: 'confirmed'
      });
    }
    
    return sampleTxs;
  };

  const fetchReactiveTransactions = async (): Promise<Transaction[]> => {
    return [{
      hash: CONFIG.sampleTxs.reactive,
      chain: 'reactive',
      chainName: 'Reactive Lasna',
      blockNumber: 5821532,
      timestamp: Date.now() / 1000 - Math.random() * 3600,
      type: 'react()',
      status: 'confirmed'
    }];
  };

  const fetchDestinationTransactions = async (): Promise<Transaction[]> => {
    return [{
      hash: CONFIG.sampleTxs.destination,
      chain: 'destination',
      chainName: 'Sepolia',
      blockNumber: 7421837,
      timestamp: Date.now() / 1000 - Math.random() * 3600,
      type: 'FeedUpdated',
      status: 'confirmed'
    }];
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTxs = transactions.filter(tx => {
    if (selectedChain !== 'all' && tx.chain !== selectedChain) return false;
    if (selectedFeed !== 'all' && tx.feed !== selectedFeed) return false;
    return true;
  });

  const getChainColor = (chain: string) => {
    switch (chain) {
      case 'origin': return '#0052ff';
      case 'reactive': return '#00ffd5';
      case 'destination': return '#627eea';
      default: return '#888';
    }
  };

  const getExplorerForChain = (chain: string): 'sepolia' | 'baseSepolia' | 'reactive' => {
    switch (chain) {
      case 'origin': return 'baseSepolia';
      case 'reactive': return 'reactive';
      default: return 'sepolia';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <div className="tx-explorer">
      <div className="explorer-header">
        <h3>
          <span className="icon">⟁</span>
          Transaction Explorer
        </h3>
        <div className="explorer-actions">
          <button 
            className="refresh-btn"
            onClick={fetchTransactions}
            disabled={loading}
          >
            {loading ? '↻' : '⟳'} Refresh
          </button>
        </div>
      </div>

      <div className="explorer-filters">
        <div className="filter-group">
          <label>Chain</label>
          <select 
            value={selectedChain} 
            onChange={(e) => setSelectedChain(e.target.value)}
          >
            <option value="all">All Chains</option>
            <option value="origin">Base Sepolia (Origin)</option>
            <option value="reactive">Reactive Lasna</option>
            <option value="destination">Sepolia (Destination)</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Feed</label>
          <select 
            value={selectedFeed} 
            onChange={(e) => setSelectedFeed(e.target.value)}
          >
            <option value="all">All Feeds</option>
            <option value="ETH">ETH/USD</option>
            <option value="BTC">BTC/USD</option>
            <option value="LINK">LINK/USD</option>
          </select>
        </div>
        <div className="filter-stats">
          Showing {filteredTxs.length} of {transactions.length} transactions
        </div>
      </div>

      <div className="tx-list">
        <AnimatePresence>
          {filteredTxs.map((tx) => (
            <motion.div
              key={`${tx.hash}-${tx.chain}`}
              className={`tx-item ${expandedTx === tx.hash ? 'expanded' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpandedTx(expandedTx === tx.hash ? null : tx.hash)}
              layout
            >
              <div className="tx-main">
                <div 
                  className="chain-indicator" 
                  style={{ backgroundColor: getChainColor(tx.chain) }}
                />
                <div className="tx-info">
                  <div className="tx-hash">
                    <a 
                      href={getExplorerUrl(getExplorerForChain(tx.chain), 'tx', tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {truncateAddress(tx.hash, 10)}
                    </a>
                  </div>
                  <div className="tx-meta">
                    <span className="tx-chain">{tx.chainName}</span>
                    <span className="tx-type">{tx.type}</span>
                    {tx.feed && <span className="tx-feed">{tx.feed}/USD</span>}
                  </div>
                </div>
                <div className="tx-right">
                  <span className={`tx-status ${tx.status}`}>
                    {tx.status === 'confirmed' ? '✓ Confirmed' : '◌ Pending'}
                  </span>
                  <span className="tx-time">{formatTime(tx.timestamp)}</span>
                </div>
              </div>
              
              <AnimatePresence>
                {expandedTx === tx.hash && (
                  <motion.div
                    className="tx-details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <div className="detail-grid">
                      <div className="detail">
                        <span className="label">Full Hash</span>
                        <code className="value">{tx.hash}</code>
                      </div>
                      <div className="detail">
                        <span className="label">Block Number</span>
                        <span className="value">{tx.blockNumber.toLocaleString()}</span>
                      </div>
                      <div className="detail">
                        <span className="label">Chain ID</span>
                        <span className="value">
                          {tx.chain === 'origin' ? '84532' : tx.chain === 'reactive' ? '5318007' : '11155111'}
                        </span>
                      </div>
                      <a 
                        href={getExplorerUrl(getExplorerForChain(tx.chain), 'tx', tx.hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="explorer-btn"
                      >
                        View on Explorer ↗
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredTxs.length === 0 && !loading && (
          <div className="no-txs">
            <span className="icon">◌</span>
            <span>No transactions found</span>
          </div>
        )}
        
        {loading && (
          <div className="loading-txs">
            <div className="loading-spinner"></div>
            <span>Fetching transactions...</span>
          </div>
        )}
      </div>
    </div>
  );
}
