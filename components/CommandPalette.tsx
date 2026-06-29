import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../constants';
import { CASES } from '../constants';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Precedents';
  title: string;
  description: string;
  shortcut?: string;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const currentPath = location.pathname;

  // Build command list based on context
  const getCommands = (): CommandItem[] => {
    const commands: CommandItem[] = [
      {
        id: 'nav-dashboard',
        category: 'Navigation',
        title: 'Go to Dashboard',
        description: 'Navigate to the main workspace hub.',
        action: () => navigate(ROUTES.HOME)
      },
      {
        id: 'nav-setup',
        category: 'Navigation',
        title: 'Start New Trial Session',
        description: 'Configure a new simulated courtroom trial.',
        action: () => navigate(ROUTES.SETUP)
      },
      {
        id: 'nav-personas',
        category: 'Navigation',
        title: 'Consult AI Personas',
        description: 'Talk to elite legal domain characters and experts.',
        action: () => navigate(ROUTES.PERSONAS)
      },
      {
        id: 'nav-strategy',
        category: 'Navigation',
        title: 'Open AI Strategy Room',
        description: 'Run Oracle deconstruction and multi-agent debates.',
        action: () => navigate(ROUTES.STRATEGY)
      },
      {
        id: 'nav-dreadler',
        category: 'Navigation',
        title: 'Enter Deception Arena',
        description: 'Interrogate witnesses under the Dreadler lie detector.',
        action: () => navigate(ROUTES.DREADLER)
      },
      {
        id: 'nav-drafting',
        category: 'Navigation',
        title: 'Open Drafting Practice Studio',
        description: 'Author plenteous legal petitions, plaints and briefs.',
        action: () => navigate(ROUTES.DRAFTING_STUDIO)
      },
      {
        id: 'nav-library',
        category: 'Navigation',
        title: 'Open Case Precedent Library',
        description: 'Browse legal codes, precedents, and scenarios.',
        action: () => navigate(ROUTES.LIBRARY)
      },
      {
        id: 'nav-judges',
        category: 'Navigation',
        title: 'View Presiding Judges Roster',
        description: 'Review philosophies of the sitting AI judges.',
        action: () => navigate(ROUTES.JUDGES)
      },
      {
        id: 'nav-opposing',
        category: 'Navigation',
        title: 'View Opposing Counsel Profiles',
        description: 'Analyze opposing counsel specialties.',
        action: () => navigate(ROUTES.OPPOSING_COUNSEL)
      }
    ];

    // Contextual Actions: Drafting Studio
    if (currentPath.includes(ROUTES.DRAFTING_STUDIO)) {
      commands.unshift(
        {
          id: 'action-focus-mode',
          category: 'Actions',
          title: 'Toggle Focus Mode',
          description: 'Collapse reference panel for full-screen editing.',
          shortcut: 'F',
          action: () => window.dispatchEvent(new CustomEvent('cmd-palette-toggle-focus-mode'))
        },
        {
          id: 'action-save-snapshot',
          category: 'Actions',
          title: 'Save Draft Version Snapshot',
          description: 'Save current editor text to history.',
          shortcut: 'S',
          action: () => window.dispatchEvent(new CustomEvent('cmd-palette-save-snapshot'))
        }
      );
    }

    // Contextual Actions: Practice Arena
    if (currentPath.includes(ROUTES.PRACTICE)) {
      commands.unshift(
        {
          id: 'action-raise-objection',
          category: 'Actions',
          title: 'Raise Formal Objection',
          description: 'Object to opposing counsel\'s submission.',
          shortcut: 'O',
          action: () => window.dispatchEvent(new CustomEvent('cmd-palette-raise-objection'))
        },
        {
          id: 'action-end-early',
          category: 'Actions',
          title: 'End Mock Trial Session',
          description: 'Conclude and trigger performance analysis.',
          action: () => window.dispatchEvent(new CustomEvent('cmd-palette-end-early'))
        }
      );
    }

    // Append Precedent Cases
    CASES.forEach(c => {
      commands.push({
        id: `case-${c.id}`,
        category: 'Precedents',
        title: `Precedent: ${c.title}`,
        description: c.briefFacts.substring(0, 75) + '...',
        action: () => {
          navigate(ROUTES.LIBRARY);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('cmd-palette-select-case', { detail: { caseId: c.id } }));
          }, 150);
        }
      });
    });

    return commands;
  };

  const filteredCommands = getCommands().filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        setIsOpen(false);
      }
    }
  };

  useEffect(() => {
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-[#0D0F12]/90 flex items-start justify-center z-[99999] p-4 sm:p-10 pt-16 sm:pt-24"
      onClick={() => setIsOpen(false)}
    >
      <div 
        className="w-full max-w-2xl bg-brand-bg-primary border-2 border-brand-accent rounded-xl shadow-[6px_6px_0px_0px_#FF5A1F] flex flex-col max-h-[480px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-brand-text-primary/30 bg-brand-bg-secondary flex-shrink-0">
          <svg className="w-5 h-5 text-brand-text-secondary/70 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, screens, or precedent cases..."
            className="w-full bg-transparent text-sm text-brand-text-primary outline-none placeholder-brand-text-secondary/35 font-light"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 border border-brand-text-primary/30 text-[9px] font-mono text-brand-text-secondary uppercase">ESC</kbd>
        </div>

        {/* Command list */}
        <div ref={listRef} className="flex-grow overflow-y-auto custom-scrollbar p-2.5 space-y-1">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start justify-between border transition-all rounded-xl
                    ${isSelected 
                      ? 'bg-brand-accent/10 border-brand-accent text-brand-text-primary' 
                      : 'bg-transparent border-transparent text-brand-text-secondary'
                    }`}
                >
                  <div className="min-w-0 flex-grow pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 border
                        ${isSelected ? 'border-brand-accent/50 text-brand-accent bg-brand-bg-primary' : 'border-brand-text-primary/10 bg-brand-bg-secondary text-brand-text-secondary/60'}`}>
                        {cmd.category}
                      </span>
                      <span className="text-xs font-serif font-bold truncate">{cmd.title}</span>
                    </div>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-brand-text-primary/70' : 'text-brand-text-secondary/50'}`}>
                      {cmd.description}
                    </p>
                  </div>
                  {cmd.shortcut && (
                    <kbd className={`px-1.5 py-0.5 border text-[9px] font-mono flex-shrink-0 uppercase
                      ${isSelected ? 'border-brand-accent/40 text-brand-accent' : 'border-brand-text-primary/10 text-brand-text-secondary/30'}`}>
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          ) : (
            <div className="p-8 text-center text-brand-text-secondary/50 font-light text-xs">
              No matching commands or precedents found.
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-brand-text-primary/30 bg-brand-bg-secondary/60 text-[9px] font-mono text-brand-text-secondary/40 flex justify-between items-center flex-shrink-0">
          <span>↑↓ to navigate · Enter to select</span>
          <span>Cmd+K to toggle</span>
        </div>
      </div>
    </div>
  );
};
