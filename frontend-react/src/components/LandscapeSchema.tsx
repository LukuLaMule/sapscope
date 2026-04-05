import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { SAPSystem, Tier } from "@/types/sap";
import { getScoreColor, getScoreBorderColor, getScoreBgColor, getStatusBadgeClass } from "@/lib/sap-utils";
import { AlertTriangle } from "lucide-react";

// ── Dimensions ────────────────────────────────────────────────────────────────

const LABEL_W  = 90;   // colonne badge route (gauche)
const COL_W    = 200;  // largeur d'une colonne de tier
const NODE_W   = 158;  // largeur d'un nœud système
const NODE_H   = 88;   // hauteur d'un nœud système
const HDR_H    = 56;   // hauteur de l'en-tête tier
const ROUTE_H  = 130;  // hauteur d'une ligne route (1 système)
const NODE_GAP = 14;   // espace entre 2 nœuds empilés dans la même cellule

// ── Ordre des tiers ───────────────────────────────────────────────────────────

const TIER_ORDER: Tier[] = ["Sandbox", "Development", "Quality", "Pre-Production", "Production"];

const TIER_STYLE: Record<Tier, { dot: string; label: string }> = {
  Sandbox:          { dot: "bg-muted-foreground/50",  label: "text-muted-foreground"   },
  Development:      { dot: "bg-tier-dev",              label: "text-tier-dev"           },
  Quality:          { dot: "bg-tier-quality",          label: "text-tier-quality"       },
  "Pre-Production": { dot: "bg-tier-quality/70",       label: "text-[hsl(var(--tier-quality)/.8)]" },
  Production:       { dot: "bg-tier-prod",             label: "text-tier-prod"          },
};

// ── Couleurs par type système ─────────────────────────────────────────────────

const SYSTEM_TYPE_STYLE: Record<string, string> = {
  "S/4HANA":  "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  "BW/4HANA": "bg-amber-500/15 border-amber-500/40 text-amber-400",
  "BW":       "bg-amber-500/10 border-amber-500/30 text-amber-400/80",
  "ECC":      "bg-sky-500/15 border-sky-500/40 text-sky-400",
  "SolMan":   "bg-violet-500/15 border-violet-500/40 text-violet-400",
  "PI/PO":    "bg-orange-500/15 border-orange-500/40 text-orange-400",
  "CRM":      "bg-pink-500/15 border-pink-500/40 text-pink-400",
  "SRM":      "bg-rose-500/15 border-rose-500/40 text-rose-400",
  "GRC":      "bg-red-500/15 border-red-500/40 text-red-400",
  "Fiori":    "bg-blue-500/15 border-blue-500/40 text-blue-400",
  "ABAP":     "bg-slate-500/10 border-slate-500/30 text-slate-400",
  "Java":     "bg-slate-500/10 border-slate-500/30 text-slate-400",
};

function systemTypeClass(type?: string) {
  return SYSTEM_TYPE_STYLE[type ?? ""] ?? "bg-slate-500/10 border-slate-500/30 text-slate-400";
}

// ── Couleurs par route ────────────────────────────────────────────────────────

const ROUTE_COLOR: Record<string, { stroke: string; glow: string; badge: string }> = {
  ECC:   { stroke: "hsl(187,72%,50%)",  glow: "rgba(49,196,213,.4)",   badge: "bg-primary/10 border-primary/30 text-primary"           },
  S4:    { stroke: "hsl(152,69%,45%)",  glow: "rgba(52,199,139,.4)",   badge: "bg-status-ok/10 border-status-ok/30 text-status-ok"     },
  BW:    { stroke: "hsl(38,92%,50%)",   glow: "rgba(245,158,11,.4)",   badge: "bg-status-warning/10 border-status-warning/30 text-status-warning" },
  Other: { stroke: "hsl(215,15%,55%)",  glow: "rgba(100,116,139,.2)",  badge: "bg-muted border-border text-muted-foreground"           },
};

function rc(route: string) { return ROUTE_COLOR[route] ?? ROUTE_COLOR.Other; }

// ── Node : en-tête tier ───────────────────────────────────────────────────────

