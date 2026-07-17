"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

type SimNode = BrainNode & SimulationNodeDatum & {
  x: number;
  y: number;
};

type SimLink = SimulationLinkDatum<SimNode> & {
  source: string | number | SimNode;
  target: string | number | SimNode;
  edgeType: BrainEdge["type"];
};

type Viewport = { x: number; y: number; k: number };
type Interaction = {
  mode: "pan" | "node";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  node?: SimNode;
};

const typeMeta: Record<BrainNode["type"], { label: string; color: string }> = {
  company: { label: "Entreprise", color: "#172231" },
  person: { label: "Équipe", color: "#4e657d" },
  client: { label: "Clients", color: "#6385a6" },
  project: { label: "Projets", color: "#63717f" },
  document: { label: "Documents", color: "#8b9198" },
  finance: { label: "Finance", color: "#97766b" },
  marketing: { label: "Marketing", color: "#776f91" },
  decision: { label: "Décisions", color: "#5d776b" },
  knowledge: { label: "Savoir", color: "#6f7e80" },
};

const memorySeeds: Array<{
  id: string;
  label: string;
  type: BrainNode["type"];
  summary: string;
  links: string[];
}> = [
  { id: "EMAIL-901", label: "Facture de juin", type: "document", summary: "Email de Sophie Leclerc au sujet du règlement Atelier Sud.", links: ["CLI-002", "FACT-879"] },
  { id: "EMAIL-902", label: "Duplicata Nova", type: "document", summary: "Demande de duplicata avant le cycle de validation Nova.", links: ["CLI-003", "FACT-886"] },
  { id: "EMAIL-903", label: "Modification du hall", type: "document", summary: "Validation client d'une nouvelle finition pour Rivoli.", links: ["CLI-001", "PROJET-241", "DEC-063"] },
  { id: "EMAIL-905", label: "Échéance Cobalt", type: "document", summary: "Le règlement Maison Cobalt est annoncé pour lundi.", links: ["ORG-001", "RULE-002"] },
  { id: "EMAIL-908", label: "Plans techniques Orsay", type: "document", summary: "Le comité Hôtel Orsay attend le chiffrage final.", links: ["OPP-401", "PER-002"] },
  { id: "CALL-709", label: "Appel Nova", type: "document", summary: "Compte rendu de l'appel de suivi avec Nova Hôtels.", links: ["CLI-003", "OPP-404"] },
  { id: "CALL-711", label: "Découverte Orsay", type: "document", summary: "Appel de découverte ayant qualifié le projet Hôtel Orsay.", links: ["OPP-401", "PER-002"] },
  { id: "CR-1198", label: "Point Nova", type: "document", summary: "Engagements pris concernant les échantillons Nova.", links: ["CLI-003", "CALL-709"] },
  { id: "DEV-317", label: "Devis Orsay v3", type: "document", summary: "Proposition commerciale de 58 K€ en attente de validation.", links: ["OPP-401", "PER-002"] },
  { id: "BDC-241", label: "Bon de commande Rivoli", type: "document", summary: "Bon de commande rattaché au chantier Rivoli.", links: ["PROJET-241", "CONTRAT-241"] },
  { id: "PLAN-241-B", label: "Plan atelier B", type: "document", summary: "Dernière version du plan de fabrication Rivoli.", links: ["PROJET-241", "PER-003"] },
  { id: "PROC-003", label: "Contrôle qualité", type: "knowledge", summary: "Procédure de contrôle qualité utilisable par Hugo.", links: ["PER-003", "PER-005", "PROJET-241"] },
  { id: "RULE-001", label: "Validation externe", type: "knowledge", summary: "Aucune action externe ne part sans validation humaine.", links: ["ORG-001", "PER-001"] },
  { id: "TASK-642", label: "Calibration CNC", type: "project", summary: "Tâche dépendante du savoir de Thomas.", links: ["PER-003", "PROC-007"] },
  { id: "TASK-645", label: "Contrôle Rivoli", type: "project", summary: "Contrôle qualité du lot atelier Rivoli.", links: ["PROJET-241", "PER-005"] },
  { id: "TASK-650", label: "Échantillons Nova", type: "project", summary: "Échantillons corrigés à livrer le 18 juillet.", links: ["CLI-003", "PER-005"] },
  { id: "PLANNING-W29", label: "Planning semaine 29", type: "project", summary: "Capacité, jalons et dépendances de la semaine.", links: ["PER-003", "PER-005", "DEC-058"] },
  { id: "FACT-890", label: "Facture Cobalt", type: "finance", summary: "Facture de 4,1 K€ en attente depuis huit jours.", links: ["ORG-001", "EMAIL-905"] },
  { id: "FACT-893", label: "Maintenance juillet", type: "finance", summary: "Facture de maintenance de 2,9 K€.", links: ["ORG-001", "PER-004"] },
  { id: "PAY-775", label: "Paiement Rivoli", type: "finance", summary: "Dernier paiement reçu pour le projet Rivoli.", links: ["CLI-001", "FACT-882"] },
  { id: "FIN-SNAPSHOT", label: "Trésorerie 67 jours", type: "finance", summary: "Visibilité de trésorerie nette à 67 jours.", links: ["ORG-001", "PER-004", "STRAT-2026-Q3"] },
  { id: "CRM-SNAPSHOT", label: "Pipeline 184 K€", type: "project", summary: "État courant des quatre opportunités ouvertes.", links: ["ORG-001", "PER-002", "OPP-401", "OPP-404"] },
  { id: "OPP-402", label: "Maison Lenoir", type: "project", summary: "Opportunité de 34 K€ apportée par un architecte.", links: ["PER-001", "CRM-SNAPSHOT"] },
  { id: "OPP-403", label: "Studio Cime", type: "project", summary: "Opportunité de 20 K€ attribuée à Instagram.", links: ["IG-492", "CRM-SNAPSHOT"] },
  { id: "CLI-004", label: "Maison Cobalt", type: "client", summary: "Relation sensible avec un règlement annoncé.", links: ["FACT-890", "EMAIL-905"] },
  { id: "CLI-006", label: "Studio Marais", type: "client", summary: "Client dormant depuis 76 jours, à réactiver.", links: ["PER-002", "CRM-SNAPSHOT"] },
  { id: "CON-102", label: "Sophie Leclerc", type: "person", summary: "Contact principal chez Atelier Sud.", links: ["CLI-002", "EMAIL-901"] },
  { id: "CON-118", label: "Pierre Lenoir", type: "person", summary: "Contact finance chez Nova Hôtels.", links: ["CLI-003", "EMAIL-902"] },
  { id: "FOUR-021", label: "Bois & Placages", type: "client", summary: "Fournisseur du placage chêne Rivoli.", links: ["ACHAT-109", "PROJET-241"] },
  { id: "DEC-061", label: "Relances clients", type: "decision", summary: "Deux relances prêtes et soumises à Marie.", links: ["PER-001", "FACT-879", "FACT-886", "RULE-001"] },
  { id: "ALERT-201", label: "Marge Rivoli", type: "decision", summary: "Alerte expliquant la baisse de marge du chantier.", links: ["PROJET-241", "TEMPS-086", "ACHAT-109"] },
  { id: "ALERT-202", label: "Créances 24,3 K€", type: "decision", summary: "Trois factures dépassent le délai habituel.", links: ["FACT-879", "FACT-886", "FACT-890"] },
  { id: "ALERT-203", label: "Qualité Meta", type: "decision", summary: "Aucun lead Meta qualifié malgré 312 € dépensés.", links: ["META-2026-07", "STRAT-2026-Q3"] },
  { id: "SYNTH-DAILY", label: "Brief du 15 juillet", type: "knowledge", summary: "Synthèse quotidienne des décisions et signaux.", links: ["ORG-001", "ALERT-201", "ALERT-202", "OPP-401"] },
  { id: "SYNTH-W28", label: "Synthèse semaine 28", type: "knowledge", summary: "Thèmes, contradictions et engagements de la semaine.", links: ["STRAT-2026-Q3", "PER-001", "PROJET-241"] },
  { id: "KNOW-CNC-02", label: "Réglage lame CNC", type: "knowledge", summary: "Réglage transmis oralement par Thomas.", links: ["EXP-THOMAS-01", "PROC-007"] },
  { id: "KNOW-FIN-04", label: "Cycle Nova", type: "knowledge", summary: "Règle informelle du cycle de validation Nova.", links: ["CLI-003", "CON-118", "RULE-002"] },
  { id: "GADS-QUERY-01", label: "agencement hôtel Paris", type: "marketing", summary: "Requête Search générant la meilleure demande qualifiée.", links: ["GADS-2026-07", "SEO-001", "OPP-401"] },
  { id: "META-CREA-12", label: "Portfolio retargeting", type: "marketing", summary: "Création Meta en fatigue depuis douze jours.", links: ["META-2026-07", "ALERT-203"] },
  { id: "CONTENT-RIVOLI", label: "Étude de cas Rivoli", type: "marketing", summary: "Contenu recommandé pour SEO, Ads et prospection.", links: ["SEO-001", "IG-492", "PROJET-241"] },
  { id: "MISSION-029", label: "Réactivation dormants", type: "decision", summary: "Mission de scoring des anciens clients.", links: ["CLI-005", "CLI-006", "PER-002"] },
  { id: "MISSION-030", label: "Analyse de marge", type: "decision", summary: "Mission terminée, trois causes identifiées.", links: ["ALERT-201", "PROJET-241"] },
  { id: "MISSION-031", label: "Relances impayés", type: "decision", summary: "Brouillons prêts, deux validations requises.", links: ["DEC-061", "ALERT-202"] },
];

