import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../routes';
import { CASES, INTERNATIONAL_CASES } from '../constants';
import { loadActiveSession } from '../services/storageService';
import { useVisualViewport } from '../hooks/useVisualViewport';
import type { PracticeMode } from '../types';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Precedents';
  title: string;
  description: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Monochrome keyboard focus ring (white outline only). */
const focusRing =
  'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/35';

function readPracticeMode(): PracticeMode | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('practiceMode') as PracticeMode | null;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<PracticeMode | null>(() => readPracticeMode());
  const { viewportHeight, isMobile } = useVisualViewport();

  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listboxId = useId();
  const labelId = useId();

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const syncActiveSession = () => {
      const activeSession = loadActiveSession();
      setActiveSessionLabel(activeSession?.settings.caseDetail.title || null);
      setPracticeMode(readPracticeMode());
    };

    syncActiveSession();
    window.addEventListener('focus', syncActiveSession);
    window.addEventListener('storage', syncActiveSession);
    return () => {
      window.removeEventListener('focus', syncActiveSession);
      window.removeEventListener('storage', syncActiveSession);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('cmd-palette-open', handleOpen);
    window.addEventListener('cmd-palette-close', handleClose);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('cmd-palette-open', handleOpen);
      window.removeEventListener('cmd-palette-close', handleClose);
    };
  }, []);

  // Open / close: focus, scroll lock, restore focus
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSearch('');
    setSelectedIndex(0);
    setPracticeMode(readPracticeMode());

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  // Escape + focus trap while open
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, close]);

  const currentPath = location.pathname;

  const commands = useMemo((): CommandItem[] => {
    const caseCatalog = practiceMode === 'international' ? INTERNATIONAL_CASES : CASES;
    const hasSession = Boolean(activeSessionLabel);

    const run = (fn: () => void) => () => {
      fn();
      setIsOpen(false);
    };

    const list: CommandItem[] = [
      {
        id: 'nav-dashboard',
        category: 'Navigation',
        title: 'Go to Dashboard',
        description: 'Practice loop hub: demo, resume, and progress.',
        action: run(() => navigate(ROUTES.HOME)),
      },
      {
        id: 'nav-setup',
        category: 'Navigation',
        title: 'Start New Trial Session',
        description: 'Configure a new simulated courtroom trial.',
        action: run(() => navigate(ROUTES.SETUP)),
      },
      {
        id: 'nav-resume',
        category: 'Navigation',
        title: hasSession ? 'Resume Active Session' : 'No Active Session',
        description: hasSession
          ? `Return to ${activeSessionLabel}.`
          : 'No saved in-progress courtroom session is available right now.',
        disabled: !hasSession,
        action: run(() => {
          if (hasSession) navigate(ROUTES.PRACTICE);
        }),
      },
      {
        id: 'nav-analysis',
        category: 'Navigation',
        title: 'Review Performance',
        description: 'Open scorecards, transcripts, and exports.',
        action: run(() => navigate(ROUTES.ANALYSIS)),
      },
      {
        id: 'nav-library',
        category: 'Navigation',
        title: 'Open Case Library',
        description: 'Browse scenarios and start a trial from a case.',
        action: run(() => navigate(ROUTES.LIBRARY)),
      },
      {
        id: 'nav-drafting',
        category: 'Navigation',
        title: 'Open Drafting Studio',
        description: 'Draft petitions, plaints, memorials, and briefs with AI feedback.',
        action: run(() => navigate(ROUTES.DRAFTING_STUDIO)),
      },
      {
        id: 'nav-research-ide',
        category: 'Navigation',
        title: 'Open Research IDE',
        description: 'Split-view research workspace with AI grounding.',
        action: run(() => navigate(ROUTES.RESEARCH_IDE)),
      },
      ...(practiceMode === 'indian'
        ? [{
            id: 'nav-court-sources',
            category: 'Navigation' as const,
            title: 'Court Sources',
            description: 'Official Indian court portal entry points (directory).',
            action: run(() => navigate(ROUTES.COURT_SOURCES)),
          }]
        : []),
      {
        id: 'nav-strategy',
        category: 'Navigation',
        title: 'Open Strategy Room',
        description: 'Oracle deconstruction and multi-agent debate.',
        action: run(() => navigate(ROUTES.STRATEGY)),
      },
      {
        id: 'nav-personas',
        category: 'Navigation',
        title: 'Consult AI Personas',
        description: 'Domain advisors and specialized counsel chat.',
        action: run(() => navigate(ROUTES.PERSONAS)),
      },
      {
        id: 'nav-dreadler',
        category: 'Navigation',
        title: 'Enter Deception Arena',
        description: 'Interrogate witnesses under the Dreadler engine.',
        action: run(() => navigate(ROUTES.DREADLER)),
      },
      {
        id: 'nav-bench',
        category: 'Navigation',
        title: 'Bench & Counsel Roster',
        description: 'Review AI judges and opposing counsel profiles.',
        action: run(() => navigate(ROUTES.BENCH)),
      },
    ];

    if (currentPath.includes(ROUTES.DRAFTING_STUDIO)) {
      list.unshift(
        {
          id: 'action-focus-mode',
          category: 'Actions',
          title: 'Toggle Focus Mode',
          description: 'Collapse reference panel for full-screen editing.',
          shortcut: 'F',
          action: run(() => window.dispatchEvent(new CustomEvent('cmd-palette-toggle-focus-mode'))),
        },
        {
          id: 'action-save-snapshot',
          category: 'Actions',
          title: 'Save Draft Version Snapshot',
          description: 'Save current editor text to history.',
          shortcut: 'S',
          action: run(() => window.dispatchEvent(new CustomEvent('cmd-palette-save-snapshot'))),
        },
      );
    }

    if (currentPath.includes(ROUTES.PRACTICE)) {
      list.unshift(
        {
          id: 'action-raise-objection',
          category: 'Actions',
          title: 'Raise Formal Objection',
          description: "Object to opposing counsel's submission.",
          shortcut: 'O',
          action: run(() => window.dispatchEvent(new CustomEvent('cmd-palette-raise-objection'))),
        },
        {
          id: 'action-end-early',
          category: 'Actions',
          title: 'End Mock Trial Session',
          description: 'Conclude and trigger performance analysis.',
          action: run(() => window.dispatchEvent(new CustomEvent('cmd-palette-end-early'))),
        },
      );
    }

    if (currentPath.includes(ROUTES.LIBRARY) || currentPath.includes(ROUTES.SETUP)) {
      caseCatalog.forEach(c => {
        list.push({
          id: `case-${c.id}`,
          category: 'Precedents',
          title: `Case: ${c.title}`,
          description: `${c.briefFacts.substring(0, 75)}...`,
          action: run(() => {
            window.dispatchEvent(new CustomEvent('cmd-palette-select-case', { detail: { caseId: c.id } }));
          }),
        });
      });
    }

    return list;
  }, [currentPath, activeSessionLabel, practiceMode, navigate]);

  const mobilePanelStyle = useMemo(
    () =>
      isMobile
        ? {
            height: `${Math.max(280, Math.min(Math.round(viewportHeight * 0.78), viewportHeight - 16))}px`,
            maxHeight: `${Math.max(280, viewportHeight - 16)}px`,
          }
        : undefined,
    [isMobile, viewportHeight],
  );

  const filteredCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      c =>
        c.title.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q)
        || c.category.toLowerCase().includes(q),
    );
  }, [commands, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (filteredCommands.length === 0) {
      if (selectedIndex !== 0) setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(filteredCommands.length - 1);
    }
  }, [filteredCommands, selectedIndex]);

  // Prefer first enabled item when selection lands on disabled
  useEffect(() => {
    if (filteredCommands.length === 0) return;
    const current = filteredCommands[selectedIndex];
    if (current && !current.disabled) return;
    const nextEnabled = filteredCommands.findIndex(c => !c.disabled);
    if (nextEnabled >= 0 && nextEnabled !== selectedIndex) {
      setSelectedIndex(nextEnabled);
    }
  }, [filteredCommands, selectedIndex]);

  const moveSelection = useCallback(
    (delta: number) => {
      if (filteredCommands.length === 0) return;
      const len = filteredCommands.length;
      let idx = selectedIndex;
      for (let i = 0; i < len; i += 1) {
        idx = (idx + delta + len) % len;
        if (!filteredCommands[idx]?.disabled) {
          setSelectedIndex(idx);
          return;
        }
      }
    },
    [filteredCommands, selectedIndex],
  );

  const runSelected = useCallback(() => {
    const cmd = filteredCommands[selectedIndex];
    if (!cmd || cmd.disabled) return;
    cmd.action();
  }, [filteredCommands, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = filteredCommands.findIndex(c => !c.disabled);
      if (first >= 0) setSelectedIndex(first);
    } else if (e.key === 'End') {
      e.preventDefault();
      for (let i = filteredCommands.length - 1; i >= 0; i -= 1) {
        if (!filteredCommands[i].disabled) {
          setSelectedIndex(i);
          break;
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected();
    }
  };

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  const activeOptionId =
    filteredCommands[selectedIndex] ? `${listboxId}-opt-${filteredCommands[selectedIndex].id}` : undefined;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/80 sm:items-start sm:p-10 sm:pt-24"
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={`${listboxId}-hint`}
        tabIndex={-1}
        className={`flex w-full flex-col overflow-hidden border border-white/15 bg-brand-bg-primary sm:max-h-[560px] sm:max-w-2xl sm:rounded-md sm:border-white/20 ${focusRing}`}
        style={mobilePanelStyle}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={labelId} className="sr-only">
          Command palette
        </h2>
        <p className="sr-only" id={`${listboxId}-hint`}>
          Use arrow keys to move, Enter to run a command, Escape to close.
        </p>

        <div className="flex items-center justify-between border-b border-white/10 bg-brand-bg-secondary px-4 py-2 sm:hidden">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-text-secondary">
              Quick Actions
            </p>
            <p className="text-xs text-brand-text-secondary/80">Search tools, routes, and live actions.</p>
          </div>
          <button
            type="button"
            onClick={close}
            className={`min-h-11 min-w-11 rounded-md px-2 text-xs font-medium text-brand-text-secondary transition-colors hover:text-brand-text-primary ${focusRing}`}
            aria-label="Close command palette"
          >
            Close
          </button>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 bg-brand-bg-secondary px-4 py-3">
          <svg className="h-5 w-5 text-brand-text-secondary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, screens, or cases..."
            aria-label="Search commands"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-describedby={`${listboxId}-hint`}
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            className={`w-full bg-transparent text-sm font-light text-brand-text-primary placeholder:text-brand-text-secondary/40 ${focusRing} rounded-sm`}
          />
          <kbd className="hidden border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-brand-text-secondary sm:inline-block" aria-hidden="true">
            ESC
          </kbd>
        </div>

        {activeSessionLabel && (
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#1c1914]/[0.04] px-4 py-2">
            <div className="min-w-0">
              <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-brand-text-secondary">
                Active Session
              </p>
              <p className="truncate text-xs text-brand-text-primary/90">{activeSessionLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigate(ROUTES.PRACTICE);
                close();
              }}
              className={`whitespace-nowrap border border-white/20 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-bg-primary transition-colors hover:bg-white/90 ${focusRing}`}
              aria-label={`Resume hearing: ${activeSessionLabel}`}
            >
              Resume
            </button>
          </div>
        )}

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Commands"
          className="custom-scrollbar flex-grow space-y-0.5 overflow-y-auto p-2"
        >
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = selectedIndex === idx;
              const optionId = `${listboxId}-opt-${cmd.id}`;
              return (
                <button
                  key={cmd.id}
                  id={optionId}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  aria-disabled={cmd.disabled || undefined}
                  disabled={cmd.disabled}
                  data-selected={isSelected ? 'true' : undefined}
                  onClick={() => {
                    if (!cmd.disabled) cmd.action();
                  }}
                  onMouseEnter={() => {
                    if (!cmd.disabled) setSelectedIndex(idx);
                  }}
                  className={`flex w-full items-start justify-between border px-3.5 py-3 text-left transition-colors sm:py-2.5 ${
                    cmd.disabled
                      ? 'cursor-not-allowed border-transparent text-brand-text-secondary/40 opacity-50'
                      : isSelected
                        ? 'border-white/25 bg-white text-brand-bg-primary'
                        : 'border-transparent bg-transparent text-brand-text-secondary hover:bg-[#1c1914]/[0.05] hover:text-brand-text-primary'
                  }`}
                >
                  <div className="min-w-0 flex-grow pr-3">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                          isSelected && !cmd.disabled
                            ? 'border-brand-bg-primary/20 bg-brand-bg-primary/10 text-brand-bg-primary/80'
                            : 'border-white/10 bg-brand-bg-secondary text-brand-text-secondary/60'
                        }`}
                      >
                        {cmd.category}
                      </span>
                      <span className={`truncate text-xs font-medium sm:text-sm ${isSelected && !cmd.disabled ? 'text-brand-bg-primary' : ''}`}>
                        {cmd.title}
                      </span>
                    </div>
                    <p
                      className={`text-[11px] sm:text-[10px] ${
                        isSelected && !cmd.disabled
                          ? 'text-brand-bg-primary/70'
                          : 'text-brand-text-secondary/55'
                      }`}
                    >
                      {cmd.description}
                    </p>
                  </div>
                  {cmd.shortcut && (
                    <kbd
                      className={`flex-shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                        isSelected && !cmd.disabled
                          ? 'border-brand-bg-primary/25 text-brand-bg-primary/80'
                          : 'border-white/10 text-brand-text-secondary/40'
                      }`}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs font-light text-brand-text-secondary/50" role="status">
              No matching commands or cases found.
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-brand-bg-secondary/60 px-4 py-2 font-mono text-[9px] text-brand-text-secondary/50">
          <span>↑↓ navigate · Enter select · Esc close</span>
          <span className="hidden sm:inline">⌘K toggle</span>
          <span className="sm:hidden">Tap a command</span>
        </div>
      </div>
    </div>
  );
};
