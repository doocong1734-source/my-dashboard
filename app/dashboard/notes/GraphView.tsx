'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';
import { zoom, ZoomBehavior, zoomIdentity, D3ZoomEvent, ZoomTransform } from 'd3-zoom';
import { select } from 'd3-selection';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  name: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphViewProps {
  files: Array<{ id: string; name: string }>;
  links: Array<{ sourceId: string; targetName: string }>;
  fileMap: Record<string, string>;
  selectedFileId: string | null;
  onSelectNode: (fileId: string) => void;
  onClose: () => void;
}

export default function GraphView({
  files,
  links,
  fileMap,
  selectedFileId,
  onSelectNode,
  onClose,
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    name: string;
  }>({ visible: false, x: 0, y: 0, name: '' });

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
    },
    [onSelectNode]
  );

  const handleNodeMouseEnter = useCallback(
    (event: MouseEvent, nodeName: string) => {
      const svgElement = svgRef.current;
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();
      const zoomState = select(svgElement).datum() as ZoomTransform | undefined;
      const transform = zoomState || zoomIdentity;

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setTooltip({
        visible: true,
        x: (x - transform.x) / transform.k,
        y: (y - transform.y) / transform.k,
        name: nodeName,
      });
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height: height - 60 });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || files.length === 0) return;

    const svg = select(svgRef.current);
    const { width, height } = dimensions;

    svg.selectAll('*').remove();

    const nodes: GraphNode[] = files.map((file) => ({
      id: file.id,
      name: file.name,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const resolvedLinks: GraphLink[] = links
      .map((link) => {
        const targetId = fileMap[link.targetName];
        if (!targetId || !nodeMap.has(link.sourceId)) return null;
        return { source: link.sourceId, target: targetId } as GraphLink;
      })
      .filter((link): link is GraphLink => link !== null);

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        'center',
        forceCenter(width / 2, height / 2)
      )
      .force(
        'charge',
        forceManyBody<GraphNode>().strength(-200)
      )
      .force(
        'collide',
        forceCollide<GraphNode>().radius(25)
      )
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(resolvedLinks).distance(80)
      );

    const g = svg.append('g').attr('class', 'graph-container');

    const linkElements = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(resolvedLinks)
      .enter()
      .append('line')
      .attr('stroke', '#9CA3AF')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5);

    const nodeGroups = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer');

    const circles = nodeGroups
      .append('circle')
      .attr('r', (d) => (d.id === selectedFileId ? 12 : 8))
      .attr('fill', (d) => (d.id === selectedFileId ? '#FFE500' : '#B197FC'))
      .attr('stroke', '#000000')
      .attr('stroke-width', 2)
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d.id);
      })
      .on('mouseenter', (event, d) => {
        const displayName = d.name.replace(/\.md$/, '');
        handleNodeMouseEnter(event, displayName);
      })
      .on('mouseleave', () => {
        handleNodeMouseLeave();
      });

    const labels = nodeGroups
      .append('text')
      .text((d) => d.name.replace(/\.md$/, ''))
      .attr('font-size', '10px')
      .attr('fill', '#000000')
      .attr('font-family', 'sans-serif')
      .attr('dx', 14)
      .attr('dy', 4);

    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
        svg.datum(event.transform);
      });

    svg.call(zoomBehavior);

    simulation.on('tick', () => {
      linkElements
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);

      nodeGroups.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [
    files,
    links,
    fileMap,
    selectedFileId,
    dimensions,
    handleNodeClick,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  ]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        className="bg-white border-4 border-black shadow-[8px_8px_0_black] w-full max-w-5xl h-[85vh] flex flex-col"
      >
        <div className="bg-[#FFE500] border-b-4 border-black px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-black uppercase tracking-wide">
              GRAPH VIEW
            </h2>
            <div className="flex items-center gap-4 text-sm font-medium text-black">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#B197FC] border-2 border-black"></span>
                Nodes: {files.length}
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-gray-500"></span>
                Edges: {links.length}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white border-4 border-black flex items-center justify-center text-xl font-bold hover:bg-gray-100 active:translate-y-0.5 transition-transform"
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="bg-gray-50"
          ></svg>

          {tooltip.visible && (
            <div
              className="absolute pointer-events-none bg-black text-white px-3 py-2 rounded-md text-sm font-medium z-10 whitespace-nowrap"
              style={{
                left: tooltip.x + 20,
                top: tooltip.y - 10,
              }}
            >
              {tooltip.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}