const fallbackIds = new Set(fallbackNodes.map((node) => node.id));
const generatedNodes: BrainNode[] = memorySeeds
  .filter((seed) => !fallbackIds.has(seed.id))
  .map((seed, index) => ({
    id: seed.id,
    label: seed.label,
    type: seed.type,
    summary: seed.summary,
    x: 160 + ((index * 137) % 680),
    y: 90 + ((index * 83) % 480),
    size: 10 + Math.min(seed.links.length, 4) * 1.5,
    source: "demo",
  }));

const generatedIds = new Set(generatedNodes.map((node) => node.id));
const generatedEdges: BrainEdge[] = memorySeeds
  .filter((seed) => generatedIds.has(seed.id))
  .flatMap((seed) => seed.links.map((target) => ({
    from: seed.id,
    to: target,
    type: seed.type === "marketing" ? "influence" : seed.id.startsWith("ALERT") ? "risk" : seed.type === "knowledge" ? "knowledge" : "confirmed",
  } as BrainEdge)))
  .filter((edge) => fallbackIds.has(edge.to) || generatedIds.has(edge.to));

const demoNodes = [...fallbackNodes, ...generatedNodes];
const semanticDemoEdges = [...fallbackEdges, ...generatedEdges];
const connectedToCompany = new Set(
  semanticDemoEdges.flatMap((edge) => edge.from === "ORG-001" ? [edge.to] : edge.to === "ORG-001" ? [edge.from] : []),
);
const memorySpineEdges: BrainEdge[] = demoNodes
  .filter((node) => node.id !== "ORG-001" && !connectedToCompany.has(node.id))
  .map((node) => ({ from: "ORG-001", to: node.id, type: "knowledge" }));
