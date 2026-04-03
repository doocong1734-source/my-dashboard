'use client';

import { useEffect, useRef, useState } from 'react';

interface MermaidBlockProps {
  code: string;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, code.trim());

        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgElement = containerRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.removeAttribute('style');
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    renderDiagram();
    return () => { mounted = false; };
  }, [code]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 bg-gray-50 border-2 border-black my-2">
        <span className="text-xs font-bold text-gray-500">다이어그램 렌더링 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border-2 border-red-400 my-2">
        <p className="text-xs font-bold text-red-600">Mermaid 오류: {error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex justify-center my-4 p-4 bg-white border-2 border-black overflow-x-auto" />
  );
}
