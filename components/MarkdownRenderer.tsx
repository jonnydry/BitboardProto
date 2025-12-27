import React from 'react';
import ReactMarkdown from 'react-markdown';
// Use the LIGHT build of react-syntax-highlighter to reduce bundle size by ~400KB
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Only register commonly used languages (reduces bundle significantly)
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

import { ExternalLink, Code, Hash, Quote } from 'lucide-react';
import { LinkPreview } from './LinkPreview';

// Register only the languages we support
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('rs', rust);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Custom component for rendering markdown content with terminal-themed styling
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = ''
}) => {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-terminal-text border-b border-terminal-dim pb-1 mb-4 flex items-center gap-2">
              <Hash size={16} />
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-terminal-text border-b border-terminal-dim pb-1 mb-3 mt-6 flex items-center gap-2">
              <Hash size={14} />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-terminal-text mb-2 flex items-center gap-2">
              <Hash size={12} />
              {children}
            </h3>
          ),

          // Paragraphs - Check for standalone links to render as preview cards
          p: ({ children }) => {
            // Check if paragraph contains only a single link
            const childArray = React.Children.toArray(children);
            if (childArray.length === 1) {
              const child = childArray[0];
              // Check if the child is a React element with type 'a' (link)
              if (React.isValidElement(child) && child.props?.href) {
                const href = child.props.href as string;
                // Check if it's an external URL (not an image)
                if (href.startsWith('http') && !/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(href)) {
                  return (
                    <div className="my-3">
                      <LinkPreview url={href} />
                    </div>
                  );
                }
              }
            }
            return (
              <p className="text-terminal-text leading-relaxed mb-3">
                {children}
              </p>
            );
          },

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-text hover:text-terminal-dim underline inline-flex items-center gap-1 transition-colors"
            >
              {children}
              <ExternalLink size={10} />
            </a>
          ),

          // Code blocks
          code: ({ inline, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="my-4 border border-terminal-dim rounded">
                <div className="bg-terminal-dim/20 px-3 py-1 text-xs text-terminal-dim flex items-center gap-2 border-b border-terminal-dim">
                  <Code size={12} />
                  {match[1].toUpperCase()}
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="!bg-terminal-bg !border-0 !rounded-none"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code
                className="bg-terminal-dim/20 px-1 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-terminal-dim pl-4 py-2 my-4 bg-terminal-dim/5 italic text-terminal-text">
              <Quote size={14} className="inline mr-2 opacity-50" />
              {children}
            </blockquote>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 mb-4 text-terminal-text">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-4 text-terminal-text">
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li className="text-terminal-text">
              {children}
            </li>
          ),

          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-bold text-terminal-text">
              {children}
            </strong>
          ),

          // Emphasis/Italic
          em: ({ children }) => (
            <em className="italic text-terminal-text">
              {children}
            </em>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="border-terminal-dim my-6" />
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="border border-terminal-dim w-full">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-terminal-dim/20">
              {children}
            </thead>
          ),

          tbody: ({ children }) => (
            <tbody>
              {children}
            </tbody>
          ),

          tr: ({ children }) => (
            <tr className="border-b border-terminal-dim/30">
              {children}
            </tr>
          ),

          th: ({ children }) => (
            <th className="border border-terminal-dim px-3 py-2 text-left font-bold text-terminal-text">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="border border-terminal-dim px-3 py-2 text-terminal-text">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
