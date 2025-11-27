/**
 * Interactive Terminal Component
 * A command-line style interface for interacting with the oracle system
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TerminalLine {
  id: number;
  type: 'command' | 'output' | 'error' | 'info' | 'success';
  content: string;
  timestamp: Date;
}

interface InteractiveTerminalProps {
  onCommand: (cmd: string) => Promise<string>;
  isProcessing: boolean;
}

const COMMANDS_HELP = `
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
`;

export default function InteractiveTerminal({ onCommand, isProcessing }: InteractiveTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 0,
      type: 'info',
      content: '╔═══════════════════════════════════════════════════════════════╗',
      timestamp: new Date()
    },
    {
      id: 1,
      type: 'info',
      content: '║  REACTIVE ORACLE TERMINAL v2.0                                ║',
      timestamp: new Date()
    },
    {
      id: 2,
      type: 'info',
      content: '║  Cross-Chain Price Oracle Interactive Console                 ║',
      timestamp: new Date()
    },
    {
      id: 3,
      type: 'info',
      content: '╚═══════════════════════════════════════════════════════════════╝',
      timestamp: new Date()
    },
    {
      id: 4,
      type: 'success',
      content: 'Connected to Reactive Network, Base Sepolia, and Ethereum Sepolia',
      timestamp: new Date()
    },
    {
      id: 5,
      type: 'info',
      content: 'Type "help" for available commands',
      timestamp: new Date()
    },
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lineIdRef = useRef(6);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addLine = (type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, {
      id: lineIdRef.current++,
      type,
      content,
      timestamp: new Date()
    }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const cmd = input.trim().toLowerCase();
    setCommandHistory(prev => [...prev, cmd]);
    setHistoryIndex(-1);
    addLine('command', `> ${input}`);
    setInput('');

    // Handle local commands
    if (cmd === 'clear') {
      setLines([]);
      return;
    }

    if (cmd === 'help') {
      addLine('output', COMMANDS_HELP);
      return;
    }

    // Process remote commands
    try {
      const result = await onCommand(cmd);
      addLine('output', result);
    } catch (error) {
      addLine('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  };

  return (
    <div className="terminal-container" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-header">
        <div className="terminal-buttons">
          <span className="btn-close"></span>
          <span className="btn-minimize"></span>
          <span className="btn-maximize"></span>
        </div>
        <span className="terminal-title">reactive-oracle — zsh</span>
        <span className="terminal-status">
          {isProcessing ? '⏳ Processing...' : '● Ready'}
        </span>
      </div>
      
      <div className="terminal-body" ref={terminalRef}>
        <AnimatePresence>
          {lines.map((line) => (
            <motion.div
              key={line.id}
              className={`terminal-line ${line.type}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
            >
              <pre>{line.content}</pre>
            </motion.div>
          ))}
        </AnimatePresence>
        
        <form onSubmit={handleSubmit} className="terminal-input-line">
          <span className="prompt">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={isProcessing ? 'Processing...' : 'Enter command...'}
            autoComplete="off"
            spellCheck={false}
          />
          {isProcessing && <span className="cursor-blink">▌</span>}
        </form>
      </div>
    </div>
  );
}
