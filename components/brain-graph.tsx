"use client";

import { useEffect, useMemo, useState } from "react";
import { OpsIcon } from "@/components/ops-icons";
import {
  brainEdges as fallbackEdges,
  brainNodes as fallbackNodes,
  type BrainEdge,
  type BrainNode,
} from "@/lib/ops-demo-data";

type GraphPayload = {
  available?: boolean;
  source?: string;
  nodes?: BrainNode[];
  edges?: BrainEdge[];
};

const typeMeta: Record<BrainNode["type"], { label: string; color: string }> = {
  company: { label: "Entreprise", color: "#071f47" },
  person: { label: "Équipe", color: "#326eae" },
  client: { label: "Clients", color: "#86bce2" },
  project: { label: "Projets", color: "#6f8da8" },
  document: { label: "Documents", color: "#f7fbff" },
  finance: { label: "Finance", color: "#e6a18d" },
  marketing: { label: "Marketing", color: "#b5a8d9" },
  decision: { label: "Décisions", color: "#4f806d" },
  knowledge: { label: "Savoir", color: "#7d9fa7" },
};

const edgeColors: Record<BrainEdge["type"], string> = {
  confirmed: "rgba(52, 91, 133, .38)",
  influence: "rgba(127, 104, 175, .38)",
  risk: "rgba(190, 104, 75, .5)",
  knowledge: "rgba(63, 118, 95, .46)",
};