type TierHeaderData = { tier: Tier; count: number };

function TierHeaderNode({ data }: NodeProps) {
  const { tier, count } = data as TierHeaderData;
  const st = TIER_STYLE[tier];
  return (
    <div className="flex flex-col items-center justify-end pb-2 select-none" style={{ width: NODE_W, height: HDR_H }}>
      <div className={`w-1.5 h-1.5 rounded-full ${st.dot} mb-1`} />
      <span className={`text-[11px] font-bold uppercase tracking-widest ${st.label}`}>{tier}</span>
      <span className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{count} sys</span>
    </div>
  );
}

// ── Node : badge de route ─────────────────────────────────────────────────────

type RouteLabelData = { route: string };

function RouteLabelNode({ data }: NodeProps) {
  const { route } = data as RouteLabelData;
  const c = rc(route);
  return (
    <div className="flex items-center justify-center select-none" style={{ width: LABEL_W - 10 }}>
      <span className={`text-[11px] font-bold font-mono px-2.5 py-1.5 rounded-lg border ${c.badge}`}>
        {route}
      </span>
    </div>
  );
}

// ── Node : système SAP ────────────────────────────────────────────────────────

type SystemNodeData = { system: SAPSystem; stroke: string };

function SystemNode({ data }: NodeProps) {
  const { system: s, stroke } = data as SystemNodeData;
  return (
    <>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{ width: NODE_W }}
        className="relative rounded-xl border border-border bg-card px-3 pt-3 pb-2.5 cursor-pointer
                   group transition-all duration-200 hover:border-primary/50 hover:shadow-xl hover:shadow-black/40">

        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center
            font-mono text-xs font-bold flex-shrink-0 group-hover:scale-105 transition-transform
            ${getScoreBorderColor(s.healthScore)} ${getScoreBgColor(s.healthScore)} ${getScoreColor(s.healthScore)}`}>
            {s.healthScore}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
              {s.sid}
            </div>
            <div className="text-[10px] text-muted-foreground truncate font-mono leading-none mt-0.5">
              {s.hostname}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getStatusBadgeClass(s.healthStatus)}`}>
            {s.healthStatus}
          </span>
          {s.systemType && s.systemType !== "ABAP" && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${systemTypeClass(s.systemType)}`}>
              {s.systemType}
            </span>
          )}
          {s.stmsDomainController && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-primary/15 border border-primary/30 text-primary">DC</span>
          )}
          {s.alerts.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-status-warning font-medium">
              <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
              {s.alerts.length}
            </span>
          )}
          {s.isStale && <span className="text-[10px] text-status-warning/60">STALE</span>}
        </div>

        <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full opacity-60"
          style={{ background: stroke }} />
      </div>
    </>
  );
}

// ── Types de nœuds ────────────────────────────────────────────────────────────

const nodeTypes = {
  tierHeader:  TierHeaderNode,
  routeLabel:  RouteLabelNode,
  system:      SystemNode,
};

// ── Composant principal ───────────────────────────────────────────────────────

interface Props { systems: SAPSystem[] }

export function LandscapeSchema({ systems }: Props) {
  const navigate = useNavigate();

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    if (node.type === "system") navigate(`/system/${node.id}`);
  }, [navigate]);

  const { nodes, edges } = useMemo(() => {
    if (!systems.length) return { nodes: [], edges: [] };

    const activeTiers  = TIER_ORDER.filter(t => systems.some(s => s.tier === t));
    const activeRoutes = [...new Set(systems.map(s => s.transportLine || "Other"))];

    // X centré dans la colonne tier
    const colX = (ti: number) => LABEL_W + ti * COL_W + (COL_W - NODE_W) / 2;

    // Systèmes par (route, tier) — potentiellement plusieurs par cellule
    const cell = (route: string, tier: Tier) =>
      systems.filter(s => (s.transportLine || "Other") === route && s.tier === tier)
             .sort((a, b) => a.sid.localeCompare(b.sid));

    // Hauteur d'une ligne route = max systèmes dans une cellule × hauteur
    const routeRowH = (route: string) => {
      const maxStack = Math.max(1, ...activeTiers.map(t => cell(route, t).length));
      return maxStack * NODE_H + (maxStack - 1) * NODE_GAP + (ROUTE_H - NODE_H);
    };

    // Offset Y cumulé par route
    const routeY: Record<string, number> = {};
    let curY = HDR_H;
    activeRoutes.forEach(route => {
      routeY[route] = curY;
      curY += routeRowH(route);
    });

    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];

    // ── En-têtes tier ────────────────────────────────────────────────────────
    activeTiers.forEach((tier, ti) => {
      allNodes.push({
        id:       `hdr-${tier}`,
        type:     "tierHeader",
        position: { x: colX(ti), y: 0 },
        data:     { tier, count: systems.filter(s => s.tier === tier).length } as TierHeaderData,
        selectable: false,
        draggable:  false,
      });
    });

    // ── Badges route ─────────────────────────────────────────────────────────
    activeRoutes.forEach(route => {
      const rh = routeRowH(route);
      allNodes.push({
        id:       `lbl-${route}`,
        type:     "routeLabel",
        position: { x: 0, y: routeY[route] + rh / 2 - 18 },
        data:     { route } as RouteLabelData,
        selectable: false,
        draggable:  false,
      });
    });

    // ── Nœuds système ────────────────────────────────────────────────────────
    activeRoutes.forEach(route => {
      const rh   = routeRowH(route);
      const rowY = routeY[route];
      activeTiers.forEach((tier, ti) => {
        const cells = cell(route, tier);
        const totalH = cells.length * NODE_H + (cells.length - 1) * NODE_GAP;
        const startY = rowY + (rh - totalH) / 2;
        cells.forEach((sys, si) => {
          allNodes.push({
            id:       sys.id,
            type:     "system",
            position: { x: colX(ti), y: startY + si * (NODE_H + NODE_GAP) },
            data:     { system: sys, stroke: rc(route).stroke } as SystemNodeData,
            draggable: false,
          });
        });
      });
    });

    // ── Edges STMS (ou fallback heuristique) ─────────────────────────────────
    const bySid: Record<string, SAPSystem> = {};
    systems.forEach(s => { bySid[s.sid] = s; });

    const edgeSet = new Set<string>();

    const pushEdge = (srcId: string, tgtId: string, route: string) => {
      const eid = `${srcId}->${tgtId}`;
      if (edgeSet.has(eid)) return;
      edgeSet.add(eid);
      const c = rc(route);
      allEdges.push({
        id:        eid,
        source:    srcId,
        target:    tgtId,
        type:      "smoothstep",
        animated:  true,
        style:     { stroke: c.stroke, strokeWidth: 2, filter: `drop-shadow(0 0 4px ${c.glow})` },
        markerEnd: { type: "arrowclosed" as any, color: c.stroke, width: 18, height: 18 },
      });
    };

    // Connexions STMS explicites
    const stmsConns: { from: string; to: string; routeName: string }[] = [];
    const connSet = new Set<string>();
    systems.forEach(sys => {
      (sys.stmsRoutes ?? []).forEach(r => {
        const k = `${r.from}=>${r.to}`;
        if (!connSet.has(k)) { connSet.add(k); stmsConns.push(r); }
      });
    });

    if (stmsConns.length > 0) {
      stmsConns.forEach(conn => {
        const src = bySid[conn.from];
        const tgt = bySid[conn.to];
        if (src && tgt) pushEdge(src.id, tgt.id, conn.routeName || src.transportLine || "Other");
      });
    } else {
      // Fallback : relier par ordre de tier
      activeRoutes.forEach(route => {
        const ordered = systems
          .filter(s => (s.transportLine || "Other") === route)
          .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
        for (let i = 0; i < ordered.length - 1; i++) {
          if (ordered[i].tier !== ordered[i + 1].tier)
            pushEdge(ordered[i].id, ordered[i + 1].id, route);
        }
      });
    }

    return { nodes: allNodes, edges: allEdges };
  }, [systems]);

  if (!systems.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No systems to display.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1}
          style={{ opacity: 0.12 }} color="hsl(var(--border))" />
      </ReactFlow>
    </div>
  );
}
