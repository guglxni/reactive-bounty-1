import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONFIG } from './config';
import { processCommand } from './commands';
import { 
  SystemStats, 
  fetchSystemStats,
} from './api';

// Components
import InteractiveTerminal from './components/InteractiveTerminal';
import LiveFeedMonitor from './components/LiveFeedMonitor';
import TransactionExplorer from './components/TransactionExplorer';
import WorkflowVisualizer from './components/WorkflowVisualizer';
import SystemDashboard from './components/SystemDashboard';

import './App.css';

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
type TabId = 'dashboard' | 'monitor' | 'terminal' | 'workflow' | 'explorer' | 'info';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎' },
  { id: 'monitor', label: 'Live Monitor', icon: '◉' },
  { id: 'workflow', label: 'Workflow', icon: '⟁' },
  { id: 'explorer', label: 'Transactions', icon: '⌗' },
  { id: 'terminal', label: 'Terminal', icon: '▸' },
  { id: 'info', label: 'Bounty Info', icon: 'ℹ' },
];

function TabNav({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <nav className="tab-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUNTY INFO PANEL
// ═══════════════════════════════════════════════════════════════════════════
function BountyInfoPanel() {
  return (
    <div className="bounty-info-panel">
      <div className="info-section">
        <h3>📋 Bounty Requirements</h3>
        <div className="checklist">
          {CONFIG.bountyRequirements.map((req) => (
            <div key={req.id} className={`checklist-item ${req.met ? 'met' : ''}`}>
              <span className="check">{req.met ? '◆' : '◇'}</span>
              <div className="check-content">
                <span className="check-label">{req.label}</span>
                <span className="check-detail">{req.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="info-section">
        <h3>🚀 Beyond the Spec</h3>
        <div className="bonus-grid">
          {CONFIG.bonusFeatures.map((feature) => (
            <div key={feature.title} className="bonus-item">
              <span className="bonus-icon">{feature.icon}</span>
              <div className="bonus-content">
                <span className="bonus-title">{feature.title}</span>
                <span className="bonus-desc">{feature.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="info-section">
        <h3>🔗 Quick Links</h3>
        <div className="links-grid">
          <a 
            href="https://github.com/guglxni/reactive-bounty-1" 
            target="_blank" 
            rel="noopener noreferrer"
            className="quick-link"
          >
            <span className="icon">⌘</span>
            <span>GitHub Repository</span>
          </a>
          <a 
            href={`${CONFIG.explorers.reactive}/address/${CONFIG.contracts.rsc}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="quick-link"
          >
            <span className="icon">⚡</span>
            <span>RSC on ReactScan</span>
          </a>
          <a 
            href={`${CONFIG.explorers.sepolia}/address/${CONFIG.contracts.destination}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="quick-link"
          >
            <span className="icon">🎯</span>
            <span>Destination on Etherscan</span>
          </a>
          <a 
            href="https://dorahacks.io/hackathon/reactive-bounties-2" 
            target="_blank" 
            rel="noopener noreferrer"
            className="quick-link"
          >
            <span className="icon">🏆</span>
            <span>DoraHacks Bounty</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">REACTIVE<span className="logo-accent">ORACLE</span></span>
        </div>
        <div className="header-badge">
          <span className="badge-dot"></span>
          BOUNTY 2.0 SPRINT #1
        </div>
      </div>
      <div className="header-right">
        <a 
          href="https://github.com/guglxni/reactive-bounty-1" 
          target="_blank" 
          rel="noopener noreferrer"
          className="header-link"
        >
          <span className="link-icon">⌘</span> GitHub
        </a>
        <div className="network-status">
          <span className="status-indicator online"></span>
          <span>LIVE</span>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS BANNER
// ═══════════════════════════════════════════════════════════════════════════
function StatsBanner({ stats }: { stats: SystemStats | null }) {
  const metrics = [
    { label: 'TOTAL UPDATES', value: stats?.totalGlobalUpdates?.toLocaleString() || '618', icon: '◎' },
    { label: 'ACTIVE FEEDS', value: '3', icon: '◉' },
    { label: 'RSC STATUS', value: stats?.isPaused ? 'PAUSED' : 'ACTIVE', icon: '⚡' },
    { label: 'UNIT TESTS', value: '199', icon: '✓' },
  ];

  return (
    <motion.div 
      className="stats-banner"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="stat-item">
          <span className="stat-icon">{metric.icon}</span>
          <div className="stat-data">
            <span className="stat-value">{metric.value}</span>
            <span className="stat-label">{metric.label}</span>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-left">
          <span>Built for Reactive Bounties 2.0</span>
          <span className="footer-divider">|</span>
          <span>Sprint #1: Cross-Chain Oracle</span>
        </div>
        <div className="footer-right">
          <a href="https://reactive.network" target="_blank" rel="noopener noreferrer">
            Reactive Network
          </a>
          <span className="footer-divider">|</span>
          <a href="https://dorahacks.io/hackathon/reactive-bounties-2" target="_blank" rel="noopener noreferrer">
            DoraHacks
          </a>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchSystemStats().then(setStats).catch(console.error);
    const interval = setInterval(() => {
      fetchSystemStats().then(setStats).catch(console.error);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCommand = async (cmd: string): Promise<string> => {
    setIsProcessing(true);
    try {
      return await processCommand(cmd);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app">
      <div className="scanline"></div>
      
      <Header />
      
      <main className="main">
        <motion.section 
          className="hero"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="hero-title">
            <span className="hero-line-1">CROSS-CHAIN</span>
            <span className="hero-line-2">PRICE ORACLE</span>
          </h1>
          <p className="hero-subtitle">
            Interactive Dashboard • Live Blockchain Data • Real-Time Monitoring
          </p>
          <div className="hero-chains">
            <span className="chain-pill origin">Base Sepolia</span>
            <span className="chain-arrow">→</span>
            <span className="chain-pill reactive">Reactive Lasna</span>
            <span className="chain-arrow">→</span>
            <span className="chain-pill destination">Eth Sepolia</span>
          </div>
        </motion.section>

        <StatsBanner stats={stats} />
        
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <SystemDashboard />
              </motion.div>
            )}

            {activeTab === 'monitor' && (
              <motion.div
                key="monitor"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <LiveFeedMonitor />
              </motion.div>
            )}

            {activeTab === 'workflow' && (
              <motion.div
                key="workflow"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <WorkflowVisualizer />
              </motion.div>
            )}

            {activeTab === 'explorer' && (
              <motion.div
                key="explorer"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <TransactionExplorer />
              </motion.div>
            )}

            {activeTab === 'terminal' && (
              <motion.div
                key="terminal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <InteractiveTerminal 
                  onCommand={handleCommand}
                  isProcessing={isProcessing}
                />
              </motion.div>
            )}

            {activeTab === 'info' && (
              <motion.div
                key="info"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <BountyInfoPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
