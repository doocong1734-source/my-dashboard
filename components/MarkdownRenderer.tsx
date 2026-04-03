'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import dynamic from 'next/dynamic';
import 'katex/dist/katex.min.css';

const MermaidBlock = dynamic(() => import('./MermaidBlock'), { ssr: false });

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CodeBlock({ inline, className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  if (!inline && language === 'mermaid') {
    return <MermaidBlock code={codeString} />;
  }

  if (inline) {
    return <code className={className} {...props}>{children}</code>;
  }

  return (
    <code className={`hljs ${language ? `language-${language}` : ''} ${className ?? ''}`} {...props}>
      {children}
    </code>
  );
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{ code: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