const demoEdges = [...semanticDemoEdges, ...memorySpineEdges];
const evidenceIds = new Set(["PROJET-241", "TEMPS-086", "ACHAT-109", "DEC-063", "CLI-001"]);

function nodeRadius(node: BrainNode) {
  // Obsidian keeps the graph legible through density, not oversized markers.
  // The restrained scale preserves hierarchy while letting hundreds of notes
  // coexist without turning the canvas into a wall of dots.
  if (node.type === "company") return 6.4;
  return Math.max(1.25, Math.min(4.1, 1.2 + Math.max(0, node.size - 18) * .14));
}

function simNode(value: string | number | SimNode) {
  return typeof value === "object" ? value : null;
}

function graphFingerprint(nodes: BrainNode[], edges: BrainEdge[]) {
  const nodeParts = nodes
    .map((node) => `${node.id}:${node.type}:${node.label}:${node.summary}:${node.size}`)
    .sort();
  const edgeParts = edges
    .map((edge) => `${edge.from}:${edge.to}:${edge.type}`)
    .sort();
  return `${nodeParts.join("|")}::${edgeParts.join("|")}`;
}

export function BrainGraph({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [nodes, setNodes] = useState<BrainNode[]>(demoNodes);
  const [edges, setEdges] = useState<BrainEdge[]>(demoEdges);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BrainNode["type"] | "all">("all");
  const [liveSource, setLiveSource] = useState("Démo Obsidian");
  const [showEvidence, setShowEvidence] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(100);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, k: 1 });
  const interactionRef = useRef<Interaction | null>(null);
  const hasInteractedRef = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const paintRef = useRef<() => void>(() => undefined);
  const graphRequestRef = useRef<AbortController | null>(null);
  const graphFingerprintRef = useRef("");

  selectedRef.current = selected;
  hoveredRef.current = hovered;

  const refreshGraph = useCallback(async () => {
    graphRequestRef.current?.abort();
    const controller = new AbortController();
    graphRequestRef.current = controller;

    try {
      const response = await fetch("/api/vault", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const payload = await response.json() as GraphPayload;
      if (
        controller.signal.aborted
        || !payload.available
        || !payload.nodes?.length
        || !payload.edges?.length
      ) return;

      const nextFingerprint = graphFingerprint(payload.nodes, payload.edges);
      if (nextFingerprint !== graphFingerprintRef.current) {
        graphFingerprintRef.current = nextFingerprint;
        setNodes(payload.nodes);
        setEdges(payload.edges);
        setSelected((current) => (
          current && payload.nodes?.some((node) => node.id === current)
            ? current
            : null
        ));
      }
      setLiveSource(payload.source === "obsidian" ? "Obsidian · en direct" : "Démo Obsidian");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Le graphe déjà affiché reste disponible si la synchronisation échoue.
      }
    } finally {
      if (graphRequestRef.current === controller) graphRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleRecordCreated = () => {
      void refreshGraph();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshGraph();
    };

    void refreshGraph();
    document.addEventListener("ops-record-created", handleRecordCreated);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const polling = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshGraph();
    }, 20_000);

    return () => {
      window.clearInterval(polling);
      document.removeEventListener("ops-record-created", handleRecordCreated);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      graphRequestRef.current?.abort();
      graphRequestRef.current = null;
    };
  }, [refreshGraph]);

  const degreeMap = useMemo(() => {
    const result = new Map<string, number>();
    edges.forEach((edge) => {
      result.set(edge.from, (result.get(edge.from) ?? 0) + 1);
      result.set(edge.to, (result.get(edge.to) ?? 0) + 1);
    });
    return result;
  }, [edges]);

  const neighbors = useMemo(() => {
    const result = new Map<string, Set<string>>();
    nodes.forEach((node) => result.set(node.id, new Set([node.id])));
    edges.forEach((edge) => {
      result.get(edge.from)?.add(edge.to);
      result.get(edge.to)?.add(edge.from);
    });
    return result;
  }, [edges, nodes]);

  const selectedNode = selected ? nodes.find((node) => node.id === selected) ?? null : null;
  const selectedRelations = selectedNode
    ? edges
      .filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
      .map((edge) => nodes.find((node) => node.id === (edge.from === selectedNode.id ? edge.to : edge.from)))
      .filter((node): node is BrainNode => Boolean(node))
      .slice(0, 6)
    : [];

  paintRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height, dpr } = sizeRef.current;
    if (!width || !height) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const viewport = viewportRef.current;
    const normalizedQuery = query.toLocaleLowerCase("fr").trim();
    const focusId = hoveredRef.current ?? selectedRef.current;
    const focusNeighbors = focusId ? neighbors.get(focusId) ?? new Set([focusId]) : null;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(viewport.x, viewport.y);
    context.scale(viewport.k, viewport.k);
    context.lineCap = "round";

    linksRef.current.forEach((link) => {
      const source = simNode(link.source);
      const target = simNode(link.target);
      if (!source || !target) return;
      const connected = focusNeighbors ? focusNeighbors.has(source.id) && focusNeighbors.has(target.id) : false;
      const queryActive = normalizedQuery.length > 0;
      const queryMatch = queryActive && (
        source.label.toLocaleLowerCase("fr").includes(normalizedQuery)
        || target.label.toLocaleLowerCase("fr").includes(normalizedQuery)
      );
      const typeMatch = filter === "all" || source.type === filter || target.type === filter;
      const evidence = showEvidence && evidenceIds.has(source.id) && evidenceIds.has(target.id);

      let opacity = .145;
      if (focusNeighbors) opacity = connected ? .62 : .018;
      if (queryActive) opacity = queryMatch ? .7 : .018;
      if (!typeMatch) opacity *= .12;
      if (evidence) opacity = .9;

      context.globalAlpha = opacity;
      context.strokeStyle = evidence ? "#346fa8" : link.edgeType === "risk" ? "#8e746d" : "#5f6770";
      context.lineWidth = (evidence ? 1.15 : connected ? .72 : .44) / viewport.k;
      context.setLineDash(link.edgeType === "influence" ? [2.5 / viewport.k, 3.5 / viewport.k] : []);
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    });
    context.setLineDash([]);

    nodesRef.current.forEach((node) => {
      const isSelected = node.id === selectedRef.current;
      const isHovered = node.id === hoveredRef.current;
      const isNeighbor = focusNeighbors ? focusNeighbors.has(node.id) : true;
      const queryMatch = !normalizedQuery || (node.label + " " + node.summary + " " + node.id).toLocaleLowerCase("fr").includes(normalizedQuery);
      const typeMatch = filter === "all" || node.type === filter;
      const evidence = showEvidence && evidenceIds.has(node.id);
      let opacity = 1;
      if (!isNeighbor) opacity = .13;
      if (!queryMatch) opacity *= .12;
      if (!typeMatch) opacity *= .10;

      const radius = nodeRadius(node) * (isHovered ? 1.32 : 1);
      context.globalAlpha = opacity;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = evidence ? "#346fa8" : isSelected ? "#172231" : isHovered ? "#315f8b" : node.type === "company" ? "#2e3339" : "#5b5f64";
      context.fill();

      if (isSelected || evidence) {
        context.globalAlpha = opacity * .74;
        context.beginPath();
        context.arc(node.x, node.y, radius + 3.5 / viewport.k, 0, Math.PI * 2);
        context.strokeStyle = evidence ? "#2f6eac" : "#326eae";
        context.lineWidth = .9 / viewport.k;
        context.stroke();
      }

      const showLabel = isSelected || isHovered || node.type === "company";
      if (showLabel && opacity > .25) {
        const fontSize = (isSelected || isHovered ? 10.5 : 9.5) / viewport.k;
        const labelY = node.y + radius + 11 / viewport.k;
        context.globalAlpha = Math.min(1, opacity + .15);
        context.font = (isSelected || isHovered ? "600 " : "500 ") + fontSize + "px ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 3.5 / viewport.k;
        context.strokeStyle = "rgba(255,255,255,.96)";
        context.strokeText(node.label, node.x, labelY);
        context.fillStyle = "#303740";
        context.fillText(node.label, node.x, labelY);
      }
    });

    context.restore();
    context.globalAlpha = 1;
  };

  const fitGraph = useCallback((animated = false) => {
    const graphNodes = nodesRef.current;
    const { width, height } = sizeRef.current;
    if (!graphNodes.length || !width || !height) return;
    const xs = graphNodes.map((node) => node.x);
    const ys = graphNodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const graphWidth = Math.max(120, maxX - minX);
    const graphHeight = Math.max(120, maxY - minY);
    const nextScale = Math.max(.32, Math.min(2.35, Math.min((width - 118) / graphWidth, (height - 112) / graphHeight)));
    const target = {
      k: nextScale,
      x: width / 2 - ((minX + maxX) / 2) * nextScale,
      y: height / 2 - ((minY + maxY) / 2) * nextScale,
    };

    if (!animated) {
      viewportRef.current = target;
      setZoomLabel(Math.round(target.k * 100));
      paintRef.current();
      return;
    }

    const start = { ...viewportRef.current };
    const startedAt = performance.now();
    const duration = 360;
    const step = (now: number) => {
      const raw = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      viewportRef.current = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        k: start.k + (target.k - start.k) * eased,
      };
      paintRef.current();
      if (raw < 1) requestAnimationFrame(step);
      else setZoomLabel(Math.round(target.k * 100));
    };
    requestAnimationFrame(step);
  }, []);

  const centerNode = useCallback((node: SimNode, targetScale = 1.8) => {
    const { width, height } = sizeRef.current;
    if (!width || !height) return;
    const target = {
      k: Math.max(1.2, Math.min(3.6, targetScale)),
      x: width / 2 - node.x * Math.max(1.2, Math.min(3.6, targetScale)),
      y: height / 2 - node.y * Math.max(1.2, Math.min(3.6, targetScale)),
    };
    const start = { ...viewportRef.current };
    const startedAt = performance.now();
    const step = (now: number) => {
      const raw = Math.min(1, (now - startedAt) / 320);
      const eased = 1 - Math.pow(1 - raw, 3);
      viewportRef.current = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        k: start.k + (target.k - start.k) * eased,
      };
      paintRef.current();
      if (raw < 1) requestAnimationFrame(step);
      else setZoomLabel(Math.round(target.k * 100));
    };
    requestAnimationFrame(step);
  }, []);

  const zoomAt = useCallback((factor: number, screenX?: number, screenY?: number) => {
    const { width, height } = sizeRef.current;
    const viewport = viewportRef.current;
    const anchorX = screenX ?? width / 2;
    const anchorY = screenY ?? height / 2;
    const graphX = (anchorX - viewport.x) / viewport.k;
    const graphY = (anchorY - viewport.y) / viewport.k;
    const nextScale = Math.max(.24, Math.min(6, viewport.k * factor));
    viewportRef.current = {
      k: nextScale,
      x: anchorX - graphX * nextScale,
      y: anchorY - graphY * nextScale,
    };
    hasInteractedRef.current = true;
    setZoomLabel(Math.round(nextScale * 100));
    paintRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * .001);
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const previous = sizeRef.current;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      sizeRef.current = { width, height, dpr };
      if (!previous.width) viewportRef.current = { x: width / 2, y: height / 2, k: 1 };
      else {
        viewportRef.current.x += (width - previous.width) / 2;
        viewportRef.current.y += (height - previous.height) / 2;
      }
      paintRef.current();
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const simNodes: SimNode[] = nodes.map((node, index) => ({
      ...node,
      x: Number.isFinite(node.x) ? (node.x - 500) * .82 : Math.cos(index * 2.39) * (74 + Math.sqrt(index + 1) * 19),
      y: Number.isFinite(node.y) ? (node.y - 330) * .82 : Math.sin(index * 2.39) * (74 + Math.sqrt(index + 1) * 19),
    }));
    const validIds = new Set(simNodes.map((node) => node.id));
    const simLinks: SimLink[] = edges
      .filter((edge) => validIds.has(edge.from) && validIds.has(edge.to))
      .map((edge) => ({ source: edge.from, target: edge.to, edgeType: edge.type }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    hasInteractedRef.current = false;

    const simulation = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((node) => node.id).distance((link) => link.edgeType === "knowledge" ? 58 : link.edgeType === "influence" ? 72 : 51).strength(.2))
      .force("charge", forceManyBody<SimNode>().strength((node) => node.type === "company" ? -118 : -42).distanceMax(520).theta(.72))
      .force("center", forceCenter<SimNode>(0, 0).strength(.048))
      .force("collision", forceCollide<SimNode>().radius((node) => nodeRadius(node) + 2.8).strength(.7).iterations(2))
      .alphaDecay(.024)
      .velocityDecay(.31)
      .on("tick", () => paintRef.current());

    simulationRef.current = simulation;
    const firstFit = window.setTimeout(() => {
      if (!hasInteractedRef.current) fitGraph(false);
    }, 700);
    const finalFit = window.setTimeout(() => {
      if (!hasInteractedRef.current) fitGraph(true);
    }, 1500);

    return () => {
      window.clearTimeout(firstFit);
      window.clearTimeout(finalFit);
      simulation.stop();
      simulationRef.current = null;
    };
  }, [edges, fitGraph, nodes]);

  useEffect(() => {
    paintRef.current();
  }, [degreeMap, filter, hovered, neighbors, query, selected, showEvidence]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const graphPoint = (screenX: number, screenY: number) => {
    const viewport = viewportRef.current;
    return { x: (screenX - viewport.x) / viewport.k, y: (screenY - viewport.y) / viewport.k };
  };

  const findNode = (screenX: number, screenY: number) => {
    const point = graphPoint(screenX, screenY);
    const viewport = viewportRef.current;
    for (let index = nodesRef.current.length - 1; index >= 0; index -= 1) {
      const node = nodesRef.current[index];
      if (filter !== "all" && node.type !== filter) continue;
      const radius = nodeRadius(node) + 7 / viewport.k;
      if (Math.hypot(node.x - point.x, node.y - point.y) <= radius) return node;
    }
    return null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const node = findNode(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode: node ? "node" : "pan",
      startX: point.x,
      startY: point.y,
      originX: viewportRef.current.x,
      originY: viewportRef.current.y,
      moved: false,
      node: node ?? undefined,
    };
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simulationRef.current?.alphaTarget(.18).restart();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const interaction = interactionRef.current;
    if (interaction) {
      const dx = point.x - interaction.startX;
      const dy = point.y - interaction.startY;
      if (Math.hypot(dx, dy) > 3) interaction.moved = true;
      hasInteractedRef.current = true;
      if (interaction.mode === "pan") {
        viewportRef.current.x = interaction.originX + dx;
        viewportRef.current.y = interaction.originY + dy;
      } else if (interaction.node) {
        const next = graphPoint(point.x, point.y);
        interaction.node.fx = next.x;
        interaction.node.fy = next.y;
      }
      paintRef.current();
      return;
    }
    const nextHovered = findNode(point.x, point.y)?.id ?? null;
    if (nextHovered !== hoveredRef.current) setHovered(nextHovered);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction) return;
    if (interaction.mode === "node" && interaction.node) {
      interaction.node.fx = interaction.node.x;
      interaction.node.fy = interaction.node.y;
      simulationRef.current?.alphaTarget(0);
      if (!interaction.moved) setSelected(interaction.node.id);
    } else if (!interaction.moved) {
      setSelected(null);
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    paintRef.current();
  };

  const handleDoubleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const node = findNode(point.x, point.y);
    if (node) {
      setSelected(node.id);
      centerNode(node, 2.2);
    } else {
      fitGraph(true);
    }
  };

  const runSearch = () => {
    const normalized = query.toLocaleLowerCase("fr").trim();
    if (!normalized) return;
    const match = nodesRef.current.find((node) => (node.label + " " + node.summary + " " + node.id).toLocaleLowerCase("fr").includes(normalized));
    if (match) {
      setSelected(match.id);
      centerNode(match, 2.15);
    }
  };

  return (
    <section className="brain-workspace">
      <header className="brain-toolbar">
        <div className="brain-search">
          <OpsIcon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }}
            placeholder="Rechercher une personne, un client, une décision…"
          />
          {query ? <button onClick={() => setQuery("")} aria-label="Effacer"><OpsIcon name="close" size={14} /></button> : <kbd>⌘ K</kbd>}
        </div>
        <div className="brain-live">
          <span><i /> {liveSource}</span>
          <strong>{nodes.length} notes</strong>
          <strong>{edges.length} liens</strong>
        </div>
        <div className="graph-zoom-controls">
          <button onClick={() => zoomAt(1.22)} aria-label="Zoom avant"><OpsIcon name="plus" size={16} /></button>
          <span>{zoomLabel}%</span>
          <button onClick={() => zoomAt(1 / 1.22)} aria-label="Zoom arrière"><OpsIcon name="minus" size={16} /></button>
          <button onClick={() => fitGraph(true)} aria-label="Voir tout le graphe"><OpsIcon name="fit" size={16} /></button>
        </div>
      </header>

      <div className="brain-typebar" aria-label="Filtres du graphe">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tout <span>{nodes.length}</span></button>
        {(Object.keys(typeMeta) as BrainNode["type"][]).map((type) => {
          const count = nodes.filter((node) => node.type === type).length;
          if (!count) return null;
          return <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}><i style={{ background: typeMeta[type].color }} />{typeMeta[type].label}<span>{count}</span></button>;
        })}
        <button className={showEvidence ? "evidence active" : "evidence"} onClick={() => setShowEvidence((value) => !value)}><OpsIcon name="link" size={14} /> Chemin de preuve</button>
      </div>

      <div className="graph-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className={hovered ? "is-hovering" : ""}
          aria-label="Graphe interactif de la mémoire de l'entreprise"
          role="application"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => { if (!interactionRef.current) setHovered(null); }}
          onDoubleClick={handleDoubleClick}
        />

        <div className="graph-status">
          <span className="graph-pulse" />
          <span>Graphe vivant</span>
          <i />
          <span>Glissez pour déplacer</span>
          <i />
          <span>Molette pour zoomer</span>
          <i />
          <span>Double-clic pour centrer</span>
        </div>

        {selectedNode && (
          <aside className="node-inspector-floating">
            <header>
              <span><i style={{ background: typeMeta[selectedNode.type].color }} /> {typeMeta[selectedNode.type].label}</span>
              <button onClick={() => setSelected(null)} aria-label="Fermer"><OpsIcon name="close" size={16} /></button>
            </header>
            <div className="node-inspector-id">{selectedNode.id}</div>
            <h3>{selectedNode.label}</h3>
            <p>{selectedNode.summary}</p>
            <div className="node-inspector-stats">
              <span><strong>{degreeMap.get(selectedNode.id) ?? 0}</strong> relations</span>
              <span><strong>100 %</strong> confiance</span>
            </div>
            <div className="node-relation-list">
              <small>Connexions directes</small>
              {selectedRelations.map((relation) => (
                <button key={relation.id} onClick={() => {
                  setSelected(relation.id);
                  const target = nodesRef.current.find((node) => node.id === relation.id);
                  if (target) centerNode(target, 1.9);
                }}>
                  <i style={{ background: typeMeta[relation.type].color }} />
                  <span>{relation.label}</span>
                  <OpsIcon name="arrow" size={13} />
                </button>
              ))}
            </div>
            <footer>
              <button onClick={() => {
                const target = nodesRef.current.find((node) => node.id === selectedNode.id);
                if (target) centerNode(target, 2.2);
              }}><OpsIcon name="target" size={15} /> Centrer</button>
              <button className="dark" onClick={() => onAsk(`Ouvre la source ${selectedNode.id} (${selectedNode.label}), cite ses faits clés, ses relations et ce qu'elle change pour la décision.`)}><OpsIcon name="spark" size={15} /> Demander à OPS</button>
            </footer>
          </aside>
        )}
      </div>
    </section>
  );
}