export function BrainGraph({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [nodes, setNodes] = useState<BrainNode[]>(fallbackNodes);
  const [edges, setEdges] = useState<BrainEdge[]>(fallbackEdges);
  const [selected, setSelected] = useState("ORG-001");
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BrainNode["type"] | "all">("all");
  const [liveSource, setLiveSource] = useState("Démo Obsidian");
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/vault", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<GraphPayload> : null)
      .then((payload) => {
        if (!active || !payload?.available || !payload.nodes?.length || !payload.edges?.length) return;
        setNodes(payload.nodes);
        setEdges(payload.edges);
        setSelected(payload.nodes.find((node) => node.type === "company")?.id ?? payload.nodes[0].id);
        setLiveSource(payload.source === "obsidian" ? "Coffre Obsidian · en direct" : "Démo Obsidian");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const selectedNode = nodes.find((node) => node.id === selected) ?? nodes[0];
  const neighborIds = useMemo(() => {
    if (!hovered) return new Set(nodes.map((node) => node.id));
    const focus = hovered;
    const ids = new Set<string>([focus]);
    edges.forEach((edge) => {
      if (edge.from === focus) ids.add(edge.to);
      if (edge.to === focus) ids.add(edge.from);
    });
    return ids;
  }, [edges, hovered, nodes]);

  const visibleNodes = useMemo(() => {
    const normalized = query.toLocaleLowerCase("fr").trim();
    return nodes.filter((node) => {
      if (filter !== "all" && node.type !== filter) return false;
      if (normalized && !`${node.label} ${node.summary} ${node.id}`.toLocaleLowerCase("fr").includes(normalized)) return false;
      return true;
    });
  }, [filter, nodes, query]);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));

  const evidenceIds = new Set(["PROJET-241", "TEMPS-086", "ACHAT-109", "DEC-063", "CLI-001"]);

  return (
    <section className="brain-workspace">
      <div className="brain-toolbar">
        <div className="brain-search">
          <OpsIcon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans la mémoire…" />
          <kbd>⌘ K</kbd>
        </div>
        <button className={`soft-button ${showEvidence ? "active" : ""}`} onClick={() => setShowEvidence((value) => !value)}>
          <OpsIcon name="link" size={16} /> Voir les preuves
        </button>
        <div className="memory-live"><span /> {liveSource}</div>
      </div>

      <div className="brain-main">
        <aside className="brain-filters">
          <div className="brain-filter-head">
            <span>Afficher</span>
            <strong>{visibleNodes.length}</strong>
          </div>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            <i style={{ background: "#071f47" }} /> Tout le cerveau <span>{nodes.length}</span>
          </button>
          {(Object.keys(typeMeta) as BrainNode["type"][]).map((type) => {
            const count = nodes.filter((node) => node.type === type).length;
            if (!count) return null;
            return (
              <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>
                <i style={{ background: typeMeta[type].color }} /> {typeMeta[type].label} <span>{count}</span>
              </button>
            );
          })}
          <div className="brain-legend">
            <span>Relations</span>
            <p><i className="line confirmed" /> Confirmée</p>
            <p><i className="line influence" /> Influence</p>
            <p><i className="line risk" /> Risque</p>
          </div>
        </aside>

        <div className="graph-stage" aria-label="Graphe de la mémoire d’entreprise">
          <div className="graph-top-note">
            <span>La taille indique l’utilité dans les réponses</span>
            <span>Survolez un élément pour isoler ses relations</span>
          </div>
          <svg viewBox="0 0 1000 660" role="img" aria-label="Relations entre les données de l’entreprise">
            <defs>
              <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#0b2a52" floodOpacity=".14" />
              </filter>
              <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feFlood floodColor="#6ea7dd" floodOpacity=".42" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g className="graph-orbits" aria-hidden="true">
              <circle cx="500" cy="330" r="125" />
              <circle cx="500" cy="330" r="245" />
              <circle cx="500" cy="330" r="355" />
            </g>
            <g className="graph-edges">
              {edges.map((edge, index) => {
                if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
                const from = nodes.find((node) => node.id === edge.from);
                const to = nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                const active = Boolean(hovered) && neighborIds.has(edge.from) && neighborIds.has(edge.to);
                const evidence = showEvidence && evidenceIds.has(edge.from) && evidenceIds.has(edge.to);
                return (
                  <line
                    key={`${edge.from}-${edge.to}-${index}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={`${edge.type} ${active ? "active" : ""} ${evidence ? "evidence" : ""}`}
                    stroke={edgeColors[edge.type]}
                  />
                );
              })}
            </g>
            <g className="graph-nodes">
              {visibleNodes.map((node) => {
                const active = neighborIds.has(node.id);
                const isSelected = node.id === selected;
                const evidence = showEvidence && evidenceIds.has(node.id);
                const fill = typeMeta[node.type].color;
                const darkText = ["document"].includes(node.type);
                return (
                  <g
                    key={node.id}
                    className={`graph-node ${active ? "active" : "dimmed"} ${isSelected ? "selected" : ""} ${evidence ? "evidence" : ""}`}
                    transform={`translate(${node.x} ${node.y})`}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(node.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {isSelected && <circle r={node.size + 11} className="node-halo" />}
                    <circle r={node.size} fill={fill} filter={isSelected ? "url(#node-glow)" : "url(#node-shadow)"} />
                    {node.type === "document" && <circle r={node.size} fill="none" stroke="#91aac2" strokeWidth="1.4" />}
                    {(isSelected || hovered === node.id || ["company", "person", "client", "marketing"].includes(node.type)) && (
                      <text className={darkText ? "dark" : ""} y={node.size + 18} textAnchor="middle">{node.label}</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="graph-question-card">
            <span>Question suggérée</span>
            <button onClick={() => onAsk("Pourquoi la marge atelier baisse ?")}>Pourquoi la marge atelier baisse ? <OpsIcon name="arrow" size={15} /></button>
          </div>
        </div>

        {selectedNode && (
          <aside className="node-inspector">
            <div className="inspector-head">
              <span className="node-type-dot" style={{ background: typeMeta[selectedNode.type].color }} />
              <span>{typeMeta[selectedNode.type].label}</span>
              <button aria-label="Plus d’options"><OpsIcon name="dots" size={17} /></button>
            </div>
            <div className="inspector-id">{selectedNode.id}</div>
            <h3>{selectedNode.label}</h3>
            <p>{selectedNode.summary}</p>
            <div className="inspector-meta-grid">
              <div><span>Relations directes</span><strong>{edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id).length}</strong></div>
              <div><span>Confiance</span><strong>100 %</strong></div>
              <div><span>Dernière mise à jour</span><strong>Aujourd’hui</strong></div>
              <div><span>Source</span><strong>Obsidian</strong></div>
            </div>
            <div className="inspector-relations">
              <span>Connexions utiles</span>
              {edges
                .filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
                .slice(0, 4)
                .map((edge) => {
                  const otherId = edge.from === selectedNode.id ? edge.to : edge.from;
                  const other = nodes.find((node) => node.id === otherId);
                  if (!other) return null;
                  return <button key={`${edge.from}-${edge.to}`} onClick={() => setSelected(other.id)}><i style={{ background: typeMeta[other.type].color }} /><span>{other.label}</span><OpsIcon name="chevron" size={14} /></button>;
                })}
            </div>
            <button className="primary-button full" onClick={() => onAsk(`Explique-moi tout ce qui est important sur ${selectedNode.label}`)}>
              <OpsIcon name="spark" size={16} /> Demander à OPS
            </button>
          </aside>
        )}
      </div>
    </section>
  );
}
