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

/** Allow only safe http(s)/mailto/relative URLs — blocks javascript:, data:, vbscript:. */
export function sanitizeMarkdownUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Protocol-relative and absolute http(s)
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  // In-page / relative paths
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed;
  }
  // Bare relative without scheme (e.g. "docs/foo")
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function renderLegalMarkdown(text: string | null | undefined): React.ReactNode {
  if (text == null) return null;
  const source = typeof text === 'string' ? text : String(text);
  if (!source.trim()) return null;

  return (
    <ReactMarkdown
      urlTransform={sanitizeMarkdownUrl}
      components={{
        strong: ({ node: _node, ...props }) => (
          <strong className="text-brand-accent font-semibold" {...props} />
        ),
        em: ({ node: _node, ...props }) => (
          <em className="font-serif italic opacity-95" {...props} />
        ),
        ul: ({ node: _node, ...props }) => (
          <ul className="list-disc pl-4 my-2 space-y-1" {...props} />
        ),
        ol: ({ node: _node, ...props }) => (
          <ol className="list-decimal pl-4 my-2 space-y-1" {...props} />
        ),
        li: ({ node: _node, ...props }) => <li className="" {...props} />,
        h1: ({ node: _node, ...props }) => (
          <h1 className="text-lg font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />
        ),
        h2: ({ node: _node, ...props }) => (
          <h2 className="text-base font-serif font-bold text-brand-text-primary mt-4 mb-2" {...props} />
        ),
        h3: ({ node: _node, ...props }) => (
          <h3 className="text-sm font-serif font-bold text-brand-text-primary mt-3 mb-1" {...props} />
        ),
        p: ({ node: _node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        a: ({ node: _node, href, children, ...props }) => {
          const safe = sanitizeMarkdownUrl(href);
          if (!safe) {
            return <span className="underline decoration-dotted">{children}</span>;
          }
          const external = /^https?:\/\//i.test(safe);
          return (
            <a
              href={safe}
              className="text-brand-accent underline underline-offset-2 hover:opacity-90"
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              {...props}
            >
              {children}
            </a>
          );
        },
        code: ({ node: _node, className, children, ...props }) => {
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
      {source}
    </ReactMarkdown>
  );
}
