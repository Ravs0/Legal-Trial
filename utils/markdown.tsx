import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Canonical ReactMarkdown renderer using the brand design tokens.
 *
 * Replaces the identical-but-copied `renderMarkdown` functions in
 * StrategyRoomScreen, DraftingStudioScreen, and AIPersonasScreen.
 *
 * DreadlerArenaScreen intentionally uses a divergent dark-zinc theme
 * (red-400 / zinc-300) so it keeps its own copy.
 */
export function renderLegalMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  return (
    <ReactMarkdown
      components={{
        strong: ({ node, ...props }) => (
          <strong className="text-brand-accent font-semibold" {...props} />
        ),
        em: ({ node, ...props }) => (
          <em className="font-serif italic opacity-95" {...props} />
        ),
        ul: ({ node, ...props }) => (
          <ul className="list-disc pl-4 my-2 space-y-1" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal pl-4 my-2 space-y-1" {...props} />
        ),
        li: ({ node, ...props }) => <li className="" {...props} />,
        h1: ({ node, ...props }) => (
          <h1 className="text-lg font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-base font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="text-sm font-serif font-bold text-brand-text-primary mt-3 mb-1" {...props} />
        ),
        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        code: ({ node, className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          return !match ? (
            <code className="bg-brand-bg-secondary px-1 py-0.5 rounded text-xs font-mono" {...props}>
              {children}
            </code>
          ) : (
            <pre className="bg-brand-bg-secondary p-2 rounded text-xs font-mono overflow-x-auto">
              <code {...props}>{children}</code>
            </pre>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
