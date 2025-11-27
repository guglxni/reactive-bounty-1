/**
 * Workflow Visualizer Component
 * Interactive cross-chain workflow visualization with live transaction data
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CONFIG } from '../config';
import { getExplorerUrl, truncateAddress } from '../api';

interface WorkflowStep {
  id: number;
  chain: string;
  chainId: string;
  title: string;
  description: string;
  contract: string;
  contractName: string;
  event: string;
  tx?: string;
  status: 'pending' | 'processing' | 'complete';
  color: string;
  explorer: 'baseSepolia' | 'reactive' | 'sepolia';
}

export default function WorkflowVisualizer() {
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 1,
      chain: 'BASE SEPOLIA',
      chainId: '84532',
      title: 'Origin Event',
      description: 'Chainlink Aggregator emits AnswerUpdated event when new price data is posted',
      contract: CONFIG.feeds.ETH.address,
      contractName: 'Chainlink ETH/USD Aggregator',
      event: 'AnswerUpdated(int256 current, uint256 roundId, uint256 updatedAt)',
      tx: CONFIG.sampleTxs.origin,
      status: 'complete',
      color: '#0052ff',
      explorer: 'baseSepolia',
    },
    {
      id: 2,
      chain: 'REACTIVE LASNA',
      chainId: '5318007',
      title: 'RSC Processing',
      description: 'MultiFeedMirrorRCv2 receives event replay and executes react() function',
      contract: CONFIG.contracts.rsc,
      contractName: 'MultiFeedMirrorRCv2',
      event: 'react() → emit Callback()',
      tx: CONFIG.sampleTxs.reactive,
      status: 'complete',
      color: '#00ffd5',
      explorer: 'reactive',
    },
    {
      id: 3,
      chain: 'SEPOLIA',
      chainId: '11155111',
      title: 'Callback Delivery',
      description: 'Reactive Network delivers callback through proxy to destination contract',
      contract: CONFIG.contracts.destination,
      contractName: 'MultiFeedDestinationV2',
      event: 'FeedUpdated(address feedAddress, uint80 roundId, int256 answer, uint256 updatedAt)',
      tx: CONFIG.sampleTxs.destination,
      status: 'complete',
      color: '#627eea',
      explorer: 'sepolia',
    },
  ]);

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const simulateWorkflow = async () => {
    setIsAnimating(true);
    
    // Reset all to pending
    setSteps(prev => prev.map(s => ({ ...s, status: 'pending' as const })));
    
    // Animate through each step
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 800));
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx === i ? 'processing' as const : idx < i ? 'complete' as const : 'pending' as const
      })));
      
      await new Promise(r => setTimeout(r, 1200));
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx <= i ? 'complete' as const : 'pending' as const
      })));
    }
    
    setIsAnimating(false);
  };

  return (
    <div className="workflow-visualizer">
      <div className="visualizer-header">
        <h3>
          <span className="icon">⟁</span>
          Cross-Chain Workflow
        </h3>
        <button 
          className="simulate-btn"
          onClick={simulateWorkflow}
          disabled={isAnimating}
        >
          {isAnimating ? '⏳ Simulating...' : '▶ Simulate Flow'}
        </button>
      </div>

      <div className="workflow-timeline">
        {steps.map((step, i) => (
          <motion.div
            key={step.id}
            className={`timeline-step ${step.status} ${selectedStep === step.id ? 'selected' : ''}`}
            onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
            whileHover={{ scale: 1.02 }}
          >
            <div className="step-connector">
              {i > 0 && (
                <svg className="connector-line" viewBox="0 0 100 20">
                  <defs>
                    <linearGradient id={`grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={steps[i-1].color} />
                      <stop offset="100%" stopColor={step.color} />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d="M0 10 L90 10 M80 5 L90 10 L80 15"
                    stroke={`url(#grad-${i})`}
                    strokeWidth="2"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: step.status !== 'pending' ? 1 : 0 }}
                    transition={{ duration: 0.5 }}
                  />
                </svg>
              )}
            </div>
            
            <div className="step-node" style={{ borderColor: step.color }}>
              <motion.div
                className="node-inner"
                style={{ backgroundColor: step.status === 'complete' ? step.color : 'transparent' }}
                animate={{
                  scale: step.status === 'processing' ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  repeat: step.status === 'processing' ? Infinity : 0,
                  duration: 0.6,
                }}
              >
                {step.status === 'complete' ? '✓' : step.status === 'processing' ? '◎' : step.id}
              </motion.div>
            </div>
            
            <div className="step-content">
              <div className="step-chain" style={{ color: step.color }}>
                {step.chain}
                <span className="chain-id">ID: {step.chainId}</span>
              </div>
              <h4>{step.title}</h4>
              <p>{step.description}</p>
              
              {step.tx && (
                <a 
                  href={getExplorerUrl(step.explorer, 'tx', step.tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="tx-hash">{truncateAddress(step.tx, 8)}</span>
                  <span className="tx-arrow">↗</span>
                </a>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {selectedStep && (
        <motion.div
          className="step-details-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {(() => {
            const step = steps.find(s => s.id === selectedStep)!;
            return (
              <>
                <h4 style={{ color: step.color }}>{step.title} Details</h4>
                <div className="details-grid">
                  <div className="detail">
                    <span className="label">Contract</span>
                    <span className="value">{step.contractName}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Address</span>
                    <a 
                      href={getExplorerUrl(step.explorer, 'address', step.contract)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="value link"
                    >
                      {step.contract} ↗
                    </a>
                  </div>
                  <div className="detail">
                    <span className="label">Event/Function</span>
                    <code className="value">{step.event}</code>
                  </div>
                  {step.tx && (
                    <div className="detail">
                      <span className="label">Transaction</span>
                      <a 
                        href={getExplorerUrl(step.explorer, 'tx', step.tx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="value link"
                      >
                        {step.tx} ↗
                      </a>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      <div className="workflow-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#0052ff' }}></span>
          <span>Origin Chain (Base Sepolia)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#00ffd5' }}></span>
          <span>Reactive Network (Lasna)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#627eea' }}></span>
          <span>Destination Chain (Sepolia)</span>
        </div>
      </div>
    </div>
  );
}
