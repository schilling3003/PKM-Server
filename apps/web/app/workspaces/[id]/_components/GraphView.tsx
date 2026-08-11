'use client';

import { useEffect, useRef } from 'react';
import type { GraphData, GraphNode } from '../../../../lib/api';

interface GraphViewProps {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  theme: 'light' | 'dark';
}

interface SimNode {
  node: GraphNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface ThemeColors {
  foreground: string;
  mutedForeground: string;
  border: string;
  primary: string;
  background: string;
}

function getTypeColor(type: string, theme: 'light' | 'dark'): string {
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const lightness = theme === 'dark' ? 65 : 45;
  return `hsl(${hue}, 70%, ${lightness}%)`;
}

export default function GraphView({ data, onNodeClick, theme }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const dprRef = useRef(1);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ source: number; target: number }[]>([]);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const colorsRef = useRef<ThemeColors | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const rafRef = useRef<number | null>(null);

  function readColors(): ThemeColors {
    const el = containerRef.current ?? document.documentElement;
    const style = getComputedStyle(el);
    return {
      foreground: style.getPropertyValue('--foreground').trim() || (theme === 'dark' ? '#f9fafb' : '#111827'),
      mutedForeground: style.getPropertyValue('--muted-foreground').trim() || (theme === 'dark' ? '#9ca3af' : '#6b7280'),
      border: style.getPropertyValue('--border').trim() || (theme === 'dark' ? '#374151' : '#e5e7eb'),
      primary: style.getPropertyValue('--primary').trim() || '#2563eb',
      background: style.getPropertyValue('--background').trim() || (theme === 'dark' ? '#0b0f19' : '#f9fafb'),
    };
  }

  function toWorld(mx: number, my: number) {
    const v = viewRef.current;
    return { x: (mx - v.x) / v.k, y: (my - v.y) / v.k };
  }

  function hitNode(mx: number, my: number): SimNode | null {
    const world = toWorld(mx, my);
    const nodes = nodesRef.current;
    let best: SimNode | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      const dx = world.x - n.x;
      const dy = world.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < n.r + 12 && dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    return best;
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = sizeRef.current;
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const colors = colorsRef.current ?? readColors();
    const v = viewRef.current;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(v.k, v.k);

    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.border;
    for (const edge of edgesRef.current) {
      const a = nodesRef.current[edge.source];
      const b = nodesRef.current[edge.target];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let i = 0; i < nodesRef.current.length; i++) {
      const n = nodesRef.current[i];
      const color = getTypeColor(n.node.type || 'Note', theme);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();

      if (i === hoveredRef.current) {
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 2 / v.k;
        ctx.stroke();
      }

      ctx.fillStyle = colors.mutedForeground;
      ctx.font = `${10 / v.k}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = n.node.title || n.node.path.split('/').pop() || n.node.path;
      ctx.fillText(label, n.x, n.y + n.r + 8 / v.k);
    }

    ctx.restore();
  }

  function step() {
    const { width, height } = sizeRef.current;
    const cx = 0;
    const cy = 0;
    const nodes = nodesRef.current;
    const n = nodes.length;
    if (n === 0) return;

    const repulsion = 2000;
    const springLength = 120;
    const cutoff = 400;
    const centerForce = 0.005;

    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      node.vx += (cx - node.x) * centerForce;
      node.vy += (cy - node.y) * centerForce;
    }

    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > cutoff * cutoff) continue;
        const d = Math.sqrt(d2);
        const f = repulsion / d;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const edge of edgesRef.current) {
      const a = nodes[edge.source];
      const b = nodes[edge.target];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - springLength) * 0.03;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    const padding = 60;
    const maxX = Math.max(0, width / 2 - padding);
    const maxY = Math.max(0, height / 2 - padding);
    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x = Math.max(-maxX, Math.min(maxX, node.x));
      node.y = Math.max(-maxY, Math.min(maxY, node.y));
    }
  }

  function tick() {
    step();
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    dprRef.current = window.devicePixelRatio || 1;
    colorsRef.current = readColors();

    function resize() {
      const c = containerRef.current;
      const cv = canvasRef.current;
      if (!c || !cv) return;
      const rect = c.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      sizeRef.current = { width, height };
      cv.width = width * dprRef.current;
      cv.height = height * dprRef.current;
      cv.style.width = `${width}px`;
      cv.style.height = `${height}px`;
      viewRef.current = { x: width / 2, y: height / 2, k: 1 };
      colorsRef.current = readColors();
      draw();
    }

    resize();
    window.addEventListener('resize', resize);

    const nodeById = new Map<string, number>();
    const degree = new Map<string, number>();
    for (const node of data.nodes) {
      degree.set(node.id, 0);
    }
    for (const edge of data.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }

    nodesRef.current = data.nodes.map((node, i) => {
      nodeById.set(node.id, i);
      const deg = degree.get(node.id) || 0;
      const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
      return {
        node,
        x: Math.cos(angle) * 40,
        y: Math.sin(angle) * 40,
        vx: 0,
        vy: 0,
        r: 8 + Math.min(deg, 8),
      };
    });

    edgesRef.current = data.edges
      .map((edge) => ({
        source: nodeById.get(edge.source)!,
        target: nodeById.get(edge.target)!,
      }))
      .filter((edge) => typeof edge.source === 'number' && typeof edge.target === 'number');

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // draw/readColors/tick read mutable refs and are recreated when theme changes;
    // this effect should only reinitialize when data or theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggingRef.current) {
      viewRef.current.x = dragStartRef.current.vx + (mx - dragStartRef.current.x);
      viewRef.current.y = dragStartRef.current.vy + (my - dragStartRef.current.y);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const hovered = hitNode(mx, my);
    hoveredRef.current = hovered ? nodesRef.current.indexOf(hovered) : null;
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    draggingRef.current = true;
    dragStartRef.current = { x: mx, y: my, vx: viewRef.current.x, vy: viewRef.current.y };
    canvas.style.cursor = 'grabbing';
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    draggingRef.current = false;
    canvas.style.cursor = 'default';

    const startX = dragStartRef.current.x;
    const startY = dragStartRef.current.y;
    const dragDistance = Math.hypot(mx - startX, my - startY);
    if (dragDistance < 4) {
      const node = hitNode(mx, my);
      if (node && onNodeClick) {
        onNodeClick(node.node);
      }
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const v = viewRef.current;
    const newK = Math.max(0.1, Math.min(4, v.k * factor));
    v.x = mx - (mx - v.x) * (newK / v.k);
    v.y = my - (my - v.y) * (newK / v.k);
    v.k = newK;
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          draggingRef.current = false;
          hoveredRef.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
        }}
        onWheel={handleWheel}
        className="block h-full w-full"
      />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-card/80 p-2 text-xs text-muted-foreground backdrop-blur-sm">
        <p>Scroll to zoom · drag to pan · click a node to open</p>
        <p>{data.nodes.length} notes · {data.edges.length} links</p>
      </div>
    </div>
  );
}
