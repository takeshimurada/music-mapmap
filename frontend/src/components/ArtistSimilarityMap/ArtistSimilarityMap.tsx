import React, { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { ScatterplotLayer, LineLayer, IconLayer } from '@deck.gl/layers';
import { useStore, BACKEND_URL } from '../../state/store';
import { ArtistEdge, ArtistNode } from '../../types';

const MIN_ZOOM = -0.2;
const MAX_ZOOM = 6;
const CLUSTER_COMPACTNESS = 0.86;
const COLLISION_PADDING_PX = 2.8;
const COLLISION_ITERATIONS = 3;
const CLUSTER_NEIGHBOR_RADIUS_PX = 84;
const CLUSTER_EXPAND_MAX_PX = 22;
const POSITION_SHIFT_MAX_PX = 40;
const COLLISION_MAX_NODES = 7000;
const DRIFT_STEP = 0;
const DRIFT_INTERVAL_MS = 1200;
const NODE_FADE_MS = 980;
const ENABLE_DYNAMIC_REPOSITION = false;
const CULL_ENTER_PAD = 8;
const CULL_EXIT_PAD = 36;

type HoverProfile = {
  display_name?: string;
  image_url?: string | null;
  debut_country_code?: string | null;
  birth_country_code?: string | null;
  genres?: string[];
};

export const ArtistSimilarityMap: React.FC = () => {
  const { selectArtist, selectedArtist, setArtistConnections } = useStore();
  const [nodes, setNodes] = useState<ArtistNode[]>([]);
  const [edges, setEdges] = useState<ArtistEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState<ArtistNode | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<{ target: [number, number, number]; zoom: number }>({
    target: [0, 0, 0],
    zoom: 0,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [stableViewState, setStableViewState] = useState<{ target: [number, number, number]; zoom: number }>({
    target: [0, 0, 0],
    zoom: 0,
  });
  const [driftPhase, setDriftPhase] = useState(0);
  const [activeCreatorId, setActiveCreatorId] = useState<string | null>(null);
  const [hoverProfile, setHoverProfile] = useState<HoverProfile | null>(null);
  const [fadeTick, setFadeTick] = useState(0);
  const [frozenNodeScreenState, setFrozenNodeScreenState] = useState<{
    positionedNodeMap: Map<string, [number, number]>;
    visibleAvatarIds: Set<string>;
  } | null>(null);
  const skipAutoCenterOnceRef = useRef(false);
  const hoverProfileCacheRef = useRef<Map<string, HoverProfile>>(new Map());
  const prevDisplayNodeIdsRef = useRef<Set<string>>(new Set());
  const nodeFadeMapRef = useRef<Map<string, { mode: 'in' | 'out'; start: number }>>(new Map());
  const settleTimerRef = useRef<number | null>(null);
  const wasInteractingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const [nodeRes, edgeRes] = await Promise.all([
          fetch(`${BACKEND_URL}/artists/map/nodes?limit=50000`),
          fetch(`${BACKEND_URL}/artists/map/edges?minWeight=0.2&limit=20000`),
        ]);
        if (!nodeRes.ok || !edgeRes.ok) {
          throw new Error('Failed to load artist map data');
        }
        const nodeData = await nodeRes.json();
        const edgeData = await edgeRes.json();
        if (!alive) return;
        setNodes(nodeData.data || []);
        setEdges(edgeData.data || []);
      } catch (e) {
        console.warn('Failed to load artist similarity map', e);
        if (alive) {
          setNodes([]);
          setEdges([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
        const next = {
          target: [width / 2, height / 2, 0],
          zoom: 0,
        };
        setViewState(next);
        setStableViewState(next);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDriftPhase((p) => (p + DRIFT_STEP) % (Math.PI * 2));
    }, DRIFT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const normalizeArtistName = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const countryName = (code?: string | null): string | null => {
    if (!code) return null;
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      return dn.of(code.toUpperCase()) || code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  };

  const scalePoint = (node: ArtistNode): [number, number] => {
    const w = containerSize.width || 1;
    const h = containerSize.height || 1;
    const nx = 0.5 + (node.x - 0.5) * CLUSTER_COMPACTNESS;
    const nyRaw = 1 - node.y;
    const ny = 0.5 + (nyRaw - 0.5) * CLUSTER_COMPACTNESS;
    return [nx * w, ny * h];
  };

  const hashToUnit = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  };

  const addDrift = (point: [number, number], creatorId: string): [number, number] => {
    return point;
  };

  useEffect(() => {
    if (!selectedArtist || nodes.length === 0 || containerSize.width === 0 || containerSize.height === 0) {
      return;
    }

    const targetKey = normalizeArtistName(selectedArtist);
    if (!targetKey) return;

    let targetNode =
      nodes.find((n) => normalizeArtistName(n.display_name) === targetKey) ||
      nodes.find((n) => normalizeArtistName(n.display_name).includes(targetKey)) ||
      nodes.find((n) => targetKey.includes(normalizeArtistName(n.display_name)));

    if (!targetNode) return;

    setActiveCreatorId(targetNode.creator_id);
    const [x, y] = scalePoint(targetNode);
    if (skipAutoCenterOnceRef.current) {
      skipAutoCenterOnceRef.current = false;
    } else {
      setViewState((prev) => ({
        target: [x, y, 0],
        zoom: Math.max(prev.zoom, 2.2),
      }));
    }
    setHoverNode(targetNode);
  }, [selectedArtist, nodes, containerSize.width, containerSize.height]);

  useEffect(() => {
    if (!selectedArtist) {
      setActiveCreatorId(null);
      setHoverNode(null);
      setHoverPos(null);
      setHoverProfile(null);
    }
  }, [selectedArtist]);

  const hoverCreatorId = hoverNode?.creator_id ?? null;
  const highlightCreatorId = activeCreatorId || hoverCreatorId;
  const zoomIn = Math.max(0, viewState.zoom);
  const cullZoomIn = Math.max(0, stableViewState.zoom);
  const zoomBucket = Math.round(cullZoomIn * 8) / 8;

  const compareNodePriority = (a: ArtistNode, b: ArtistNode): number => {
    const popDiff = (b.popularity ?? -1) - (a.popularity ?? -1);
    if (popDiff !== 0) return popDiff;
    const albumDiff = (b.album_count ?? 0) - (a.album_count ?? 0);
    if (albumDiff !== 0) return albumDiff;
    return a.display_name.localeCompare(b.display_name);
  };

  const viewportWorldBounds = useMemo(() => {
    const width = Math.max(1, containerSize.width);
    const height = Math.max(1, containerSize.height);
    const scale = Math.pow(2, cullZoomIn);
    const halfW = width / (2 * scale);
    const halfH = height / (2 * scale);
    const zoomPad = Math.min(24, cullZoomIn * 6);
    const enterPad = CULL_ENTER_PAD + zoomPad;
    const exitPad = CULL_EXIT_PAD + zoomPad;
    const cx = stableViewState.target[0];
    const cy = stableViewState.target[1];
    return {
      enterMinX: cx - halfW - enterPad,
      enterMaxX: cx + halfW + enterPad,
      enterMinY: cy - halfH - enterPad,
      enterMaxY: cy + halfH + enterPad,
      exitMinX: cx - halfW - exitPad,
      exitMaxX: cx + halfW + exitPad,
      exitMinY: cy - halfH - exitPad,
      exitMaxY: cy + halfH + exitPad,
    };
  }, [containerSize.width, containerSize.height, stableViewState.target, cullZoomIn]);

  // Keep the render cap independent from zoom:
  // zooming in should reveal nodes in the current viewport, not hide them.
  const maxRenderNodes = useMemo(() => {
    const areaFactor = Math.sqrt(((containerSize.width || 1) * (containerSize.height || 1)) / (1920 * 1080));
    const base = 3600;
    return Math.round(clamp(base * clamp(areaFactor, 0.75, 1.35), 2600, 5200));
  }, [containerSize.width, containerSize.height]);

  const displayNodes = useMemo(() => {
    const prevVisible = prevDisplayNodeIdsRef.current;

    const entering = nodes.filter((n) => {
      const [x, y] = scalePoint(n);
      return (
        x >= viewportWorldBounds.enterMinX &&
        x <= viewportWorldBounds.enterMaxX &&
        y >= viewportWorldBounds.enterMinY &&
        y <= viewportWorldBounds.enterMaxY
      );
    });

    // Hysteresis: nodes already visible get a wider "stay" boundary.
    const staying = nodes.filter((n) => {
      if (!prevVisible.has(n.creator_id)) return false;
      const [x, y] = scalePoint(n);
      return (
        x >= viewportWorldBounds.exitMinX &&
        x <= viewportWorldBounds.exitMaxX &&
        y >= viewportWorldBounds.exitMinY &&
        y <= viewportWorldBounds.exitMaxY
      );
    });

    const mergedMap = new Map<string, ArtistNode>();
    for (const n of staying) mergedMap.set(n.creator_id, n);
    for (const n of entering) mergedMap.set(n.creator_id, n);
    const inView = Array.from(mergedMap.values());

    if (inView.length <= maxRenderNodes) {
      return inView;
    }

    // Safety cap only when viewport area is still very dense.
    const gridDiv = 10;
    const cellBuckets = new Map<string, ArtistNode[]>();
    for (const n of inView) {
      const gx = Math.max(0, Math.min(gridDiv - 1, Math.floor(n.x * gridDiv)));
      const gy = Math.max(0, Math.min(gridDiv - 1, Math.floor(n.y * gridDiv)));
      const key = `${gx}:${gy}`;
      const list = cellBuckets.get(key);
      if (list) list.push(n);
      else cellBuckets.set(key, [n]);
    }
    const queues = Array.from(cellBuckets.values())
      .map((list) => list.sort(compareNodePriority))
      .sort((a, b) => compareNodePriority(a[0], b[0]));
    const selected: ArtistNode[] = [];
    const selectedIds = new Set<string>();

    // Keep previously visible nodes first (within cap) to reduce popping/churn.
    const stickyFirst = inView
      .filter((n) => prevVisible.has(n.creator_id))
      .sort(compareNodePriority);
    for (const n of stickyFirst) {
      if (selected.length >= maxRenderNodes) break;
      selected.push(n);
      selectedIds.add(n.creator_id);
    }

    let cursor = 0;
    while (selected.length < maxRenderNodes && queues.length > 0) {
      const q = queues[cursor];
      if (q.length > 0) {
        const candidate = q.shift() as ArtistNode;
        if (!selectedIds.has(candidate.creator_id)) {
          selected.push(candidate);
          selectedIds.add(candidate.creator_id);
        }
      }
      if (q.length === 0) {
        queues.splice(cursor, 1);
        if (queues.length === 0) break;
        cursor = cursor % queues.length;
      } else {
        cursor = (cursor + 1) % queues.length;
      }
    }

    const mustKeepIds = [activeCreatorId, hoverCreatorId].filter((id): id is string => Boolean(id));
    for (const keepId of mustKeepIds) {
      if (selectedIds.has(keepId)) continue;
      const found = nodes.find((n) => n.creator_id === keepId);
      if (found) selected.push(found);
    }
    return selected;
  }, [nodes, activeCreatorId, hoverCreatorId, viewportWorldBounds, maxRenderNodes]);

  const displayNodeIdSet = useMemo(() => new Set(displayNodes.map((n) => n.creator_id)), [displayNodes]);
  const allNodesById = useMemo(() => {
    const map = new Map<string, ArtistNode>();
    for (const n of nodes) map.set(n.creator_id, n);
    return map;
  }, [nodes]);

  useEffect(() => {
    const now = performance.now();
    const currentIds = new Set(displayNodes.map((n) => n.creator_id));
    const prevIds = prevDisplayNodeIdsRef.current;
    const fadeMap = nodeFadeMapRef.current;

    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        fadeMap.set(id, { mode: 'in', start: now });
      }
    }
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        fadeMap.set(id, { mode: 'out', start: now });
      }
    }
    prevDisplayNodeIdsRef.current = currentIds;
  }, [displayNodes]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (nodeFadeMapRef.current.size === 0) return;
      const now = performance.now();
      for (const [key, value] of nodeFadeMapRef.current) {
        if (now - value.start > NODE_FADE_MS) nodeFadeMapRef.current.delete(key);
      }
      setFadeTick((t) => t + 1);
    }, 33);
    return () => window.clearInterval(id);
  }, []);

  const getNodeFadeOpacity = (creatorId: string, isCurrentlyVisible: boolean): number => {
    const fade = nodeFadeMapRef.current.get(creatorId);
    if (!fade) return 1;
    const elapsed = performance.now() - fade.start;
    const t = smoothstep(0, 1, clamp(elapsed / NODE_FADE_MS, 0, 1));
    if (fade.mode === 'in') return isCurrentlyVisible ? t : 1;
    return isCurrentlyVisible ? 1 : 1 - t;
  };

  const renderNodes = useMemo(() => {
    const currentIds = new Set(displayNodes.map((n) => n.creator_id));
    const out: ArtistNode[] = [...displayNodes];
    for (const [id, fade] of nodeFadeMapRef.current) {
      if (fade.mode !== 'out') continue;
      if (currentIds.has(id)) continue;
      const node = allNodesById.get(id);
      if (node) out.push(node);
    }
    return out;
  }, [displayNodes, allNodesById, fadeTick]);

  const edgeLimit = Math.min(14000, Math.max(1200, Math.round(displayNodes.length * 2.2)));
  const edgeMinWeight = Math.max(0.2, 0.66 - smoothstep(1.0, 5.5, cullZoomIn) * 0.46);
  const sortedEdges = useMemo(() => [...edges].sort((a, b) => b.weight - a.weight), [edges]);
  const visibleEdges = useMemo(() => {
    const out: ArtistEdge[] = [];
    for (const e of sortedEdges) {
      if (e.weight < edgeMinWeight) break;
      if (!displayNodeIdSet.has(e.source_creator_id) || !displayNodeIdSet.has(e.target_creator_id)) continue;
      out.push(e);
      if (out.length >= edgeLimit) break;
    }
    return out;
  }, [sortedEdges, edgeMinWeight, edgeLimit, displayNodeIdSet]);

  const activeConnections = useMemo(() => {
    if (!activeCreatorId) return [];
    const weightByOther = new Map<string, number>();
    for (const e of edges) {
      let other: string | null = null;
      if (e.source_creator_id === activeCreatorId) other = e.target_creator_id;
      else if (e.target_creator_id === activeCreatorId) other = e.source_creator_id;
      if (!other) continue;
      const prev = weightByOther.get(other) ?? -1;
      if (e.weight > prev) weightByOther.set(other, e.weight);
    }
    return Array.from(weightByOther.entries())
      .map(([creator_id, weight]) => ({
        creator_id,
        display_name: allNodesById.get(creator_id)?.display_name ?? creator_id,
        weight,
        image_url: allNodesById.get(creator_id)?.image_url ?? null,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 60);
  }, [activeCreatorId, edges, allNodesById]);

  useEffect(() => {
    setArtistConnections(activeConnections);
  }, [activeConnections, setArtistConnections]);

  const connectedCreatorIds = useMemo(() => {
    const connected = new Set<string>();
    if (!highlightCreatorId) return connected;
    for (const e of visibleEdges) {
      if (e.source_creator_id === highlightCreatorId) {
        connected.add(e.target_creator_id);
      } else if (e.target_creator_id === highlightCreatorId) {
        connected.add(e.source_creator_id);
      }
    }
    return connected;
  }, [visibleEdges, highlightCreatorId]);

  const nodeBaseScale = 0.49 + Math.min(0.7, zoomIn * 0.16);
  const collisionNodeBaseScale = 0.49 + Math.min(0.7, zoomBucket * 0.16);
  const nodeMinPx = 1.2 + Math.min(2.9, zoomIn * 0.5);
  const nodeMaxPx = 7.2 + Math.min(21.6, zoomIn * 4.1);
  const collisionNodeMinPx = 1.2 + Math.min(2.9, zoomBucket * 0.5);
  const collisionNodeMaxPx = 7.2 + Math.min(21.6, zoomBucket * 4.1);
  const showAvatars = zoomIn >= 0.08;
  const avatarZoomScale = zoomIn < 0.2 ? 0.72 : 0.86 + Math.min(2.6, (zoomIn - 0.2) * 0.66);
  const avatarMaxPx = 20 + Math.min(96, Math.max(0, zoomIn) * 14);

  const topPopularityCutoff = useMemo(() => {
    const popularNodes = displayNodes.filter((n) => typeof n.popularity === 'number');
    if (popularNodes.length === 0) return Infinity;
    const sorted = [...popularNodes].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const cutoffIndex = Math.max(0, Math.ceil(sorted.length * 0.1) - 1);
    return sorted[cutoffIndex]?.popularity ?? Infinity;
  }, [displayNodes]);

  const avatarCandidateSet = useMemo(() => {
    const set = new Set<string>();
    if (!showAvatars) return set;
    for (const node of displayNodes) {
      if (
        typeof node.popularity === 'number' &&
        (node.popularity ?? 0) >= topPopularityCutoff &&
        typeof node.image_url === 'string' &&
        node.image_url.length > 0
      ) {
        set.add(node.creator_id);
      }
    }
    return set;
  }, [displayNodes, showAvatars, topPopularityCutoff]);

  const nodeScreenState = useMemo(() => {
    type Entry = {
      node: ArtistNode;
      baseX: number;
      baseY: number;
      x: number;
      y: number;
      radiusPx: number;
      priority: number;
      isAvatar: boolean;
      avatarRadiusPx: number;
    };
    const entries: Entry[] = displayNodes.map((node) => {
      const [baseX, baseY] = scalePoint(node);
      const baseRadius = Math.max(2.5, node.size);
      const albumCount = Math.max(0, node.album_count ?? 0);
      const albumMultiplier = 1 + Math.min(0.3, Math.log1p(albumCount) * 0.07);
      const radius = baseRadius * albumMultiplier * collisionNodeBaseScale;
      const radiusPx = clamp(radius, collisionNodeMinPx, collisionNodeMaxPx);
      const isAvatar = avatarCandidateSet.has(node.creator_id);
      const avatarSizePx =
        (9 + Math.min(11, Math.log1p(albumCount) * 2.2) + ((node.popularity ?? 0) / 50)) *
        (1.15 + cullZoomIn * 0.72) *
        1.22;
      const avatarRadius = clamp(avatarSizePx, 10, avatarMaxPx) * 0.5;
      const priority = (isAvatar ? 2 : 0) + ((node.popularity ?? 0) / 100);
      return {
        node,
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        radiusPx,
        priority,
        isAvatar,
        avatarRadiusPx: avatarRadius,
      };
    });

    if (entries.length === 0) {
      return {
        positionedNodeMap: new Map<string, [number, number]>(),
        visibleAvatarIds: new Set<string>(),
      };
    }
    if (!ENABLE_DYNAMIC_REPOSITION) {
      const positionedNodeMap = new Map<string, [number, number]>();
      const visibleAvatarIds = new Set<string>();
      for (const entry of entries) {
        positionedNodeMap.set(entry.node.creator_id, [entry.baseX, entry.baseY]);
        if (entry.isAvatar) visibleAvatarIds.add(entry.node.creator_id);
      }
      return { positionedNodeMap, visibleAvatarIds };
    }
    const shouldRunCollision = cullZoomIn >= 1.0;
    const collisionEntries =
      shouldRunCollision && entries.length > COLLISION_MAX_NODES
        ? [...entries]
            .sort((a, b) => b.priority - a.priority)
            .slice(0, COLLISION_MAX_NODES)
        : entries;

    const cellSize = Math.max(28, collisionNodeMaxPx * 3.2);
    const buildGrid = () => {
      const grid = new Map<string, number[]>();
      collisionEntries.forEach((entry, idx) => {
        const gx = Math.floor(entry.x / cellSize);
        const gy = Math.floor(entry.y / cellSize);
        const key = `${gx}:${gy}`;
        const list = grid.get(key);
        if (list) list.push(idx);
        else grid.set(key, [idx]);
      });
      return grid;
    };

    if (shouldRunCollision) {
      // Pass A: expand dense micro-clusters locally while preserving the cluster center.
      let grid = buildGrid();
      for (let i = 0; i < collisionEntries.length; i += 1) {
        const entry = collisionEntries[i];
        const gx = Math.floor(entry.x / cellSize);
        const gy = Math.floor(entry.y / cellSize);
        const neighbors: number[] = [];
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const ids = grid.get(`${gx + dx}:${gy + dy}`);
            if (ids) neighbors.push(...ids);
          }
        }
        if (neighbors.length < 7) continue;
        let cx = 0;
        let cy = 0;
        let count = 0;
        for (const ni of neighbors) {
          if (ni === i) continue;
          const n = collisionEntries[ni];
          const dx = n.x - entry.x;
          const dy = n.y - entry.y;
          if (dx * dx + dy * dy > CLUSTER_NEIGHBOR_RADIUS_PX * CLUSTER_NEIGHBOR_RADIUS_PX) continue;
          cx += n.x;
          cy += n.y;
          count += 1;
        }
        if (count < 6) continue;
        cx /= count;
        cy /= count;
        let vx = entry.x - cx;
        let vy = entry.y - cy;
        const mag = Math.hypot(vx, vy);
        if (mag < 0.0001) {
          const seed = hashToUnit(entry.node.creator_id) * Math.PI * 2;
          vx = Math.cos(seed);
          vy = Math.sin(seed);
        } else {
          vx /= mag;
          vy /= mag;
        }
        const push = Math.min(CLUSTER_EXPAND_MAX_PX, (count - 5) * 0.8);
        entry.x += vx * push;
        entry.y += vy * push;
      }

      // Pass B: resolve overlaps with weighted screen-space collision.
      for (let iter = 0; iter < COLLISION_ITERATIONS; iter += 1) {
        grid = buildGrid();
        for (let i = 0; i < collisionEntries.length; i += 1) {
          const a = collisionEntries[i];
          const agx = Math.floor(a.x / cellSize);
          const agy = Math.floor(a.y / cellSize);
          for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
              const ids = grid.get(`${agx + dx}:${agy + dy}`);
              if (!ids) continue;
              for (const j of ids) {
                if (j <= i) continue;
                const b = collisionEntries[j];
                let vx = b.x - a.x;
                let vy = b.y - a.y;
                let dist = Math.hypot(vx, vy);
                const minDist = a.radiusPx + b.radiusPx + COLLISION_PADDING_PX;
                if (dist >= minDist) continue;
                if (dist < 0.0001) {
                  const seed = hashToUnit(`${a.node.creator_id}:${b.node.creator_id}`) * Math.PI * 2;
                  vx = Math.cos(seed);
                  vy = Math.sin(seed);
                  dist = 1;
                } else {
                  vx /= dist;
                  vy /= dist;
                }
                const overlap = minDist - dist;
                const aMobility = 1 / (1 + a.priority);
                const bMobility = 1 / (1 + b.priority);
                const mobilitySum = aMobility + bMobility;
                const aShift = overlap * (aMobility / mobilitySum);
                const bShift = overlap * (bMobility / mobilitySum);
                a.x -= vx * aShift;
                a.y -= vy * aShift;
                b.x += vx * bShift;
                b.y += vy * bShift;
              }
            }
          }
        }
      }
    }

    // Spring-back clamp so motion remains calm and avoids hard jumps.
    for (const entry of entries) {
      let dx = entry.x - entry.baseX;
      let dy = entry.y - entry.baseY;
      const shift = Math.hypot(dx, dy);
      if (shift > POSITION_SHIFT_MAX_PX) {
        const ratio = POSITION_SHIFT_MAX_PX / shift;
        dx *= ratio;
        dy *= ratio;
      }
      entry.x = entry.baseX + dx;
      entry.y = entry.baseY + dy;
    }

    // Avatar declutter pass (separate from node collision) with priority retention.
    const avatarEntries = entries
      .filter((e) => e.isAvatar)
      .sort((a, b) => (b.priority === a.priority ? b.avatarRadiusPx - a.avatarRadiusPx : b.priority - a.priority));
    const visibleAvatarIds = new Set<string>();
    const kept: { x: number; y: number; r: number }[] = [];
    for (const entry of avatarEntries) {
      const r = entry.avatarRadiusPx;
      let blocked = false;
      for (const k of kept) {
        const dx = entry.x - k.x;
        const dy = entry.y - k.y;
        if (dx * dx + dy * dy < (r + k.r + 3) * (r + k.r + 3)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        kept.push({ x: entry.x, y: entry.y, r });
        visibleAvatarIds.add(entry.node.creator_id);
      }
    }

    const positionedNodeMap = new Map<string, [number, number]>();
    for (const entry of entries) {
      positionedNodeMap.set(entry.node.creator_id, [entry.x, entry.y]);
    }
    return { positionedNodeMap, visibleAvatarIds };
  }, [
    displayNodes,
    collisionNodeBaseScale,
    collisionNodeMinPx,
    collisionNodeMaxPx,
    avatarCandidateSet,
    avatarMaxPx,
    zoomBucket,
    cullZoomIn,
    containerSize.width,
    containerSize.height,
  ]);

  const layers = useMemo(() => {
    const effectiveNodeScreenState = isInteracting && frozenNodeScreenState ? frozenNodeScreenState : nodeScreenState;
    const avatarNodes = renderNodes.filter((n) => effectiveNodeScreenState.visibleAvatarIds.has(n.creator_id));
    return [
      new LineLayer<ArtistEdge>({
        id: 'artist-edges',
        data: visibleEdges,
        getSourcePosition: (d) => {
          const p = effectiveNodeScreenState.positionedNodeMap.get(d.source_creator_id);
          return p ? addDrift(p, d.source_creator_id) : [NaN, NaN];
        },
        getTargetPosition: (d) => {
          const p = effectiveNodeScreenState.positionedNodeMap.get(d.target_creator_id);
          return p ? addDrift(p, d.target_creator_id) : [NaN, NaN];
        },
        getColor: (d) => {
          const isFocusEdge =
            highlightCreatorId &&
            (d.source_creator_id === highlightCreatorId || d.target_creator_id === highlightCreatorId);
          if (isFocusEdge) return [15, 15, 15, 230];
          if (highlightCreatorId) return [120, 120, 120, 38];
          return [0, 0, 0, Math.min(120, 40 + d.weight * 120)];
        },
        getWidth: (d) => {
          const base = Math.max(0.2, d.weight * 1.2);
          const isFocusEdge =
            highlightCreatorId &&
            (d.source_creator_id === highlightCreatorId || d.target_creator_id === highlightCreatorId);
          return isFocusEdge ? base * 2.7 : highlightCreatorId ? base * 0.88 : base;
        },
        opacity: 0.55,
        pickable: false,
      }),
      new ScatterplotLayer<ArtistNode>({
        id: 'artist-nodes',
        data: renderNodes,
        getPosition: (d) => {
          const p = effectiveNodeScreenState.positionedNodeMap.get(d.creator_id) ?? scalePoint(d);
          return addDrift(p, d.creator_id);
        },
        getRadius: (d) => {
          const baseRadius = Math.max(2.5, d.size);
          const albumCount = Math.max(0, d.album_count ?? 0);
          const albumMultiplier = 1 + Math.min(0.3, Math.log1p(albumCount) * 0.07);
          const isHover = hoverCreatorId === d.creator_id;
          const isActive = activeCreatorId === d.creator_id;
          const isConnected = connectedCreatorIds.has(d.creator_id);
          const interactionMultiplier = isActive ? 1.42 : isHover ? 1.28 : isConnected ? 1.12 : 1;
          return baseRadius * albumMultiplier * interactionMultiplier * nodeBaseScale;
        },
        radiusUnits: 'common',
        radiusMinPixels: nodeMinPx,
        radiusMaxPixels: nodeMaxPx,
        getFillColor: (d) => {
          const fadeOpacity = getNodeFadeOpacity(d.creator_id, displayNodeIdSet.has(d.creator_id));
          if (activeCreatorId === d.creator_id) return [5, 5, 5, 255];
          if (hoverCreatorId === d.creator_id) return [0, 0, 0, Math.round(248 * fadeOpacity)];
          if (connectedCreatorIds.has(d.creator_id)) return [35, 35, 35, Math.round(225 * fadeOpacity)];
          if (highlightCreatorId) return [135, 135, 135, Math.round(132 * fadeOpacity)];
          const base = d.genres && d.genres.length ? [25, 25, 25, 220] : [90, 90, 90, 200];
          return [base[0], base[1], base[2], Math.round(base[3] * fadeOpacity)] as [
            number,
            number,
            number,
            number,
          ];
        },
        getLineColor: (d) => (activeCreatorId === d.creator_id ? [255, 210, 60, 255] : [255, 255, 255, 160]),
        getLineWidth: (d) => (activeCreatorId === d.creator_id ? 2.4 : 1),
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 0.7,
        stroked: true,
        pickable: true,
        autoHighlight: false,
        highlightColor: [255, 255, 255, 230],
        onHover: (info) => {
          if (info.object) {
            setHoverNode(info.object as ArtistNode);
            setHoverPos({ x: info.x ?? 0, y: info.y ?? 0 });
          } else {
            setHoverNode(null);
            setHoverPos(null);
          }
        },
        onClick: (info) => {
          if (!info.object) return;
          const node = info.object as ArtistNode;
          setActiveCreatorId(node.creator_id);
          skipAutoCenterOnceRef.current = true;
          selectArtist(node.display_name);
        },
      }),
      new IconLayer<ArtistNode>({
        id: 'artist-node-avatars',
        data: avatarNodes,
        getPosition: (d) => {
          const p = effectiveNodeScreenState.positionedNodeMap.get(d.creator_id) ?? scalePoint(d);
          return addDrift(p, d.creator_id);
        },
        getIcon: (d) => ({
          url: d.image_url as string,
          width: 128,
          height: 128,
          anchorY: 64,
          anchorX: 64,
        }),
        getSize: (d) => {
          const albumCount = Math.max(0, d.album_count ?? 0);
          const isActive = activeCreatorId === d.creator_id;
          const isHover = hoverCreatorId === d.creator_id;
          const isConnected = connectedCreatorIds.has(d.creator_id);
          const interactionMultiplier = isActive ? 1.42 : isHover ? 1.28 : isConnected ? 1.12 : 1;
          const avatarSizePx =
            (9 + Math.min(11, Math.log1p(albumCount) * 2.2) + ((d.popularity ?? 0) / 50)) *
            (1.15 + zoomIn * 0.72) *
            1.22 *
            interactionMultiplier;
          return clamp(avatarSizePx, 10, avatarMaxPx);
        },
        sizeUnits: 'pixels',
        billboard: true,
        pickable: true,
        alphaCutoff: 0.05,
        getColor: (d) => {
          const fadeOpacity = getNodeFadeOpacity(d.creator_id, displayNodeIdSet.has(d.creator_id));
          return [255, 255, 255, Math.round(255 * fadeOpacity)];
        },
        onHover: (info) => {
          if (info.object) {
            setHoverNode(info.object as ArtistNode);
            setHoverPos({ x: info.x ?? 0, y: info.y ?? 0 });
          }
        },
        onClick: (info) => {
          if (!info.object) return;
          const node = info.object as ArtistNode;
          setActiveCreatorId(node.creator_id);
          skipAutoCenterOnceRef.current = true;
          selectArtist(node.display_name);
        },
      }),
    ];
  }, [
    displayNodes,
    renderNodes,
    fadeTick,
    visibleEdges,
    hoverCreatorId,
    highlightCreatorId,
    connectedCreatorIds,
    activeCreatorId,
    isInteracting,
    frozenNodeScreenState,
    selectArtist,
    nodeScreenState,
    nodeBaseScale,
    nodeMinPx,
    nodeMaxPx,
    zoomIn,
    avatarMaxPx,
    driftPhase,
    displayNodeIdSet,
  ]);

  const hoverCardPosition = useMemo(() => {
    if (!hoverPos) return null;
    const cardWidth = 260;
    const cardHeight = 178;
    const margin = 10;
    const maxX = Math.max(margin, (containerSize.width || 0) - cardWidth - margin);
    const maxY = Math.max(margin, (containerSize.height || 0) - cardHeight - margin);
    return {
      left: clamp(hoverPos.x + 14, margin, maxX),
      top: clamp(hoverPos.y - cardHeight - 14, margin, maxY),
    };
  }, [hoverPos, containerSize.width, containerSize.height]);

  useEffect(() => {
    if (!hoverNode?.display_name) {
      setHoverProfile(null);
      return;
    }
    const key = hoverNode.display_name.trim().toLowerCase();
    const cached = hoverProfileCacheRef.current.get(key);
    if (cached) {
      setHoverProfile(cached);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/artists/lookup?name=${encodeURIComponent(hoverNode.display_name)}`);
        if (!res.ok) return;
        const data = await res.json();
        const profile = (data?.data || {}) as HoverProfile;
        hoverProfileCacheRef.current.set(key, profile);
        setHoverProfile(profile);
      } catch {
        // noop
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hoverNode?.display_name]);

  const hoverCountry = useMemo(() => {
    if (!hoverProfile) return null;
    return countryName(hoverProfile.debut_country_code) || countryName(hoverProfile.birth_country_code) || null;
  }, [hoverProfile]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-white">
      <DeckGL
        views={new OrthographicView({ id: 'artist-map' })}
        viewState={viewState}
        onViewStateChange={(e) => {
          if (!e.viewState) return;
          const next = {
            target: e.viewState.target as [number, number, number],
            zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, e.viewState.zoom)),
          };
          setViewState(next);

          const interacting = Boolean(
            e.interactionState?.isDragging ||
              e.interactionState?.isPanning ||
              e.interactionState?.isZooming ||
              e.interactionState?.isRotating
          );
          if (interacting && !wasInteractingRef.current) {
            setFrozenNodeScreenState({
              positionedNodeMap: new Map(nodeScreenState.positionedNodeMap),
              visibleAvatarIds: new Set(nodeScreenState.visibleAvatarIds),
            });
          }
          wasInteractingRef.current = interacting;
          setIsInteracting(interacting);
          if (settleTimerRef.current) {
            window.clearTimeout(settleTimerRef.current);
          }
          settleTimerRef.current = window.setTimeout(() => {
            setStableViewState(next);
            setIsInteracting(false);
            setFrozenNodeScreenState(null);
            wasInteractingRef.current = false;
            settleTimerRef.current = null;
          }, 420);
        }}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        pickingRadius={18}
        controller={{ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
        layers={layers}
        style={{ position: 'absolute', inset: 0 }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Loading artist similarity map...
        </div>
      )}
      {!loading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          No artist nodes loaded. Check API response.
        </div>
      )}
      <div className="absolute top-4 left-4 text-[10px] text-gray-400 pointer-events-none">
        nodes: {displayNodes.length}/{nodes.length} | edges: {visibleEdges.length}
      </div>
      {hoverNode && hoverCardPosition && (
        <div
          className="absolute z-20 w-[260px] pointer-events-none rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg overflow-hidden transition-all duration-180 ease-out"
          style={{ left: hoverCardPosition.left, top: hoverCardPosition.top }}
        >
          <div className="h-24 w-full bg-gray-100">
            {(hoverProfile?.image_url || hoverNode.image_url) ? (
              <img
                src={(hoverProfile?.image_url || hoverNode.image_url) as string}
                alt={hoverNode.display_name}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
          <div className="px-3 py-2.5">
            <div className="text-sm font-semibold text-black truncate">{hoverProfile?.display_name || hoverNode.display_name}</div>
            <div className="mt-1 text-[11px] text-gray-500">{hoverCountry || 'Country unknown'}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(hoverProfile?.genres?.length ? hoverProfile.genres : hoverNode.genres || []).slice(0, 3).map((g) => (
                <span key={g} className="px-2 py-[2px] rounded-full border border-black/10 bg-black/[0.04] text-[10px] text-black/85">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};




