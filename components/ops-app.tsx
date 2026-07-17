"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BrainGraph } from "@/components/brain-graph";
import { OpsIcon } from "@/components/ops-icons";
import { VoiceMode, type VoiceModeHandle } from "@/components/voice-mode";
import {
  acquisitionChannels,
  agentScenarios,
  approvals,
  attentionItems,
  clients,
  company,
  cycleStages,
  documents,
  emailThreads,
  kpis,
  missions,
  navGroups,
  opportunities,
  pageMeta,
  planningDays,
  planningRows,
  type AgentScenario,
  type IconName,
  type OpsDocument,
  type PageId,
} from "@/lib/ops-demo-data";
import type {
  ListedOpsDocument,
  OpsDocumentPlan,
  StoredOpsDocument,
} from "@/lib/ops-document";
import type { OpsAgentActionResult } from "@/lib/ops-agent-actions";
import type { OpsCompanyState } from "@/lib/ops-company-state";
import {
  playStreamingAudioResponse,
  type StreamingAudioPlayback,
} from "@/lib/streaming-audio";
import {
  parseOpsResponseMarkdown,
  plainTextFromOpsMarkdown,
  type OpsInlineSegment,
} from "@/lib/ops-response-markdown";

type OpenAgent = (prompt?: string) => void;

type PersistedRecord = {
  id: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
  attributes: Record<string, string | number | boolean | null | Array<string | number | boolean>>;
  relations: string[];
};

type SourceEvidence = {
  id: string;
  title: string;
  type: string;
  summary: string;
  facts: string[];
  relations: string[];
  updatedAt: string;
  source: string | null;
  path: string;
  attributes: Record<string, string | number | boolean | null | Array<string | number | boolean>>;
  content: string;
  related: Array<{
    id: string;
    title: string;
    type: string;
    summary: string;
    relation: "incoming" | "outgoing" | "bidirectional";
    updatedAt: string;
    source: string | null;
    path: string;
  }>;
};

async function createOpsRecord(payload: Record<string, unknown>) {
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    record?: { id: string; title: string; createdAt: string };
  };
  if (!response.ok || !result.record) throw new Error(result.error ?? "record_write_failed");
  document.dispatchEvent(new CustomEvent("ops-record-created", {
    detail: { kind: payload.kind, id: result.record.id },
  }));
  return result.record;
}

async function updateOpsRecord(id: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/records", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, id }),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    record?: { id: string; title: string; createdAt: string };
  };
  if (!response.ok || !result.record) throw new Error(result.error ?? "record_update_failed");
  document.dispatchEvent(new CustomEvent("ops-record-created", {
    detail: { kind: payload.kind, id: result.record.id },
  }));
  return result.record;
}

type OpportunityView = (typeof opportunities)[number];
type ClientView = (typeof clients)[number] & { email?: string };
type PlanningTaskView = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "open" | "in_progress" | "done";
  description: string;
  project: string;
  dayIndex: number;
  weekOffset: number;
};

function safeNumber(
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
) {
  const normalized = typeof value === "string"
    ? value.trim().replace(",", ".")
    : value;
  if (normalized === "") return fallback;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function useCompanyState() {
  const [state, setState] = useState<OpsCompanyState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/company-state", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => (
          response.ok
            ? response.json() as Promise<OpsCompanyState>
            : null
        ))
        .then((payload) => {
          if (!controller.signal.aborted && payload) setState(payload);
        })
        .catch(() => {
          // Les valeurs de démonstration restent visibles si le vault est indisponible.
        });
    };
    const refresh = () => load();
    load();
    document.addEventListener("ops-record-created", refresh);
    const interval = window.setInterval(load, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  return state;
}

function formatCompactEuro(value: number | null | undefined, fallback: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toLocaleString("fr-FR", {
      minimumFractionDigits: value % 1_000 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })} K€`;
  }
  return `${value.toLocaleString("fr-FR")} €`;
}

function formatDecimal(value: number | null | undefined, fallback: string, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${suffix}`;
}

function companyKpis(state: OpsCompanyState | null, livePipeline: number) {
  return kpis.map((kpi) => {
    if (kpi.label === "Pipeline") {
      return { ...kpi, value: formatCompactEuro(livePipeline, kpi.value) };
    }
    if (kpi.label === "CA du mois") {
      return { ...kpi, value: formatCompactEuro(state?.finance.revenueMonth, kpi.value) };
    }
    if (kpi.label === "Marge moyenne") {
      return { ...kpi, value: formatDecimal(state?.finance.marginPercent, kpi.value, " %") };
    }
    if (kpi.label === "Trésorerie") {
      return { ...kpi, value: formatDecimal(state?.finance.cashVisibilityDays, kpi.value, " j") };
    }
    return kpi;
  });
}

function usePersistedOpportunities() {
  const [items, setItems] = useState<OpportunityView[]>(opportunities);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/records?kind=opportunity", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => response.ok
          ? response.json() as Promise<{ records?: PersistedRecord[] }>
          : { records: [] })
        .then(({ records = [] }) => {
          if (controller.signal.aborted) return;
          const stored = records.map((record): OpportunityView => ({
            id: record.id,
            name: record.title,
            amount: Number(record.attributes.amount) || 0,
            stage: (typeof record.attributes.stage === "string"
              ? record.attributes.stage
              : "Qualification") as OpportunityView["stage"],
            probability: Number(record.attributes.probability) || 0,
            owner: typeof record.attributes.owner === "string"
              ? record.attributes.owner
              : "Marie",
            source: typeof record.attributes.source_channel === "string"
              ? record.attributes.source_channel
              : "OPS",
            next: typeof record.attributes.next_action === "string"
              ? record.attributes.next_action
              : "À définir",
          }));
          // Dès que PostgreSQL répond, cette liste devient l'unique vérité de
          // l'écran. Le portefeuille local n'est qu'un état de continuité hors
          // connexion et ne doit jamais créer de doubles opportunités.
          setItems(stored.length > 0 ? stored : opportunities);
        })
        .catch(() => {
          // Les données de démonstration restent disponibles hors connexion.
        });
    };
    const refresh = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "opportunity") load();
    };
    load();
    document.addEventListener("ops-record-created", refresh);
    return () => {
      controller.abort();
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  return [items, setItems] as const;
}

function usePersistedClients() {
  const [items, setItems] = useState<ClientView[]>(clients);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/records?kind=client", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => response.ok
          ? response.json() as Promise<{ records?: PersistedRecord[] }>
          : { records: [] })
        .then(({ records = [] }) => {
          if (controller.signal.aborted) return;
          const stored = records.map((record): ClientView => {
            const words = record.title.split(/\s+/).filter(Boolean);
            const revenue = safeNumber(record.attributes.revenue_12m, 0, 0, 100_000_000);
            const margin = safeNumber(record.attributes.margin_percent, 0, -100, 100);
            const health = safeNumber(record.attributes.health_score, 0, 0, 100);
            return {
              id: record.id,
              name: record.title,
              initials: words.map((word) => word[0]).join("").slice(0, 2).toLocaleUpperCase("fr"),
              owner: typeof record.attributes.owner === "string" ? record.attributes.owner : "Marie",
              revenue: `${(revenue / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} K€`,
              margin: `${margin.toLocaleString("fr-FR")} %`,
              last: typeof record.attributes.last_interaction === "string" ? record.attributes.last_interaction : "Aujourd’hui",
              health,
              status: (typeof record.attributes.status === "string" ? record.attributes.status : "Prospect") as ClientView["status"],
              opportunity: typeof record.attributes.next_opportunity === "string" ? record.attributes.next_opportunity : "À qualifier",
              email: typeof record.attributes.email === "string" ? record.attributes.email : "",
            };
          });
          setItems(stored.length > 0 ? stored : clients);
        })
        .catch(() => {
          // Le portefeuille fictif reste visible sans écriture serveur.
        });
    };
    const refresh = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "client") load();
    };
    load();
    document.addEventListener("ops-record-created", refresh);
    return () => {
      controller.abort();
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  return [items, setItems] as const;
}

function usePersistedPlanningTasks() {
  const [items, setItems] = useState<PlanningTaskView[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/records?kind=task", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => response.ok
          ? response.json() as Promise<{ records?: PersistedRecord[] }>
          : { records: [] })
        .then(({ records = [] }) => {
          if (controller.signal.aborted) return;
          const stored = records.flatMap((record): PlanningTaskView[] => {
            const dayIndex = Number(record.attributes.day_index);
            const weekOffset = Number(record.attributes.week_offset);
            const project = typeof record.attributes.project === "string"
              ? record.attributes.project
              : "";
            if (!project || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 4) return [];
            return [{
              id: record.id,
              title: record.title,
              owner: typeof record.attributes.owner === "string" ? record.attributes.owner : "Marie",
              due: typeof record.attributes.due === "string" ? record.attributes.due : "À planifier",
              status: (typeof record.attributes.status === "string"
                ? record.attributes.status
                : "open") as PlanningTaskView["status"],
              description: record.summary,
              project,
              dayIndex,
              weekOffset: Number.isInteger(weekOffset) ? weekOffset : 0,
            }];
          });
          setItems(stored);
        })
        .catch(() => {
          // Le planning de démonstration reste lisible si le vault est indisponible.
        });
    };
    const refresh = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "task") load();
    };
    load();
    document.addEventListener("ops-record-created", refresh);
    return () => {
      controller.abort();
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  return [items, setItems] as const;
}

function Logo() {
  return <div className="ops-wordmark" aria-label="OPS">OPS<span>°</span></div>;
}

function IconTile({ name, active = false }: { name: IconName; active?: boolean }) {
  return <span className={`nav-icon ${active ? "active" : ""}`}><OpsIcon name={name} size={20} strokeWidth={1.65} /></span>;
}

function Sidebar({ page, setPage, collapsed, setCollapsed, openAgent, mobileOpen, onMobileClose }: {
  page: PageId;
  setPage: (page: PageId) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  openAgent: OpenAgent;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <aside className={`ops-sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-top">
        <Logo />
        <button
          className="sidebar-collapse"
          onClick={() => mobileOpen ? onMobileClose() : setCollapsed(!collapsed)}
          aria-label={mobileOpen ? "Fermer la navigation" : collapsed ? "Déployer la navigation" : "Réduire la navigation"}
          aria-expanded={!collapsed}
        >
          <span /><span />
        </button>
      </div>
      <button className="workspace-card" onClick={() => { onMobileClose(); openAgent("Présente-moi l’état complet d’Atelier Beaumarchais, les faits récents et les décisions qui demandent mon attention."); }}>
        <span className="workspace-monogram">{company.initials}</span>
        <span className="workspace-copy"><strong>{company.name}</strong><small>{company.trade}</small></span>
        <OpsIcon name="chevron" size={14} />
      </button>
      <button className="sidebar-search" onClick={() => { onMobileClose(); document.dispatchEvent(new CustomEvent("ops-command")); }}>
        <OpsIcon name="search" size={16} /><span>Rechercher</span><kbd>⌘ K</kbd>
      </button>
      <nav className="sidebar-nav" aria-label="Navigation OPS">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-title">{group.label}</span>
            {group.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => { setPage(item.id); onMobileClose(); }}
                title={item.label}
                aria-label={item.label}
                aria-current={page === item.id ? "page" : undefined}
              >
                <IconTile name={item.icon} active={page === item.id} />
                <span className="nav-label">{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-user" onClick={() => { onMobileClose(); openAgent("Prépare mon brief personnel de direction : décisions, validations, rendez-vous et sujets à suivre."); }}>
          <span className="user-avatar">MD</span>
          <span><strong>Marie Delmas</strong><small>Direction</small></span>
          <OpsIcon name="dots" size={16} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ page, openAgent, onMobileMenu }: { page: PageId; openAgent: OpenAgent; onMobileMenu: () => void }) {
  return (
    <header className="ops-topbar">
      <div className="topbar-location-wrap">
        <button className="mobile-nav-toggle" aria-label="Ouvrir la navigation" onClick={onMobileMenu} type="button"><span /><span /></button>
        <div className="topbar-location"><span>OPS</span><i>/</i><strong>{pageMeta[page].title}</strong></div>
      </div>
      <div className="topbar-actions">
        <button className="topbar-search" onClick={() => document.dispatchEvent(new CustomEvent("ops-command"))}>
          <OpsIcon name="search" size={15} /><span>Rechercher ou commander</span><kbd>⌘ K</kbd>
        </button>
        <span className="sync-status"><i /> {company.synced}</span>
        <button className="validation-button" onClick={() => openAgent("Que dois-je valider aujourd’hui ?")}>2 validations</button>
        <button className="topbar-avatar" onClick={() => openAgent("Prépare mon brief personnel de direction pour aujourd’hui.")}>MD</button>
      </div>
    </header>
  );
}

function PageHeading({ page, action, description }: { page: PageId; action?: React.ReactNode; description?: string }) {
  const meta = pageMeta[page];
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{description ?? meta.description}</p></div>
      {action}
    </div>
  );
}

function SourceChips({ sources }: { sources: string[] }) {
  return (
    <div className="source-chips">
      {sources.map((source) => (
        <button
          key={source}
          onClick={() => document.dispatchEvent(new CustomEvent("ops-open-source", { detail: source }))}
          type="button"
        >
          <OpsIcon name="link" size={12} />{source}
        </button>
      ))}
    </div>
  );
}

function OpsModal({ open, title, description, onClose, children }: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    window.requestAnimationFrame(() => (focusable ?? dialog)?.focus());

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )].filter((item) => item.offsetParent !== null);
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="ops-modal-backdrop" onMouseDown={onClose}>
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ops-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div><span className="eyebrow">OPS · MÉMOIRE VIVANTE</span><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
          <button aria-label="Fermer" onClick={onClose} type="button"><OpsIcon name="close" size={17} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function SourceEvidenceDialog({ requested, evidence, loading, error, onClose, openAgent }: {
  requested: string | null;
  evidence: SourceEvidence | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  openAgent: OpenAgent;
}) {
  const attributes = evidence
    ? Object.entries(evidence.attributes)
      .filter(([, value]) => value !== null && value !== "" && (!Array.isArray(value) || value.length))
      .slice(0, 8)
    : [];
  const readableValue = (value: SourceEvidence["attributes"][string]) => (
    Array.isArray(value) ? value.join(" · ") : String(value)
  );

  return (
    <OpsModal
      open={Boolean(requested)}
      title={evidence?.title ?? requested ?? "Source"}
      description={evidence
        ? `${evidence.id} · ${evidence.source || "Mémoire OPS"} · preuve consultée directement`
        : "Lecture de la note et de ses relations dans la mémoire de l’entreprise."
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="source-evidence-loading" role="status"><i /><span>Ouverture de la source…</span></div>
      ) : error ? (
        <div className="source-evidence-error">
          <OpsIcon name="document" size={22} />
          <strong>Cette preuve n’est pas disponible.</strong>
          <p>{error}</p>
          {requested ? <button onClick={() => { onClose(); openAgent(`Retrouve la source ${requested} dans toute la mémoire et explique ce qu’elle établit.`); }}>La rechercher avec OPS</button> : null}
        </div>
      ) : evidence ? (
        <div className="source-evidence-body">
          <div className="source-evidence-meta">
            <span><OpsIcon name="shield" size={14} /> Source vérifiée</span>
            <small>{evidence.path}</small>
          </div>

          {evidence.facts.length ? (
            <section className="source-evidence-facts">
              <span className="eyebrow">Faits extraits</span>
              <ul>{evidence.facts.slice(0, 10).map((fact) => <li key={fact}>{fact}</li>)}</ul>
            </section>
          ) : null}

          <section className="source-evidence-note">
            <span className="eyebrow">Contenu de la note</span>
            <OpsMarkdownResponse value={evidence.content || evidence.summary} />
          </section>

          {attributes.length ? (
            <section className="source-evidence-attributes">
              <span className="eyebrow">Données structurées</span>
              <dl>{attributes.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{readableValue(value)}</dd></div>)}</dl>
            </section>
          ) : null}

          {evidence.related.length ? (
            <section className="source-evidence-relations">
              <span className="eyebrow">Relations utiles</span>
              <div>{evidence.related.map((item) => (
                <button
                  key={`${item.relation}-${item.id}`}
                  onClick={() => document.dispatchEvent(new CustomEvent("ops-open-source", { detail: item.id }))}
                  type="button"
                >
                  <span><strong>{item.title}</strong><small>{item.id} · {item.relation === "bidirectional" ? "lien réciproque" : item.relation === "incoming" ? "mentionne cette source" : "cité par cette source"}</small></span>
                  <OpsIcon name="arrow" size={15} />
                </button>
              ))}</div>
            </section>
          ) : null}

          <footer className="source-evidence-actions">
            <button onClick={() => navigator.clipboard?.writeText(evidence.content || evidence.summary)} type="button"><OpsIcon name="copy" size={15} /> Copier</button>
            <button className="primary-button" onClick={() => { onClose(); openAgent(`Analyse uniquement la source ${evidence.id}, puis explique les décisions qu’elle soutient en citant ses relations utiles.`); }} type="button"><OpsIcon name="spark" size={15} /> Interroger cette source</button>
          </footer>
        </div>
      ) : null}
    </OpsModal>
  );
}

function MiniComposer({ openAgent, placeholder = "Demandez quelque chose à votre entreprise…" }: { openAgent: OpenAgent; placeholder?: string }) {
  const [value, setValue] = useState("");
  return (
    <form className="mini-composer" onSubmit={(event) => { event.preventDefault(); if (value.trim()) openAgent(value.trim()); }}>
      <span className="mini-orb"><OpsIcon name="spark" size={17} /></span>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      <button type="submit" aria-label="Envoyer"><OpsIcon name="arrow" size={18} /></button>
    </form>
  );
}

function numbersPresentation(
  companyState: OpsCompanyState | null,
  liveKpis: ReturnType<typeof companyKpis>,
  activeTab: string,
  period: "Mensuel" | "Hebdomadaire",
) {
  const tabKpis: Record<string, typeof liveKpis> = {
    "Vue d’ensemble": liveKpis,
    Activité: [
      { label: "CA du mois", value: formatCompactEuro(companyState?.finance.revenueMonth, "42,8 K€"), delta: "Source finance", tone: "positive", page: "numbers" },
      { label: "Pipeline pondéré", value: formatCompactEuro(companyState?.crm.weightedPipeline, "96 K€"), delta: "Prévision équipe", tone: "neutral", page: "crm" },
      { label: "Opportunités", value: formatDecimal(companyState?.crm.opportunities, "4"), delta: "Ouvertes", tone: "neutral", page: "crm" },
      { label: "Transformation", value: formatDecimal(companyState?.crm.conversionRate90d, "31", " %"), delta: "Sur 90 jours", tone: "positive", page: "crm" },
    ],
    Marge: [
      { label: "Marge moyenne", value: formatDecimal(companyState?.finance.marginPercent, "29", " %"), delta: "−2,1 pts", tone: "negative", page: "numbers" },
      { label: "Charge atelier", value: formatDecimal(companyState?.operations.workshopLoadPercent, "86", " %"), delta: "Capacité suivie", tone: "neutral", page: "planning" },
      { label: "Projets à risque", value: formatDecimal(companyState?.operations.projectsAtRisk, "2"), delta: "À arbitrer", tone: "negative", page: "planning" },
      { label: "Capacité disponible", value: formatDecimal(companyState?.operations.availableCapacityDays, "4", " j"), delta: "À positionner", tone: "positive", page: "planning" },
    ],
    Trésorerie: [
      { label: "Visibilité cash", value: formatDecimal(companyState?.finance.cashVisibilityDays, "67", " j"), delta: "Stable", tone: "neutral", page: "numbers" },
      { label: "Créances en retard", value: formatCompactEuro(companyState?.finance.overdueReceivables, "24,3 K€"), delta: "À traiter", tone: "negative", page: "numbers" },
      { label: "Actionnable", value: formatCompactEuro(companyState?.finance.immediatelyActionableReceivables, "20,2 K€"), delta: "Relances validées", tone: "positive", page: "emails" },
      { label: "Pipeline pondéré", value: formatCompactEuro(companyState?.crm.weightedPipeline, "96 K€"), delta: "Entrées futures", tone: "neutral", page: "crm" },
    ],
    Acquisition: [
      { label: "Dépenses payantes", value: formatCompactEuro(companyState?.acquisition.totalPaidSpend, "1 K€"), delta: "Canaux payants", tone: "neutral", page: "numbers" },
      { label: "Pipeline attribué", value: formatCompactEuro(companyState?.acquisition.attributedPipeline, "86 K€"), delta: "Multi-canal", tone: "positive", page: "crm" },
      { label: "Leads qualifiés", value: formatDecimal(companyState?.acquisition.qualifiedLeads, "6"), delta: "Tous canaux", tone: "positive", page: "crm" },
      { label: "Google Ads", value: formatDecimal(companyState?.googleAds.qualifiedLeads, "5"), delta: "Leads qualifiés", tone: "positive", page: "numbers" },
    ],
    SEO: [
      { label: "Clics organiques", value: formatDecimal(companyState?.seo.clicks, "447"), delta: companyState?.seo.window ?? "28 jours", tone: "positive", page: "numbers" },
      { label: "Impressions", value: formatDecimal(companyState?.seo.impressions, "15 820"), delta: "Search Console", tone: "positive", page: "numbers" },
      { label: "CTR moyen", value: formatDecimal(companyState?.seo.ctrPercent, "2,83", " %"), delta: "Trafic non-marque", tone: "neutral", page: "numbers" },
      { label: "Position moyenne", value: formatDecimal(companyState?.seo.averagePosition, "13,4"), delta: "Plus bas = mieux", tone: "positive", page: "numbers" },
    ],
  };
  const visibleKpis = tabKpis[activeTab] ?? liveKpis;
  const tabCharts: Record<string, {
    legend: [string, string];
    monthly: { primary: string; secondary: string; area: string; labels: string[] };
    weekly: { primary: string; secondary: string; area: string; labels: string[] };
    insight: string;
    source?: string;
  }> = {
    "Vue d’ensemble": {
      legend: ["Chiffre d’affaires", "Marge"],
      monthly: { primary: "M0 205 C80 190 105 142 170 155 S260 120 340 130 S445 75 510 102 S620 54 720 62", secondary: "M0 150 C90 138 130 132 190 121 S310 110 380 124 S490 136 555 144 S650 160 720 174", area: "M0 205 C80 190 105 142 170 155 S260 120 340 130 S445 75 510 102 S620 54 720 62 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 186 C80 172 128 138 180 151 S292 95 356 111 S470 82 540 91 S642 61 720 69", secondary: "M0 126 C90 116 148 122 215 137 S330 147 402 158 S520 151 594 166 S676 172 720 180", area: "M0 186 C80 172 128 138 180 151 S292 95 356 111 S470 82 540 91 S642 61 720 69 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "Le CA progresse, mais la marge se dégrade. Rivoli explique l’essentiel de l’écart.",
      source: companyState?.finance.source?.id,
    },
    Activité: {
      legend: ["CA réalisé", "Pipeline pondéré"],
      monthly: { primary: "M0 216 C88 202 121 171 184 168 S279 142 348 131 S454 118 518 91 S629 73 720 58", secondary: "M0 195 C92 184 132 162 205 171 S315 143 389 151 S485 107 559 117 S654 89 720 96", area: "M0 216 C88 202 121 171 184 168 S279 142 348 131 S454 118 518 91 S629 73 720 58 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 194 C82 185 118 149 181 157 S286 128 352 118 S455 100 520 79 S635 62 720 71", secondary: "M0 179 C91 167 145 143 207 151 S319 120 389 132 S492 101 557 109 S649 83 720 91", area: "M0 194 C82 185 118 149 181 157 S286 128 352 118 S455 100 520 79 S635 62 720 71 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "L’activité reste en croissance et le pipeline pondéré donne une visibilité commerciale exploitable.",
      source: companyState?.crm.source?.id,
    },
    Marge: {
      legend: ["Marge réalisée", "Charge atelier"],
      monthly: { primary: "M0 104 C91 96 142 105 209 117 S322 127 391 145 S496 158 565 169 S660 181 720 193", secondary: "M0 184 C88 171 142 157 211 144 S323 114 396 103 S503 83 574 76 S665 68 720 64", area: "M0 104 C91 96 142 105 209 117 S322 127 391 145 S496 158 565 169 S660 181 720 193 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 121 C96 117 153 129 220 139 S335 146 402 163 S514 169 586 181 S674 186 720 191", secondary: "M0 174 C95 161 147 137 216 129 S329 103 402 91 S512 79 585 68 S671 65 720 59", area: "M0 121 C96 117 153 129 220 139 S335 146 402 163 S514 169 586 181 S674 186 720 191 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "La marge est sous l’objectif tandis que la charge atelier augmente ; deux projets demandent un arbitrage.",
      source: companyState?.operations.source?.id,
    },
    Trésorerie: {
      legend: ["Visibilité de trésorerie", "Créances en retard"],
      monthly: { primary: "M0 117 C84 111 132 107 200 112 S315 105 388 101 S499 97 566 91 S660 88 720 84", secondary: "M0 189 C90 180 142 171 213 159 S323 145 395 132 S502 118 574 105 S660 92 720 73", area: "M0 117 C84 111 132 107 200 112 S315 105 388 101 S499 97 566 91 S660 88 720 84 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 102 C87 99 139 104 208 101 S320 97 390 94 S501 90 573 88 S659 86 720 84", secondary: "M0 174 C88 162 143 150 211 137 S322 124 392 111 S501 99 572 87 S657 76 720 67", area: "M0 102 C87 99 139 104 208 101 S320 97 390 94 S501 90 573 88 S659 86 720 84 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "La visibilité reste stable, mais 24,3 K€ de créances doivent être convertis en encaissements.",
      source: companyState?.finance.source?.id,
    },
    Acquisition: {
      legend: ["Pipeline attribué", "Dépenses payantes"],
      monthly: { primary: "M0 213 C91 201 134 181 201 167 S313 139 384 124 S490 95 561 82 S654 61 720 53", secondary: "M0 194 C91 188 140 174 207 168 S319 150 391 143 S500 132 571 123 S658 116 720 108", area: "M0 213 C91 201 134 181 201 167 S313 139 384 124 S490 95 561 82 S654 61 720 53 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 198 C86 188 135 169 202 154 S316 126 386 111 S495 91 567 72 S654 56 720 48", secondary: "M0 181 C89 177 144 166 212 157 S322 143 393 136 S503 122 573 116 S659 109 720 102", area: "M0 198 C86 188 135 169 202 154 S316 126 386 111 S495 91 567 72 S654 56 720 48 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "Google Ads concentre l’efficacité payante ; Meta doit être arbitré avant toute hausse de budget.",
      source: companyState?.acquisition.source?.id,
    },
    SEO: {
      legend: ["Clics organiques", "Position moyenne"],
      monthly: { primary: "M0 219 C88 207 130 185 197 169 S310 141 382 121 S487 98 557 81 S651 58 720 49", secondary: "M0 87 C92 94 140 101 207 111 S318 121 389 132 S498 141 568 151 S655 158 720 169", area: "M0 219 C88 207 130 185 197 169 S310 141 382 121 S487 98 557 81 S651 58 720 49 L720 260 L0 260Z", labels: ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil."] },
      weekly: { primary: "M0 191 C86 181 133 161 201 147 S313 123 384 105 S492 85 563 69 S654 54 720 45", secondary: "M0 98 C89 105 143 113 210 122 S319 131 391 140 S500 149 570 157 S656 163 720 171", area: "M0 191 C86 181 133 161 201 147 S313 123 384 105 S492 85 563 69 S654 54 720 45 L720 260 L0 260Z", labels: ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] },
      insight: "Les clics et la visibilité progressent ; l’étude de cas Rivoli et les correctifs techniques sont prioritaires.",
      source: companyState?.seo.source?.id,
    },
  };
  const activeChart = tabCharts[activeTab] ?? tabCharts["Vue d’ensemble"];
  const chartSeries = period === "Mensuel" ? activeChart.monthly : activeChart.weekly;
  return { visibleKpis, activeChart, chartSeries };
}

function TodayPage({ setPage, openAgent }: { setPage: (page: PageId) => void; openAgent: OpenAgent }) {
  const companyState = useCompanyState();
  const [pipelineItems] = usePersistedOpportunities();
  const livePipeline = pipelineItems.reduce((sum, item) => sum + item.amount, 0);
  const liveKpis = companyKpis(companyState, livePipeline);
  return (
    <div className="content-page today-page">
      <PageHeading page="today" action={<button className="primary-button" onClick={() => openAgent()}><OpsIcon name="spark" size={16} /> Parler à OPS</button>} />
      <MiniComposer openAgent={openAgent} />
      <section className="kpi-row">
        {liveKpis.map((kpi) => (
          <button key={kpi.label} onClick={() => setPage(kpi.page)} className="kpi-card">
            <span>{kpi.label}</span><strong>{kpi.value}</strong><small className={kpi.tone}>{kpi.delta}</small><i><b style={{ width: kpi.label === "Marge moyenne" ? "41%" : "72%" }} /></i>
          </button>
        ))}
      </section>
      <div className="today-grid">
        <section className="panel attention-panel">
          <div className="panel-title"><div><span>Ce qui demande attention</span><small>Priorisé par impact</small></div><button onClick={() => openAgent("Filtre tout ce qui demande mon attention par urgence, impact financier et décision requise.")}><OpsIcon name="filter" size={15} /> Filtrer</button></div>
          <div className="attention-list">
            {attentionItems.map((item) => (
              <article className="attention-row" key={item.title}>
                <span className={`attention-level ${item.tone}`}>{item.level}</span>
                <div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.source}</small></div>
                <button onClick={() => openAgent(item.prompt)}>Demander à OPS <OpsIcon name="arrow" size={14} /></button>
              </article>
            ))}
          </div>
        </section>
        <div className="today-side">
          <section className="panel missions-panel">
            <div className="panel-title"><div><span>Missions actives</span><small>3 en cours</small></div><button onClick={() => openAgent("Liste toutes les missions actives, leurs responsables, leur progression, leurs blocages et leur prochaine action.")}>Tout voir</button></div>
            {missions.map((mission) => (
              <button className="mission-row" key={mission.id} onClick={() => openAgent(`Montre la mission ${mission.title}`)}>
                <span className="mission-agent"><OpsIcon name="spark" size={15} /></span>
                <span><strong>{mission.title}</strong><small>{mission.owner} · {mission.next}</small><i><b style={{ width: `${mission.progress}%` }} /></i></span>
                <em>{mission.status}</em>
              </button>
            ))}
          </section>
          <section className="panel approval-panel">
            <div className="panel-title"><div><span>À décider</span><small>Votre validation est requise</small></div></div>
            {approvals.map((approval) => (
              <article key={approval.id}>
                <div><span>{approval.id}</span><em>{approval.risk}</em></div>
                <strong>{approval.title}</strong><p>{approval.meta}</p>
                <footer><small>{approval.due}</small><button onClick={() => openAgent(`Explique la validation ${approval.id}`)}>Examiner</button></footer>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  prompt?: string;
  scenario?: AgentScenario;
  text?: string;
  loading?: boolean;
  statusText?: string;
  document?: OpsDocument;
  actions?: OpsAgentActionResult[];
  progressKind?: "analysis" | "pdf";
  progressStartedAt?: number;
  progressStage?: string;
  progressLabel?: string;
  progressDetail?: string;
  progressEtaMs?: number;
  progressUpdatedAt?: number;
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

function serializeChatMessage(message: ChatMessage): ConversationTurn | null {
  if (message.role === "user") {
    const content = message.prompt?.trim();
    return content ? { role: "user", content } : null;
  }

  const answer = (message.text?.trim() || [message.scenario?.lead, ...(message.scenario?.body ?? [])]
    .filter(Boolean)
    .join("\n\n"))
    .trim();
  const sources = message.scenario?.sources.length
    ? `Sources citées : ${message.scenario.sources.join(", ")}.`
    : "";
  const document = message.document
    ? `Document produit : ${message.document.name} (${message.document.id}, ${message.document.pages ?? 3} pages, disponible dans Documents).`
    : "";
  const actions = message.actions?.length
    ? `Actions structurées : ${message.actions.map((action) => {
        const record = action.record ? `, enregistrement ${action.record.id}` : "";
        return `${action.type} (${action.status}${record})`;
      }).join("; ")}.`
    : "";
  const content = [answer, sources, document, actions].filter(Boolean).join("\n\n");
  return content ? { role: "assistant", content } : null;
}

function buildConversationHistory(messages: ChatMessage[]) {
  const turns = messages.map(serializeChatMessage).filter((turn): turn is ConversationTurn => Boolean(turn));
  return turns.slice(-24);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function createReply(id: string, lead: string, body: string[], sources: string[], followups: string[]): AgentScenario {
  return { id, label: lead, keywords: [], lead, body, sources, followups };
}

function emptyAgentScenario(label: string): AgentScenario {
  return {
    id: "opencode-pending",
    label,
    keywords: [],
    lead: "",
    body: [],
    sources: [],
    followups: [],
  };
}

function createConversationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `conv_${globalThis.crypto.randomUUID()}`;
  }
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function storedDocumentToUi(document: StoredOpsDocument | ListedOpsDocument): OpsDocument {
  return {
    ...document,
    objectUrl: document.url || undefined,
  };
}

async function generatePdfDocument(plan: OpsDocumentPlan, signal?: AbortSignal): Promise<OpsDocument> {
  const response = await fetch("/api/documents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
    signal,
  });
  if (!response.ok) throw new Error("document_generation_failed");

  const blob = await response.blob();
  const id = response.headers.get("X-Document-Id");
  if (!id) throw new Error("document_id_missing");
  const encodedName = response.headers.get("X-Document-Name");
  const name = encodedName
    ? decodeURIComponent(encodedName)
    : `${plan.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLocaleLowerCase("fr") || "rapport-ops"}.pdf`;
  const url = response.headers.get("X-Document-Url") ?? `/api/documents/${id}`;

  return {
    id,
    name,
    type: "Rapport PDF",
    linked: plan.subtitle || "Direction",
    owner: "OPS",
    updated: "À l’instant",
    status: "Généré",
    facts: plan.sources.length,
    size: formatBytes(blob.size),
    pages: Number(response.headers.get("X-Document-Pages") ?? 1),
    generated: true,
    url,
    objectUrl: url,
    downloadUrl: `${url}?download=1`,
    createdAt: new Date().toISOString(),
    sources: plan.sources,
  };
}

function AgentProgress({ kind, startedAt, stage, label, detail, etaMs, updatedAt }: {
  kind: "analysis" | "pdf";
  startedAt: number;
  stage?: string;
  label?: string;
  detail?: string;
  etaMs?: number;
  updatedAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 300);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const stages = kind === "pdf"
    ? [
        { label: "Je consulte la mémoire", icon: "brain" as IconName, at: 0 },
        { label: "Je rapproche les documents", icon: "project" as IconName, at: 700 },
        { label: "Je prépare le PDF", icon: "document" as IconName, at: 1_500 },
      ]
    : [
        { label: "Je consulte la mémoire", icon: "brain" as IconName, at: 0 },
        { label: "Je rapproche les documents", icon: "project" as IconName, at: 650 },
        { label: "Je structure la réponse", icon: "spark" as IconName, at: 1_450 },
      ];
  const localIndex = stages.reduce((current, item, index) => elapsed >= item.at ? index : current, 0);
  const normalizedStage = `${stage ?? ""} ${label ?? ""}`.toLocaleLowerCase("fr");
  const serverIndex = /pdf|r[eé]daction|r[eé]ponse|synth[eè]se|compose|final/.test(normalizedStage)
    ? 2
    : /document|source|preuve|rapproche|evidence/.test(normalizedStage)
      ? 1
      : /m[eé]moire|recherche|search|context/.test(normalizedStage)
        ? 0
        : null;
  const activeIndex = serverIndex ?? localIndex;
  const target = kind === "pdf" ? 2_600 : 2_200;
  const serverElapsed = Math.max(0, now - (updatedAt ?? startedAt));
  const effectiveRemaining = typeof etaMs === "number" ? etaMs - serverElapsed : target - elapsed;
  const remaining = Math.max(1, Math.ceil(effectiveRemaining / 1_000));

  return (
    <div className="agent-progress" aria-live="polite">
      <span className="assistant-mark"><OpsIcon name="spark" size={18} /></span>
      <div className="agent-progress-card">
        <header><strong>{label || (kind === "pdf" ? "Création du document" : "Analyse en cours")}</strong><span>{effectiveRemaining > 0 ? `environ ${remaining} s` : "finalisation en cours"}</span></header>
        {detail ? <p>{detail}</p> : null}
        <div className="agent-progress-steps">
          {stages.map((stage, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
            return (
              <div className={`agent-progress-step ${state}`} key={stage.label}>
                <i>{state === "done" ? <OpsIcon name="check" size={12} /> : <OpsIcon name={stage.icon} size={13} />}</i>
                <span>{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        .agent-progress { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 15px; margin: 0 0 22px; }
        .agent-progress-card { width: min(570px, 100%); padding: 14px 16px 15px; background: #fbfbfa; border: 1px solid #e8e9e9; border-radius: 15px; }
        .agent-progress-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .agent-progress-card header strong { color: #282b2e; font-size: 10px; font-weight: 680; }
        .agent-progress-card header span { color: #969ba0; font-size: 8px; }
        .agent-progress-card > p { margin: -4px 0 12px; color: #7d8388; font-size: 8px; line-height: 1.45; }
        .agent-progress-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
        .agent-progress-step { min-width: 0; display: flex; align-items: center; gap: 7px; color: #afb3b7; font-size: 8px; transition: color 180ms ease; }
        .agent-progress-step i { width: 23px; height: 23px; flex: 0 0 auto; display: grid; place-items: center; color: #979ca2; background: #f2f3f3; border-radius: 8px; font-style: normal; }
        .agent-progress-step span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agent-progress-step.done { color: #5d7568; }
        .agent-progress-step.done i { color: #4c7860; background: #eaf1ed; }
        .agent-progress-step.active { color: #25282b; font-weight: 640; }
        .agent-progress-step.active i { color: #2f67a5; background: #eaf2fb; animation: progress-pulse 1.4s ease-in-out infinite; }
        @keyframes progress-pulse { 50% { box-shadow: 0 0 0 5px rgba(47, 103, 165, .08); } }
        @media (max-width: 640px) { .agent-progress-steps { grid-template-columns: 1fr; }.agent-progress-step span { white-space: normal; } }
        @media (prefers-reduced-motion: reduce) { .agent-progress-step.active i { animation: none; } }
      `}</style>
    </div>
  );
}

type AgentStreamEvent =
  | {
      type: "meta";
      scenario: AgentScenario;
      mode?: string;
      document?: OpsDocumentPlan;
      actions?: OpsAgentActionResult[];
      memoryCommit?: { id: string; title: string; relativePath?: string } | null;
    }
  | { type: "progress"; stage: string; label: string; detail?: string; etaMs?: number }
  | { type: "delta"; delta: string }
  | { type: "replace"; text: string }
  | { type: "speech"; text: string }
  | { type: "error"; message: string; retryable?: boolean }
  | { type: "done" };

function FullComposer({ value, setValue, onSubmit, onStop, onVoice, onAttach, processing, centered = false }: {
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onVoice: () => void;
  onAttach: () => void;
  processing: boolean;
  centered?: boolean;
}) {
  return (
    <div className={`full-composer ${centered ? "centered" : ""}`}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); } }}
        placeholder="Demander à OPS"
        rows={1}
      />
      <div className="composer-actions">
        <div><button aria-label="Joindre un document" onClick={onAttach} type="button"><OpsIcon name="plus" size={23} /></button><button className="context-select" onClick={() => document.dispatchEvent(new CustomEvent("ops-command"))} type="button">Toute l’entreprise <OpsIcon name="chevron" size={13} /></button></div>
        <div><button type="button" aria-label="Démarrer une conversation vocale" onClick={onVoice}><OpsIcon name="microphone" size={21} /></button><button type="button" className="voice-button" onClick={processing ? onStop : onSubmit} aria-label={processing ? "Interrompre" : "Envoyer"}>{processing ? <span className="stop-square" /> : <OpsIcon name="send" size={20} />}</button></div>
      </div>
    </div>
  );
}

function PdfArtifactCard({ document, openDocuments }: {
  document: OpsDocument;
  openDocuments: (documentId?: string) => void;
}) {
  const fileUrl = document.url ?? document.objectUrl ?? document.dataUrl;
  const downloadUrl = document.downloadUrl ?? fileUrl;
  if (!fileUrl) return null;
  return (
    <article className="pdf-result-card">
      <div className="pdf-result-preview" aria-hidden="true">
        <OpsIcon name="document" size={21} />
        <i /><i /><i />
        <span>PDF</span>
      </div>
      <div className="pdf-result-copy">
        <span className="pdf-result-status"><i /> Document prêt</span>
        <strong>{document.name}</strong>
        <small>{document.id} · {document.pages ?? 3} pages · {document.size ?? "—"} · {document.facts} éléments reliés</small>
      </div>
      <div className="pdf-result-actions">
        <a className="primary" href={fileUrl} target="_blank" rel="noreferrer"><OpsIcon name="folder" size={14} /> Ouvrir le PDF</a>
        <a href={downloadUrl} download={document.name} aria-label={`Télécharger ${document.name}`}><OpsIcon name="download" size={15} /></a>
        <button type="button" onClick={() => openDocuments(document.id)} aria-label="Voir dans Documents"><OpsIcon name="arrow" size={15} /></button>
      </div>
      <style jsx>{`
        .pdf-result-card { width: min(660px, 100%); margin-top: 20px; padding: 14px; display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; gap: 14px; color: #222529; background: #fff; border: 1px solid #e0e2e3; border-radius: 17px; box-shadow: 0 14px 42px rgba(18, 22, 28, .055); }
        .pdf-result-preview { position: relative; width: 52px; height: 66px; padding: 10px 9px; display: flex; flex-direction: column; gap: 4px; color: #1d2023; background: linear-gradient(145deg, #fafafa, #f1f2f2); border: 1px solid #e6e7e7; border-radius: 10px; overflow: hidden; }
        .pdf-result-preview i { width: 26px; height: 2px; display: block; background: #d5d8da; border-radius: 2px; }
        .pdf-result-preview i:nth-of-type(2) { width: 21px; }
        .pdf-result-preview span { position: absolute; right: 5px; bottom: 5px; padding: 3px 4px; color: #fff; background: #222529; border-radius: 4px; font-size: 6px; font-weight: 760; letter-spacing: .08em; }
        .pdf-result-copy { min-width: 0; }
        .pdf-result-status { display: inline-flex; align-items: center; gap: 5px; color: #4e745e; font-size: 7px; font-weight: 720; letter-spacing: .08em; text-transform: uppercase; }
        .pdf-result-status i { width: 5px; height: 5px; background: #4e8063; border-radius: 50%; }
        .pdf-result-copy strong { display: block; margin-top: 6px; overflow: hidden; color: #202326; font-size: 12px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
        .pdf-result-copy small { display: block; margin-top: 5px; color: #8a9095; font-size: 7.5px; }
        .pdf-result-actions { display: flex; align-items: center; gap: 6px; }
        .pdf-result-actions a, .pdf-result-actions button { min-width: 34px; min-height: 34px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: #44494d; background: #fff; border: 1px solid #e0e2e3; border-radius: 9px; text-decoration: none; }
        .pdf-result-actions .primary { color: #fff; background: #202326; border-color: #202326; font-size: 8px; font-weight: 650; }
        .pdf-result-actions a:hover, .pdf-result-actions button:hover { background: #f6f6f5; }
        .pdf-result-actions .primary:hover { background: #34383b; }
        @media (max-width: 640px) { .pdf-result-card { grid-template-columns: 46px minmax(0, 1fr); }.pdf-result-preview { width: 46px; height: 58px; }.pdf-result-actions { grid-column: 1 / -1; justify-content: flex-end; }.pdf-result-actions .primary { margin-right: auto; } }
      `}</style>
    </article>
  );
}

function AgentActionReceipts({ actions, onAction }: {
  actions: OpsAgentActionResult[];
  onAction: (prompt: string) => void;
}) {
  if (!actions.length) return null;
  const labels: Record<OpsAgentActionResult["type"], string> = {
    create_opportunity: "Opportunité",
    create_task: "Tâche",
    create_client: "Client",
    prepare_email: "Brouillon email",
    send_demo_email: "Email sortant",
  };
  return (
    <div className="agent-action-receipts">
      {actions.map((action, index) => {
        const executed = action.status === "executed";
        const waiting = action.status === "validation_required" || action.status === "proposed";
        const status = executed
          ? "Enregistré dans la mémoire"
          : action.status === "failed"
            ? "Écriture impossible"
            : "Validation requise";
        return (
          <article key={`${action.type}-${action.record?.id ?? index}`}>
            <span className={executed ? "success" : action.status === "failed" ? "failure" : "waiting"}><i /> {status}</span>
            <strong>{action.record?.title ?? labels[action.type]}</strong>
            <small>{action.record?.id ?? action.reason}</small>
            {waiting ? <button type="button" onClick={() => onAction("Oui, vas-y. Exécute l’action proposée précédemment.")}>Valider l’action <OpsIcon name="arrow" size={12} /></button> : null}
          </article>
        );
      })}
      <style jsx>{`
        .agent-action-receipts { width: min(660px, 100%); margin-top: 18px; display: grid; gap: 8px; }
        .agent-action-receipts article { position: relative; min-width: 0; padding: 13px 15px; background: #fff; border: 1px solid #e5e6e7; border-radius: 14px; box-shadow: 0 10px 28px rgba(18,22,28,.035); }
        .agent-action-receipts span { display: flex; align-items: center; gap: 6px; color: #6d7378; font-size: 7px; font-weight: 720; letter-spacing: .08em; text-transform: uppercase; }
        .agent-action-receipts span i { width: 5px; height: 5px; background: #a2a8ad; border-radius: 50%; }
        .agent-action-receipts span.success { color: #4e745e; }.agent-action-receipts span.success i { background: #4e8063; }
        .agent-action-receipts span.failure { color: #a35f58; }.agent-action-receipts span.failure i { background: #b66d65; }
        .agent-action-receipts span.waiting { color: #8c6c3d; }.agent-action-receipts span.waiting i { background: #bf8a3d; }
        .agent-action-receipts strong { display: block; margin-top: 6px; overflow-wrap: anywhere; color: #25282b; font-size: 10px; }
        .agent-action-receipts small { display: block; margin-top: 4px; overflow-wrap: anywhere; color: #8a9095; font-size: 8px; line-height: 1.45; }
        .agent-action-receipts button { margin-top: 10px; padding: 7px 10px; display: inline-flex; align-items: center; gap: 7px; color: #fff; background: #202326; border: 0; border-radius: 9px; font-size: 8px; font-weight: 650; }
      `}</style>
    </div>
  );
}

function OpsInlineContent({ segments }: { segments: OpsInlineSegment[] }) {
  return segments.map((segment, index) => {
    const key = `${segment.kind}-${index}-${segment.text.slice(0, 20)}`;
    if (segment.kind === "strong") return <strong key={key}>{segment.text}</strong>;
    if (segment.kind === "emphasis") return <em key={key}>{segment.text}</em>;
    if (segment.kind === "code") return <code key={key}>{segment.text}</code>;
    if (segment.kind === "citation") return <span className="answer-citation" key={key}>[{segment.text}]</span>;
    return <span key={key}>{segment.text}</span>;
  });
}

function OpsMarkdownResponse({ value }: { value: string }) {
  const blocks = parseOpsResponseMarkdown(value);
  return (
    <div className="answer-body">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          const content = <OpsInlineContent segments={block.content} />;
          if (block.level === 2) return <h2 key={key}>{content}</h2>;
          if (block.level === 3) return <h3 key={key}>{content}</h3>;
          return <h4 key={key}>{content}</h4>;
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}><OpsInlineContent segments={item} /></li>)}</List>;
        }
        if (block.kind === "table") {
          return (
            <div className="answer-table-wrap" key={key}>
              <table>
                <thead><tr>{block.headers.map((header, cellIndex) => <th key={`${key}-h-${cellIndex}`}><OpsInlineContent segments={header} /></th>)}</tr></thead>
                <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}><OpsInlineContent segments={cell} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={key}><OpsInlineContent segments={block.content} /></p>;
      })}
    </div>
  );
}

function ScenarioResponse({ scenario, text, document, actions = [], openDocuments, onSpeak, onAction }: {
  scenario: AgentScenario;
  text?: string;
  document?: OpsDocument;
  actions?: OpsAgentActionResult[];
  openDocuments: (documentId?: string) => void;
  onSpeak: (text: string) => void;
  onAction: (prompt: string) => void;
}) {
  const [useful, setUseful] = useState(false);
  const body = text ? text.split(/\n{2,}/).filter(Boolean) : scenario.body;
  const bodyMarkdown = text?.trim() || body.join("\n\n");
  const answerText = [scenario.lead, ...body].filter(Boolean).join("\n\n");
  return (
    <div className="assistant-answer">
      <div className="assistant-mark"><OpsIcon name="spark" size={18} /></div>
      <div className="assistant-content">
        {scenario.lead ? <strong className="answer-lead">{scenario.lead}</strong> : null}
        {bodyMarkdown ? <OpsMarkdownResponse value={bodyMarkdown} /> : null}
        {scenario.sources.length ? <SourceChips sources={scenario.sources} /> : null}
        {scenario.artifact && (
          <article className="agent-artifact">
            <span>{scenario.artifact.kicker}</span><h3>{scenario.artifact.title}</h3>
            <div>{scenario.artifact.metrics.map((metric) => <p key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></p>)}</div>
            <footer><small><OpsIcon name="shield" size={13} /> Aucune action externe sans validation</small><button onClick={() => onAction(scenario.artifact?.action ?? "Prépare la prochaine action.")}>{scenario.artifact.action}</button></footer>
          </article>
        )}
        <AgentActionReceipts actions={actions} onAction={onAction} />
        {document ? <PdfArtifactCard document={document} openDocuments={openDocuments} /> : null}
        <div className="response-actions">
          <button type="button" onClick={() => navigator.clipboard?.writeText(answerText)}><OpsIcon name="copy" size={14} /> Copier</button>
          <button type="button" onClick={() => setUseful((current) => !current)}><OpsIcon name="thumb" size={14} /> {useful ? "Noté" : "Utile"}</button>
          <button type="button" onClick={() => onAction("Corrige ta réponse précédente : vérifie chaque fait dans la mémoire, explicite ce qui était imprécis et redonne une réponse sourcée.")}><OpsIcon name="edit" size={14} /> Corriger</button>
          <button type="button" onClick={() => onSpeak(plainTextFromOpsMarkdown(answerText))}><OpsIcon name="volume" size={14} /> Écouter</button>
        </div>
      </div>
    </div>
  );
}

function AgentPage({ initialPrompt, consumePrompt, onDocumentGenerated, openDocuments }: {
  initialPrompt: string;
  consumePrompt: () => void;
  onDocumentGenerated: (document: OpsDocument) => void;
  openDocuments: (documentId?: string) => void;
}) {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const voiceModeRef = useRef<VoiceModeHandle>(null);
  const inlineSpeechPlaybackRef = useRef<StreamingAudioPlayback | null>(null);
  const inlineSpeechRequestRef = useRef<AbortController | null>(null);
  const inlineSpeechGenerationRef = useRef(0);
  const agentRequestRef = useRef<AbortController | null>(null);
  const resetOpenCodeSessionRef = useRef(true);
  const conversationIdRef = useRef(createConversationId());

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const speak = useCallback((text: string) => {
    if (voiceOpen && voiceModeRef.current) {
      voiceModeRef.current.speak(text);
      return;
    }

    inlineSpeechGenerationRef.current += 1;
    const generation = inlineSpeechGenerationRef.current;
    inlineSpeechRequestRef.current?.abort();
    inlineSpeechRequestRef.current = null;
    inlineSpeechPlaybackRef.current?.stop();
    inlineSpeechPlaybackRef.current = null;
    window.speechSynthesis.cancel();

    const cleaned = text.replace(/\b[A-Z]{2,}-[A-Z0-9-]+\b/g, "").trim();
    if (!cleaned) return;

    const playBrowserFallback = () => {
      if (generation !== inlineSpeechGenerationRef.current) return;
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = "fr-FR";
      utterance.rate = 0.98;
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.lang.toLocaleLowerCase().startsWith("fr"));
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    };

    const controller = new AbortController();
    inlineSpeechRequestRef.current = controller;
    void (async () => {
      try {
        const response = await fetch("/api/audio/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleaned }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`speech_${response.status}`);
        const playback = await playStreamingAudioResponse(response, {
          signal: controller.signal,
          onEnded: (endedPlayback) => {
            if (inlineSpeechPlaybackRef.current === endedPlayback) {
              inlineSpeechPlaybackRef.current = null;
            }
            if (inlineSpeechRequestRef.current === controller) {
              inlineSpeechRequestRef.current = null;
            }
          },
          onError: (_error, failedPlayback) => {
            if (inlineSpeechPlaybackRef.current === failedPlayback) {
              inlineSpeechPlaybackRef.current = null;
            }
            if (inlineSpeechRequestRef.current === controller) {
              inlineSpeechRequestRef.current = null;
            }
            if (!controller.signal.aborted) playBrowserFallback();
          },
        });
        if (
          controller.signal.aborted ||
          generation !== inlineSpeechGenerationRef.current
        ) {
          playback.stop();
          return;
        }
        inlineSpeechPlaybackRef.current = playback;
      } catch {
        if (inlineSpeechRequestRef.current === controller) {
          inlineSpeechRequestRef.current = null;
        }
        if (!controller.signal.aborted) playBrowserFallback();
      }
    })();
  }, [voiceOpen]);

  useEffect(() => () => {
    agentRequestRef.current?.abort();
    inlineSpeechGenerationRef.current += 1;
    inlineSpeechRequestRef.current?.abort();
    inlineSpeechPlaybackRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  const stopAgent = useCallback(() => {
    agentRequestRef.current?.abort();
    agentRequestRef.current = null;
    setProcessing(false);
  }, []);

  const startNewConversation = useCallback(() => {
    stopAgent();
    setMessages([]);
    conversationIdRef.current = createConversationId();
    resetOpenCodeSessionRef.current = true;
  }, [stopAgent]);

  const submit = useCallback(async (override?: string, fromVoice = false) => {
    const prompt = (override ?? value).trim();
    if (!prompt || processing) return;
    setValue("");
    setProcessing(true);
    const userId = Date.now();
    const priorHistory = buildConversationHistory(messagesRef.current);
    const pendingScenario = emptyAgentScenario(prompt);
    const requestController = new AbortController();
    agentRequestRef.current?.abort();
    agentRequestRef.current = requestController;

    setMessages((current) => [...current, { id: userId, role: "user", prompt }, {
      id: userId + 1,
      role: "assistant",
      scenario: pendingScenario,
      loading: true,
      statusText: "Analyse de la mémoire de l’entreprise",
      progressKind: "analysis",
      progressStartedAt: Date.now(),
    }]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history: priorHistory,
          resetSession: resetOpenCodeSessionRef.current,
          conversationId: conversationIdRef.current,
        }),
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error(`agent_${response.status}`);
      if (!response.body) throw new Error("agent_unavailable");
      if (response.headers.get("X-OPS-Agent") === "opencode") {
        resetOpenCodeSessionRef.current = false;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let speechText = "";
      let serverScenario = pendingScenario;
      let documentPlan: OpsDocumentPlan | undefined;
      let actionResults: OpsAgentActionResult[] = [];
      let lineBuffer = "";
      const structured = response.headers.get("content-type")?.includes("application/x-ndjson") ?? false;

      const applyEvent = (event: AgentStreamEvent) => {
        if (event.type === "progress") {
          const progressKind = /\bpdf\b|g[eé]n[eè]r(?:e|ation).*(?:rapport|document)/i.test(`${event.stage} ${event.label}`) ? "pdf" : "analysis";
          const progressUpdatedAt = Date.now();
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? {
                ...message,
                progressKind,
                progressStartedAt: message.progressStartedAt ?? progressUpdatedAt,
                progressStage: event.stage,
                progressLabel: event.label,
                progressDetail: event.detail,
                progressEtaMs: event.etaMs,
                progressUpdatedAt,
              }
            : message));
        } else if (event.type === "meta") {
          serverScenario = event.scenario;
          documentPlan = event.document;
          actionResults = event.actions ?? [];
          for (const action of actionResults) {
            if (action.status !== "executed" || !action.record) continue;
            document.dispatchEvent(new CustomEvent("ops-record-created", {
              detail: { kind: action.type, id: action.record.id },
            }));
          }
          if (event.memoryCommit?.id) {
            document.dispatchEvent(new CustomEvent("ops-record-created", {
              detail: { kind: "analysis", id: event.memoryCommit.id },
            }));
          }
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? { ...message, scenario: serverScenario, actions: actionResults, loading: !text.trim(), text }
            : message));
        } else if (event.type === "delta") {
          text += event.delta;
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? { ...message, scenario: serverScenario, loading: false, text }
            : message));
        } else if (event.type === "replace") {
          text = event.text;
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? { ...message, scenario: serverScenario, loading: false, text }
            : message));
        } else if (event.type === "speech") {
          speechText = event.text.trim();
        } else if (event.type === "error") {
          text = event.retryable
            ? event.message
            : `${text}${text ? "\n\n" : ""}${event.message}`;
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? { ...message, scenario: serverScenario, loading: false, text }
            : message));
        } else if (event.type === "done") {
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? {
                ...message,
                scenario: serverScenario,
                loading: false,
                text,
                progressKind: undefined,
                progressStartedAt: undefined,
                progressStage: undefined,
                progressLabel: undefined,
                progressDetail: undefined,
                progressEtaMs: undefined,
                progressUpdatedAt: undefined,
              }
            : message));
        }
      };

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(chunk, { stream: true });
        if (!structured) {
          text += decoded;
          setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, loading: false, text } : message));
          continue;
        }
        lineBuffer += decoded;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { applyEvent(JSON.parse(line) as AgentStreamEvent); } catch { /* Ignore uniquement une ligne de transport corrompue. */ }
        }
      }
      lineBuffer += decoder.decode();
      if (structured && lineBuffer.trim()) {
        try { applyEvent(JSON.parse(lineBuffer) as AgentStreamEvent); } catch { /* La réponse déjà reçue reste affichée. */ }
      }
      setMessages((current) => current.map((message) => message.id === userId + 1 ? {
        ...message,
        scenario: serverScenario,
        actions: actionResults,
        loading: false,
        text,
        progressKind: undefined,
        progressStartedAt: undefined,
        progressStage: undefined,
        progressLabel: undefined,
        progressDetail: undefined,
        progressEtaMs: undefined,
        progressUpdatedAt: undefined,
      } : message));

      if (documentPlan) {
        const progressStartedAt = Date.now();
        setMessages((current) => current.map((message) => message.id === userId + 1 ? {
          ...message,
          loading: true,
          progressKind: "pdf",
          progressStartedAt,
          progressStage: "document",
          progressLabel: "Création du document",
          progressDetail: "Mise en page, génération et archivage dans Documents",
          progressEtaMs: 2_500,
          progressUpdatedAt: progressStartedAt,
        } : message));
        try {
          const document = await generatePdfDocument(documentPlan, requestController.signal);
          if (requestController.signal.aborted) {
            throw new DOMException("La génération du document a été interrompue.", "AbortError");
          }
          onDocumentGenerated(document);
          setMessages((current) => current.map((message) => message.id === userId + 1 ? {
            ...message,
            scenario: serverScenario,
            text,
            document,
            actions: actionResults,
            loading: false,
            progressKind: undefined,
            progressStartedAt: undefined,
            progressStage: undefined,
            progressLabel: undefined,
            progressDetail: undefined,
            progressEtaMs: undefined,
            progressUpdatedAt: undefined,
          } : message));
        } catch (error) {
          if (requestController.signal.aborted) throw error;
          const documentFailure = "La réponse est conservée, mais le PDF n’a pas pu être généré ou archivé. Vous pouvez relancer uniquement la création du document.";
          text = `${text}${text ? "\n\n" : ""}${documentFailure}`;
          serverScenario = {
            ...serverScenario,
            followups: ["Réessayer la création du PDF", ...serverScenario.followups].slice(0, 4),
          };
          setMessages((current) => current.map((message) => message.id === userId + 1 ? {
            ...message,
            scenario: serverScenario,
            text,
            loading: false,
            progressKind: undefined,
            progressStartedAt: undefined,
            progressStage: undefined,
            progressLabel: undefined,
            progressDetail: undefined,
            progressEtaMs: undefined,
            progressUpdatedAt: undefined,
          } : message));
        }
      }

      if (fromVoice && text.trim()) {
        speak(speechText || [serverScenario.lead, text].filter(Boolean).join("\n\n"));
      }
    } catch {
      if (requestController.signal.aborted) {
        const interruptedScenario = createReply(
          "agent-interrupted",
          "Réponse interrompue.",
          ["La demande a été arrêtée avant la fin. Aucune action externe n’a été exécutée."],
          [],
          ["Reprendre la demande"],
        );
        setMessages((current) => current.map((message) => message.id === userId + 1 ? {
          ...message,
          scenario: interruptedScenario,
          text: "",
          loading: false,
          progressKind: undefined,
          progressStartedAt: undefined,
          progressStage: undefined,
          progressLabel: undefined,
          progressDetail: undefined,
          progressEtaMs: undefined,
          progressUpdatedAt: undefined,
        } : message));
        return;
      }
      const technicalScenario = createReply(
        "agent-unavailable",
        "OPS n’a pas pu terminer cette demande.",
        ["Le moteur privé ou la mémoire est momentanément indisponible. Aucun résultat métier de remplacement n’a été inventé."],
        [],
        ["Réessayer la demande"],
      );
      setMessages((current) => current.map((message) => message.id === userId + 1 ? {
        ...message,
        scenario: technicalScenario,
        text: "",
        loading: false,
        progressKind: undefined,
        progressStartedAt: undefined,
        progressStage: undefined,
        progressLabel: undefined,
        progressDetail: undefined,
        progressEtaMs: undefined,
        progressUpdatedAt: undefined,
      } : message));
      if (fromVoice) speak(`${technicalScenario.lead} ${technicalScenario.body.join(" ")}`);
    } finally {
      if (agentRequestRef.current === requestController) {
        agentRequestRef.current = null;
        setProcessing(false);
      }
    }
  }, [onDocumentGenerated, processing, speak, value]);

  useEffect(() => {
    if (!initialPrompt) return;
    submit(initialPrompt);
    consumePrompt();
  }, [consumePrompt, initialPrompt, submit]);

  useEffect(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const container = scrollRef.current;
    if (!lastUser || !container) return;
    const node = container.querySelector<HTMLElement>(`[data-message-id="${lastUser.id}"]`);
    if (!node) return;
    container.scrollTo({ top: Math.max(0, node.offsetTop - 22), behavior: "smooth" });
  }, [messages.length]);

  if (!messages.length) {
    return (
      <>
        <div className="agent-empty-page">
          <div className="agent-empty-center">
            <h1>Bonjour Marie. On commence&nbsp;?</h1>
            <FullComposer value={value} setValue={setValue} onSubmit={() => submit()} onStop={stopAgent} onVoice={() => setVoiceOpen(true)} onAttach={() => openDocuments()} processing={processing} centered />
            <div className="agent-starters">
              {agentScenarios.slice(0, 4).map((scenario, index) => (
                <button key={scenario.id} onClick={() => submit(scenario.label)}><OpsIcon name={(["invoice", "trend", "target", "brain"] as IconName[])[index]} size={20} /><span>{scenario.label}</span></button>
              ))}
            </div>
          </div>
          <p className="agent-disclaimer">OPS peut faire des erreurs. Les réponses importantes restent reliées à leurs sources.</p>
        </div>
        <VoiceMode
          ref={voiceModeRef}
          open={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onSubmit={submit}
          openDocuments={openDocuments}
          busy={processing}
        />
      </>
    );
  }

  return (
    <>
      <div className="agent-thread-page">
        <div className="thread-toolbar"><button onClick={startNewConversation}><OpsIcon name="plus" size={17} /> Nouvelle conversation</button><span>Conversation privée · mémoire de l’entreprise</span><button onClick={() => document.dispatchEvent(new CustomEvent("ops-command"))} aria-label="Actions de la conversation"><OpsIcon name="dots" size={18} /></button></div>
        <div className="thread-scroll" ref={scrollRef}>
          <div className="thread-content">
            {messages.map((message) => message.role === "user" ? (
              <div className="user-message" data-message-id={message.id} key={message.id}>{message.prompt}</div>
            ) : (
              <div key={message.id}>
                {message.progressKind && message.progressStartedAt ? (
                  <AgentProgress
                    kind={message.progressKind}
                    startedAt={message.progressStartedAt}
                    stage={message.progressStage}
                    label={message.progressLabel}
                    detail={message.progressDetail}
                    etaMs={message.progressEtaMs}
                    updatedAt={message.progressUpdatedAt}
                  />
                ) : message.loading ? (
                  <div className="agent-thinking"><span className="assistant-mark"><OpsIcon name="spark" size={18} /></span><div><i /><span>{message.statusText ?? "Recherche dans 7 sources"}</span></div></div>
                ) : null}
                {!message.loading && message.scenario ? <ScenarioResponse scenario={message.scenario} text={message.text} document={message.document} actions={message.actions} openDocuments={openDocuments} onSpeak={speak} onAction={(prompt) => submit(prompt)} /> : null}
                {!message.loading && !message.progressKind && message.scenario && (
                  <div className="followups">{message.scenario.followups.map((followup) => <button key={followup} onClick={() => submit(followup)}>{followup}<OpsIcon name="arrow" size={13} /></button>)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="thread-composer-wrap"><FullComposer value={value} setValue={setValue} onSubmit={() => submit()} onStop={stopAgent} onVoice={() => setVoiceOpen(true)} onAttach={() => openDocuments()} processing={processing} /><p>OPS cite ses sources et demande votre validation avant toute action externe.</p></div>
      </div>
      <VoiceMode
        ref={voiceModeRef}
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSubmit={submit}
        openDocuments={openDocuments}
        busy={processing}
      />
    </>
  );
}

function CyclePage({ openAgent, openNewOpportunity }: {
  openAgent: OpenAgent;
  openNewOpportunity: () => void;
}) {
  const [pipelineItems] = usePersistedOpportunities();
  return (
    <div className="content-page">
      <PageHeading page="cycle" action={<button className="primary-button" onClick={() => openAgent("Quels dossiers risquent de se bloquer cette semaine ?")}><OpsIcon name="spark" size={16} /> Analyser le cycle</button>} />
      <section className="cycle-ribbon">
        {cycleStages.map((stage, index) => <button key={stage.label} onClick={() => openAgent(`Analyse les ${stage.count} dossiers de l'étape ${stage.label}, explique les risques et les prochaines actions.`)}><span>0{index + 1}</span><strong>{stage.label}</strong><em>{stage.count} dossiers</em><b>{stage.value}</b><i style={{ width: `${stage.progress}%` }} /></button>)}
      </section>
      <section className="panel data-panel">
        <div className="panel-title"><div><span>Dossiers en mouvement</span><small>14 changements depuis hier</small></div><div className="table-actions"><button onClick={() => openAgent("Filtre les dossiers du cycle par niveau de risque et échéance.")}><OpsIcon name="filter" size={15} /> Filtrer</button><button onClick={openNewOpportunity}><OpsIcon name="plus" size={15} /> Nouveau</button></div></div>
        <div className="entity-table cycle-table">
          <div className="table-head"><span>Dossier</span><span>Étape</span><span>Responsable</span><span>Montant</span><span>Prochaine action</span><span>Risque</span></div>
          {pipelineItems.map((opportunity) => <button className="table-row" key={opportunity.id} onClick={() => openAgent(`Résume le dossier ${opportunity.name}`)}><span><strong>{opportunity.name}</strong><small>{opportunity.id} · {opportunity.source}</small></span><span><i className="stage-dot" />{opportunity.stage}</span><span>{opportunity.owner}</span><span><strong>{(opportunity.amount / 1000).toLocaleString("fr-FR")} K€</strong></span><span>{opportunity.next}</span><span className={opportunity.probability > 70 ? "risk-low" : "risk-mid"}>{opportunity.probability > 70 ? "Faible" : "À suivre"}</span></button>)}
        </div>
      </section>
    </div>
  );
}

type EmailThreadView = (typeof emailThreads)[number] & {
  folder: "to_process" | "priority" | "waiting" | "sent";
  classification: "positive" | "question" | "later" | "opposition" | "priority" | "neutral";
  body?: string;
  recipient?: string;
};

function baseEmailThreads(): EmailThreadView[] {
  return emailThreads.map((thread) => ({
    ...thread,
    folder: thread.tag === "Prioritaire"
      ? "priority"
      : thread.tag === "Plus tard"
        ? "waiting"
        : "to_process",
    classification: thread.tag === "Question"
      ? "question"
      : thread.tag === "Plus tard"
        ? "later"
        : thread.tag === "Prioritaire"
          ? "priority"
          : "positive",
  }));
}

function isInternalEmailRecord(record: PersistedRecord) {
  const attributes = record.attributes;
  const company = typeof attributes.company === "string" ? attributes.company : "";
  const searchable = `${record.title} ${company}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
  return /\b(?:test|audit|demo|demonstration)\b/.test(searchable)
    || searchable.trim() === "heelo";
}

function emailPreview(record: PersistedRecord, sent: boolean) {
  if (!sent) return record.summary;
  const recipient = typeof record.attributes.recipient === "string"
    ? record.attributes.recipient
    : "son destinataire";
  return `Email remis à la boîte d’envoi contrôlée pour ${recipient}.`;
}

function EmailsPage({ openAgent }: { openAgent: OpenAgent }) {
  const [threads, setThreads] = useState<EmailThreadView[]>(baseEmailThreads);
  const [selectedId, setSelectedId] = useState(emailThreads[0].id);
  const [folder, setFolder] = useState<"to_process" | "priority" | "waiting" | "sent" | "all">("to_process");
  const [classification, setClassification] = useState<EmailThreadView["classification"] | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: "", company: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/records?kind=email", { cache: "no-store", signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<{ records?: PersistedRecord[] }> : { records: [] })
        .then(({ records = [] }) => {
          if (controller.signal.aborted) return;
          const created = records.filter((record) => !isInternalEmailRecord(record)).map((record): EmailThreadView => {
            const attributes = record.attributes;
            const sent = attributes.mailbox === "sent" || attributes.direction === "outbound";
            const classificationValue = typeof attributes.classification === "string"
              ? attributes.classification as EmailThreadView["classification"]
              : "neutral";
            const sender = typeof attributes.sender === "string" && attributes.sender
              ? attributes.sender.replace(/\s*<[^>]+>\s*$/, "")
              : sent
                ? "Marie Delmas"
                : record.title.split(" — ")[0] || "Contact";
            const relationCompany = record.relations
              .find((relation) => /^(?:CLI|CLIENT)-/i.test(relation))
              ?.split(" — ")
              .slice(1)
              .join(" — ");
            const companyName = typeof attributes.company === "string" && attributes.company
              ? attributes.company
              : relationCompany || (sent ? "Message sortant" : "Entreprise");
            const receivedAt = [attributes.received_at, attributes.sent_at, record.createdAt]
              .find((value): value is string => typeof value === "string" && Boolean(value));
            const timestamp = receivedAt && !Number.isNaN(new Date(receivedAt).getTime())
              ? new Intl.DateTimeFormat("fr-FR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(receivedAt)).replace(",", " ·")
              : "À l’instant";
            const folderValue: EmailThreadView["folder"] = sent
              ? "sent"
              : attributes.mailbox === "waiting" || classificationValue === "later"
                ? "waiting"
                : classificationValue === "priority"
                  ? "priority"
                  : "to_process";
            const tag = sent
              ? "En boîte d’envoi"
              : classificationValue === "priority"
                ? "Prioritaire"
                : classificationValue === "question"
                  ? "Question"
                  : classificationValue === "later"
                    ? "Plus tard"
                    : classificationValue === "positive"
                      ? "Positif"
                      : "À suivre";
            const replyAddress = typeof attributes.sender_email === "string" && attributes.sender_email
              ? attributes.sender_email
              : typeof attributes.recipient === "string"
                ? attributes.recipient
                : "";
            return {
              id: record.id,
              sender,
              company: companyName,
              subject: record.title,
              preview: emailPreview(record, sent),
              time: timestamp,
              tag,
              unread: !sent && attributes.status === "to_process",
              linked: record.relations.find((relation) => /^(?:CLI|OPP|FACT|PROJET)-/.test(relation)) ?? "ORG-001",
              folder: folderValue,
              classification: classificationValue,
              body: record.content || record.summary,
              recipient: replyAddress,
            };
          });
          setThreads((current) => [
            ...created,
            ...current.filter((thread) => !created.some((record) => record.id === thread.id)),
          ]);
        })
        .catch(() => {
          // La boîte contrôlée locale reste utilisable.
        });
    };
    const refresh = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "email") load();
    };
    load();
    document.addEventListener("ops-record-created", refresh);
    return () => {
      controller.abort();
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  const filteredThreads = threads.filter((thread) => {
    const folderMatches = folder === "all" || thread.folder === folder;
    const classificationMatches = !classification || thread.classification === classification;
    return folderMatches && classificationMatches;
  });
  const selected = filteredThreads.find((thread) => thread.id === selectedId)
    ?? filteredThreads[0];
  const reply = selected
    ? `Bonjour ${selected.sender.split(" ")[0]}, merci pour votre retour. Je note le traitement cette semaine et reste disponible si votre équipe a besoin d’un document complémentaire.`
    : "";

  useEffect(() => {
    if (filteredThreads.length && !filteredThreads.some((thread) => thread.id === selectedId)) {
      setSelectedId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedId]);

  const sendEmail = useCallback(async (payload: {
    to: string;
    company?: string;
    subject: string;
    body: string;
    threadId?: string;
    linked?: string[];
  }) => {
    setSending(true);
    setSendStatus("");
    try {
      const created = await createOpsRecord({
        kind: "email",
        ...payload,
        mailbox: "sent",
        classification: "neutral",
        status: "sent_demo",
        validated: true,
      });
      const outgoing: EmailThreadView = {
        id: created.id,
        sender: "Marie Delmas",
        company: payload.company || "Message sortant",
        subject: payload.subject,
        preview: payload.body.replace(/\s+/g, " ").slice(0, 92),
        time: "À l’instant",
        tag: "En boîte d’envoi",
        unread: false,
        linked: payload.linked?.[0] ?? payload.threadId ?? "ORG-001",
        folder: "sent",
        classification: "neutral",
        body: payload.body,
        recipient: payload.to,
      };
      setThreads((current) => [outgoing, ...current]);
      setSelectedId(outgoing.id);
      setFolder("sent");
      setClassification(null);
      setSendStatus("Remis à la boîte d’envoi contrôlée et ajouté à la mémoire centrale.");
      return true;
    } catch {
      setSendStatus("Le message n’a pas pu être remis à la boîte d’envoi.");
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  const folders = [
    { id: "to_process" as const, label: "À traiter", icon: "mail" as IconName },
    { id: "priority" as const, label: "Prioritaires", icon: "target" as IconName },
    { id: "waiting" as const, label: "En attente", icon: "clock" as IconName },
    { id: "sent" as const, label: "Boîte d’envoi", icon: "send" as IconName },
    { id: "all" as const, label: "Tous les emails", icon: "document" as IconName },
  ];
  const classifications: Array<{ id: EmailThreadView["classification"]; label: string }> = [
    { id: "positive", label: "Positif" },
    { id: "question", label: "Question" },
    { id: "later", label: "Plus tard" },
    { id: "opposition", label: "Opposition" },
  ];
  const selectThread = (threadId: string) => {
    setSelectedId(threadId);
    setMobileReaderOpen(true);
    setThreads((current) => current.map((thread) => (
      thread.id === threadId && thread.unread
        ? { ...thread, unread: false }
        : thread
    )));
  };

  return (
    <>
      <div className="content-page wide-page">
        <PageHeading page="emails" action={<button className="primary-button" onClick={() => openAgent("Quels emails demandent une réponse aujourd’hui ?")}><OpsIcon name="spark" size={16} /> Prioriser avec OPS</button>} />
        <section className={`mail-shell ${mobileReaderOpen ? "mobile-reader-open" : ""}`}>
          <aside className="mail-folders">
            <button className="compose-mail" onClick={() => { setSendStatus(""); setComposeOpen(true); }}><OpsIcon name="plus" size={16} /> Nouveau message</button>
            <span>Boîtes</span>
            {folders.map((item) => {
              const count = item.id === "all" ? threads.length : threads.filter((thread) => thread.folder === item.id).length;
              return (
                <button
                  className={folder === item.id && !classification ? "active" : ""}
                  key={item.id}
                  onClick={() => { setFolder(item.id); setClassification(null); }}
                >
                  <OpsIcon name={item.icon} size={16} />{item.label}{count ? ` · ${count}` : ""}
                </button>
              );
            })}
            <span>Classification OPS</span>
            {classifications.map((item) => {
              const count = threads.filter((thread) => thread.classification === item.id).length;
              return (
                <button
                  className={classification === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => { setClassification(item.id); setFolder("all"); }}
                >
                  <i />{item.label} · {count}
                </button>
              );
            })}
          </aside>
          <div className="mail-list">
            <div className="mail-list-head">
              <div>
                <strong>{classification ? classifications.find((item) => item.id === classification)?.label : folders.find((item) => item.id === folder)?.label}</strong>
                <select
                  aria-label="Choisir une boîte email"
                  className="mail-mobile-folder"
                  value={classification ? `classification:${classification}` : folder}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("classification:")) {
                      setClassification(value.replace("classification:", "") as EmailThreadView["classification"]);
                      setFolder("all");
                    } else {
                      setFolder(value as typeof folder);
                      setClassification(null);
                    }
                  }}
                >
                  <optgroup label="Boîtes">{folders.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
                  <optgroup label="Classification OPS">{classifications.map((item) => <option key={item.id} value={`classification:${item.id}`}>{item.label}</option>)}</optgroup>
                </select>
              </div>
              <div>
                <button className="mail-mobile-compose" aria-label="Nouveau message" onClick={() => { setSendStatus(""); setComposeOpen(true); }}><OpsIcon name="plus" size={15} /></button>
                <button aria-label="Analyser et filtrer cette boîte" onClick={() => openAgent(`Analyse et filtre les emails de la vue ${folder}`)}><OpsIcon name="filter" size={15} /></button>
              </div>
            </div>
            {filteredThreads.map((thread) => (
              <button key={thread.id} onClick={() => selectThread(thread.id)} className={`mail-thread ${selected?.id === thread.id ? "active" : ""}`}>
                <span className="contact-avatar">{thread.sender.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                <span><strong>{thread.sender}</strong><small>{thread.company}</small><b>{thread.subject}</b><p>{thread.preview}</p><em>{thread.tag}</em></span>
                <time>{thread.time}</time>{thread.unread && <i className="unread-dot" />}
              </button>
            ))}
            {!filteredThreads.length ? <div className="mail-empty">Aucun message dans cette vue.</div> : null}
          </div>
          {selected ? <article className="mail-reader">
            <header>
              <button className="mail-mobile-back" aria-label="Revenir à la liste des emails" onClick={() => setMobileReaderOpen(false)} type="button"><span aria-hidden="true">←</span></button>
              <div><span>{selected.tag}</span><h2>{selected.subject}</h2><p>{selected.sender} · {selected.company}</p></div>
              <div>
                <button aria-label={`Analyser les relations de ${selected.subject}`} onClick={() => openAgent(`Résume toutes les relations de ${selected.id}`)}><OpsIcon name="dots" size={17} /></button>
                <button aria-label={`Préparer une réponse à ${selected.sender}`} onClick={() => openAgent(`Prépare une réponse à ${selected.id} pour ${selected.sender}`)}><OpsIcon name="arrow" size={17} /></button>
              </div>
            </header>
            <div className="mail-ai-summary"><span><OpsIcon name="spark" size={15} /> Résumé OPS</span><p>{selected.preview} Le message est relié au dossier {selected.linked} et sa prochaine action peut être préparée sans perdre l’historique.</p><SourceChips sources={[selected.linked, selected.id]} /></div>
            <div className="mail-body">
              {selected.body ? <p className="mail-preserved-body">{selected.body}</p> : <><p>Bonjour Marie,</p><p>{selected.preview}</p><p>Je reviens vers vous dès que le point est confirmé.</p><p>Bien à vous,<br />{selected.sender}</p></>}
            </div>
            {selected.folder !== "sent" ? (
              <div className="draft-box">
                <span><OpsIcon name="spark" size={14} /> Brouillon préparé</span><p>{reply}</p>
                <footer>
                  <small>{sendStatus || "Ton : cordial · validation requise"}</small>
                  <button onClick={() => openAgent(`Améliore ce brouillon de réponse pour ${selected.id} : ${reply}`)}>Modifier avec OPS</button>
                  <button
                    className="dark"
                    disabled={sending}
                    onClick={() => void sendEmail({
                      to: selected.recipient || `${selected.sender.split(" ")[0].toLocaleLowerCase("fr")}@client.example`,
                      company: selected.company,
                      subject: /^re\s*:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`,
                      body: reply,
                      threadId: selected.id,
                      linked: [selected.id, selected.linked],
                    })}
                  >
                    {sending ? "Placement…" : "Placer en boîte d’envoi"}
                  </button>
                </footer>
              </div>
            ) : <div className="mail-sent-state"><OpsIcon name="check" size={15} /> Message remis à la boîte d’envoi et archivé dans la mémoire.</div>}
          </article> : <article className="mail-reader mail-reader-empty"><div><OpsIcon name="mail" size={24} /><strong>Aucun message dans cette vue</strong><p>Choisissez une autre boîte ou une autre classification.</p></div></article>}
        </section>
      </div>
      <OpsModal
        open={composeOpen}
        title="Nouveau message"
        description="Le message est préparé dans une boîte d’envoi contrôlée et inscrit dans la mémoire. Cette version ne l’expédie pas hors d’OPS."
        onClose={() => setComposeOpen(false)}
      >
        <form
          className="ops-form"
          onSubmit={(event) => {
            event.preventDefault();
            void sendEmail(compose).then((sent) => {
              if (!sent) return;
              setCompose({ to: "", company: "", subject: "", body: "" });
              setComposeOpen(false);
            });
          }}
        >
          <label><span>Destinataire</span><input required type="email" value={compose.to} onChange={(event) => setCompose((current) => ({ ...current, to: event.target.value }))} placeholder="nom@client.example" /></label>
          <label><span>Entreprise</span><input value={compose.company} onChange={(event) => setCompose((current) => ({ ...current, company: event.target.value }))} placeholder="Entreprise liée" /></label>
          <label className="full"><span>Objet</span><input required value={compose.subject} onChange={(event) => setCompose((current) => ({ ...current, subject: event.target.value }))} placeholder="Objet du message" /></label>
          <label className="full"><span>Message</span><textarea required rows={8} value={compose.body} onChange={(event) => setCompose((current) => ({ ...current, body: event.target.value }))} placeholder="Écrivez votre message…" /></label>
          <footer className="full"><span>{sendStatus}</span><button type="button" onClick={() => openAgent(`Aide-moi à rédiger un email avec cet objet : ${compose.subject}`)}><OpsIcon name="spark" size={15} /> Rédiger avec OPS</button><button className="primary-button" disabled={sending} type="submit">{sending ? "Placement…" : "Placer en boîte d’envoi"}</button></footer>
        </form>
      </OpsModal>
    </>
  );
}

function DocumentsPage({ openAgent, generatedDocuments, preferredDocumentId, onDocumentImported }: {
  openAgent: OpenAgent;
  generatedDocuments: OpsDocument[];
  preferredDocumentId?: string;
  onDocumentImported?: (document: OpsDocument) => void;
}) {
  const allDocuments = useMemo(() => {
    const merged = new Map<string, OpsDocument>();
    for (const document of documents) merged.set(document.id, document);
    for (const document of generatedDocuments) merged.set(document.id, document);
    return [...merged.values()];
  }, [generatedDocuments]);
  const [selectedId, setSelectedId] = useState(preferredDocumentId ?? allDocuments[0].id);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentTypes = ["Tous", ...new Set(allDocuments.map((document) => document.type))];
  const pdfCount = allDocuments.filter((document) => (
    Boolean(document.url || document.objectUrl || document.dataUrl)
  )).length;
  const visibleDocuments = allDocuments.filter((document) => {
    const matchesType = typeFilter === "Tous" || document.type === typeFilter;
    const haystack = `${document.name} ${document.id} ${document.linked} ${document.owner}`.toLocaleLowerCase("fr");
    return matchesType && haystack.includes(query.toLocaleLowerCase("fr").trim());
  });
  const selected = visibleDocuments.find((document) => document.id === selectedId)
    ?? visibleDocuments[0];

  useEffect(() => {
    if (preferredDocumentId && allDocuments.some((document) => document.id === preferredDocumentId)) setSelectedId(preferredDocumentId);
  }, [allDocuments, preferredDocumentId]);

  const cycleType = () => {
    const index = documentTypes.indexOf(typeFilter);
    setTypeFilter(documentTypes[(index + 1) % documentTypes.length]);
  };
  const importPdf = async (file: File) => {
    setImporting(true);
    setImportStatus("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("linked", "Direction");
      const response = await fetch("/api/documents/import", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        document?: StoredOpsDocument;
      };
      if (!response.ok || !payload.document) throw new Error(payload.error ?? "document_import_failed");
      const imported = storedDocumentToUi(payload.document);
      onDocumentImported?.(imported);
      setSelectedId(imported.id);
      setImportStatus(`${file.name} est archivé dans Documents et relié à la mémoire.`);
    } catch {
      setImportStatus("Le PDF n’a pas pu être importé. Vérifiez qu’il est valide et inférieur à 15 Mo.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="content-page">
      <PageHeading page="documents" action={<><input ref={fileInputRef} hidden accept="application/pdf,.pdf" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPdf(file); }} /><button className="primary-button" disabled={importing} onClick={() => fileInputRef.current?.click()}><OpsIcon name="plus" size={16} /> {importing ? "Import…" : "Importer"}</button></>} />
      <div className="documents-layout">
        <section className="panel documents-panel">
          <div className="panel-title"><div><span>{allDocuments.length} documents disponibles</span><small>{importStatus || `${allDocuments.length} éléments indexés dans la mémoire · ${pdfCount} PDF ouvrables`}</small></div><div className="table-actions"><button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((current) => !current)}><OpsIcon name="search" size={15} /> Rechercher</button><button onClick={cycleType}><OpsIcon name="filter" size={15} /> {typeFilter === "Tous" ? "Filtrer" : typeFilter}</button></div></div>
          {searchOpen ? <div className="entity-search"><OpsIcon name="search" size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, identifiant, client ou responsable…" /></div> : null}
          <div className="entity-table documents-table"><div className="table-head"><span>Document</span><span>Type</span><span>Lié à</span><span>Responsable</span><span>Mise à jour</span><span>État OPS</span></div>{visibleDocuments.map((document) => <button className={`table-row ${selected?.id === document.id ? "selected" : ""}`} onClick={() => setSelectedId(document.id)} key={document.id}><span><i className="doc-type"><OpsIcon name={document.generated ? "download" : "document"} size={16} /></i><span><strong>{document.name}</strong><small>{document.id}</small></span></span><span>{document.type}</span><span>{document.linked}</span><span>{document.owner}</span><span>{document.updated}</span><span className={`doc-status status-${document.status.toLocaleLowerCase("fr").replace("à ", "").replaceAll(" ", "-")}`}>{document.status}</span></button>)}{!visibleDocuments.length ? <div className="entity-empty">Aucun document ne correspond à cette vue.</div> : null}</div>
        </section>
        {selected ? <aside className="document-inspector"><header><span className="doc-preview-icon"><OpsIcon name="document" size={28} /></span><button aria-label={`Analyser les relations de ${selected.name}`} onClick={() => openAgent(`Liste les relations, décisions et usages du document ${selected.id}.`)}><OpsIcon name="dots" size={17} /></button></header><span className="eyebrow">{selected.id} · {selected.type}</span><h2>{selected.name}</h2><p>Lié à <strong>{selected.linked}</strong> · mis à jour par {selected.owner}</p>{selected.url || selected.objectUrl || selected.dataUrl ? <object className="pdf-preview" data={selected.url ?? selected.objectUrl ?? selected.dataUrl} type="application/pdf" aria-label={`Aperçu de ${selected.name}`}><a href={selected.url ?? selected.objectUrl ?? selected.dataUrl} target="_blank" rel="noreferrer">Ouvrir le PDF</a></object> : <div className="doc-preview-lines"><i /><i /><i /><i /><i /></div>}<div className="doc-insight"><span><OpsIcon name="spark" size={15} /> Ce qu’OPS en retient</span><strong>{selected.facts} éléments indexés</strong><p>{selected.summary || "Montants, dates, engagements, personnes et relations ont été reliés au dossier concerné."}</p>{selected.url || selected.objectUrl || selected.dataUrl ? <a className="document-download" href={selected.downloadUrl ?? selected.url ?? selected.objectUrl ?? selected.dataUrl} download={selected.name}><OpsIcon name="download" size={15} /> Télécharger le PDF</a> : null}<button onClick={() => openAgent(`Résume et analyse uniquement le document ${selected.id} (${selected.name}). Commence par les faits extraits de cette source, puis distingue clairement tes éventuelles comparaisons avec le reste de la mémoire.`)}>Interroger ce document <OpsIcon name="arrow" size={14} /></button></div><SourceChips sources={[selected.id, selected.linked]} /></aside> : null}
      </div>
    </div>
  );
}

function ClientsPage({ openAgent }: { openAgent: OpenAgent }) {
  const [portfolio, setPortfolio] = usePersistedClients();
  const [selectedId, setSelectedId] = useState(clients[0].id);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<"Tous" | ClientView["status"]>("Tous");
  const [searchOpen, setSearchOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    status: "Prospect" as ClientView["status"],
    owner: "Camille",
    revenue: "0",
    margin: "30",
    health: "70",
    last: "Aujourd’hui",
    opportunity: "Premier rendez-vous à planifier",
    email: "",
  });
  const segments: Array<"Tous" | ClientView["status"]> = [
    "Tous",
    "Actif",
    "À risque",
    "À suivre",
    "Dormant",
    "Prospect",
  ];
  const filtered = portfolio.filter((client) => {
    const matchesSegment = segment === "Tous" || client.status === segment;
    const haystack = `${client.name} ${client.owner} ${client.status}`.toLocaleLowerCase("fr");
    return matchesSegment && haystack.includes(query.toLocaleLowerCase("fr").trim());
  });
  const selected = filtered.find((client) => client.id === selectedId)
    ?? filtered[0];
  const cycleSegment = () => {
    const index = segments.indexOf(segment);
    setSegment(segments[(index + 1) % segments.length]);
  };
  const openClientModal = (client?: ClientView) => {
    setStatus("");
    setEditingId(client?.id ?? null);
    if (client) {
      setDraft({
        name: client.name,
        status: client.status,
        owner: client.owner,
        revenue: String(safeNumber(client.revenue.replace(/[^\d,.-]/g, ""), 0) * 1_000),
        margin: String(safeNumber(client.margin.replace(/[^\d,.-]/g, ""), 30)),
        health: String(client.health),
        last: client.last,
        opportunity: client.opportunity,
        email: client.email ?? "",
      });
    } else {
      setDraft({
        name: "",
        status: "Prospect",
        owner: "Camille",
        revenue: "0",
        margin: "30",
        health: "70",
        last: "Aujourd’hui",
        opportunity: "Premier rendez-vous à planifier",
        email: "",
      });
    }
    setModalOpen(true);
  };
  const saveClient = async () => {
    setSaving(true);
    setStatus("");
    try {
      const revenue = safeNumber(draft.revenue, 0, 0, 100_000_000);
      const margin = safeNumber(draft.margin, 30, -100, 100);
      const health = safeNumber(draft.health, 70, 0, 100);
      const payload = {
        kind: "client",
        name: draft.name,
        status: draft.status,
        owner: draft.owner,
        revenue,
        margin,
        health,
        last: draft.last,
        opportunity: draft.opportunity,
        email: draft.email || undefined,
        linked: ["ORG-001"],
      };
      const created = editingId
        ? await updateOpsRecord(editingId, payload)
        : await createOpsRecord(payload);
      const words = draft.name.split(/\s+/).filter(Boolean);
      const client: ClientView = {
        id: created.id,
        name: draft.name,
        initials: words.map((word) => word[0]).join("").slice(0, 2).toLocaleUpperCase("fr"),
        owner: draft.owner,
        revenue: `${(revenue / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} K€`,
        margin: `${margin.toLocaleString("fr-FR")} %`,
        last: draft.last,
        health,
        status: draft.status,
        opportunity: draft.opportunity,
        email: draft.email,
      };
      setPortfolio((current) => [client, ...current.filter((item) => item.id !== client.id)]);
      setSelectedId(client.id);
      setDraft({
        name: "",
        status: "Prospect",
        owner: "Camille",
        revenue: "0",
        margin: "30",
        health: "70",
        last: "Aujourd’hui",
        opportunity: "Premier rendez-vous à planifier",
        email: "",
      });
      setEditingId(null);
      setModalOpen(false);
    } catch {
      setStatus("Le client n’a pas pu être inscrit dans la mémoire centrale.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="content-page">
        <PageHeading page="clients" action={<button className="primary-button" onClick={() => openClientModal()}><OpsIcon name="plus" size={16} /> Nouveau client</button>} />
        <div className="clients-layout">
          <section className="panel clients-panel">
            <div className="panel-title">
              <div><span>{portfolio.length} clients & prospects</span><small>Portefeuille actualisé aujourd’hui</small></div>
              <div className="table-actions">
                <button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((current) => !current)}><OpsIcon name="search" size={15} /> Rechercher</button>
                <button onClick={cycleSegment}><OpsIcon name="filter" size={15} /> {segment === "Tous" ? "Segments" : segment}</button>
              </div>
            </div>
            {searchOpen ? <div className="entity-search"><OpsIcon name="search" size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, responsable ou statut…" /></div> : null}
            <div className="entity-table clients-table">
              <div className="table-head"><span>Client</span><span>Statut</span><span>CA 12 mois</span><span>Marge</span><span>Dernier échange</span><span>Santé</span></div>
              {filtered.map((client) => <button key={client.id} className={`table-row ${selected?.id === client.id ? "selected" : ""}`} onClick={() => setSelectedId(client.id)}><span><i className="client-avatar">{client.initials}</i><span><strong>{client.name}</strong><small>{client.id} · {client.owner}</small></span></span><span>{client.status}</span><span><strong>{client.revenue}</strong></span><span>{client.margin}</span><span>{client.last}</span><span><i className="health-bar"><b style={{ width: `${client.health}%` }} /></i>{client.health}</span></button>)}
              {!filtered.length ? <div className="entity-empty">Aucun compte dans ce segment.</div> : null}
            </div>
          </section>
          {selected ? <aside className="client-inspector">
            <header><span className="large-client-avatar">{selected.initials}</span><button aria-label={`Modifier ${selected.name}`} onClick={() => openClientModal(selected)}><OpsIcon name="dots" size={17} /></button></header>
            <span className="eyebrow">{selected.id} · {selected.status}</span><h2>{selected.name}</h2><p>Compte suivi par {selected.owner}</p>
            <button className="primary-button full" onClick={() => openAgent(`Résume-moi le compte ${selected.name} avant mon appel`)}><OpsIcon name="spark" size={15} /> Demander à OPS</button>
            <div className="client-summary"><span>Résumé OPS</span><p>{selected.name} représente {selected.revenue} sur 12 mois, avec une marge de {selected.margin}. La prochaine action identifiée est : {selected.opportunity}.</p></div>
            <div className="client-numbers"><div><span>CA 12 mois</span><strong>{selected.revenue}</strong></div><div><span>Marge</span><strong>{selected.margin}</strong></div><div><span>Santé</span><strong>{selected.health}/100</strong></div></div>
            <div className="client-timeline"><span>Derniers événements</span><p><i />Aujourd’hui · Données synchronisées</p><p><i />{selected.last} · Dernière interaction</p><p><i />90 j · Revue de compte OPS</p></div>
          </aside> : null}
        </div>
      </div>
      <OpsModal open={modalOpen} title={editingId ? "Modifier le client" : "Nouveau client"} description="Le compte est écrit immédiatement dans la mémoire centrale et devient interrogeable par OPS." onClose={() => { setModalOpen(false); setEditingId(null); }}>
        <form className="ops-form" onSubmit={(event) => { event.preventDefault(); void saveClient(); }}>
          <label className="full"><span>Entreprise</span><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Hôtel Voltaire" /></label>
          <label><span>Statut</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ClientView["status"] }))}>{segments.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Responsable</span><input required value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} /></label>
          <label><span>CA 12 mois (€)</span><input min="0" required type="number" value={draft.revenue} onChange={(event) => setDraft((current) => ({ ...current, revenue: event.target.value }))} /></label>
          <label><span>Marge (%)</span><input max="100" min="-100" required type="number" value={draft.margin} onChange={(event) => setDraft((current) => ({ ...current, margin: event.target.value }))} /></label>
          <label><span>Santé (/100)</span><input max="100" min="0" required type="number" value={draft.health} onChange={(event) => setDraft((current) => ({ ...current, health: event.target.value }))} /></label>
          <label><span>Dernier échange</span><input required value={draft.last} onChange={(event) => setDraft((current) => ({ ...current, last: event.target.value }))} /></label>
          <label className="full"><span>Prochaine action</span><input required value={draft.opportunity} onChange={(event) => setDraft((current) => ({ ...current, opportunity: event.target.value }))} /></label>
          <label className="full"><span>Email principal</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="direction@entreprise.fr" /></label>
          <footer className="full"><span>{status}</span><button type="button" onClick={() => openAgent(`Aide-moi à préparer l'onboarding du client ${draft.name || "à créer"}.`)}><OpsIcon name="spark" size={15} /> Préparer avec OPS</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Créer le client"}</button></footer>
        </form>
      </OpsModal>
    </>
  );
}

function PlanningPage({ openAgent }: { openAgent: OpenAgent }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [plannedTasks, setPlannedTasks] = usePersistedPlanningTasks();
  const [slotDraft, setSlotDraft] = useState<{
    id?: string;
    project: string;
    owner: string;
    dayIndex: number;
    title: string;
    description: string;
    status: PlanningTaskView["status"];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const weekStart = useMemo(() => {
    const date = new Date(2026, 6, 13);
    date.setDate(date.getDate() + weekOffset * 7);
    return date;
  }, [weekOffset]);
  const visibleDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", "");
      return `${weekday.slice(0, 3)}. ${date.getDate()}`;
    });
  }, [weekStart]);
  const weekLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(weekStart);
  const visiblePlanningRows = useMemo(() => {
    const known = new Set(planningRows.map((row) => row.project));
    const extraProjects = [...new Set(
      plannedTasks
        .filter((task) => task.project && !known.has(task.project))
        .map((task) => task.project),
    )];
    const tones = ["blue", "peach", "green", "grey"];
    return [
      ...planningRows,
      ...extraProjects.map((project, index) => ({
        project,
        owner: plannedTasks.find((task) => task.project === project)?.owner ?? "À assigner",
        tone: tones[index % tones.length],
        slots: [0, 0, 0, 0, 0],
      })),
    ];
  }, [plannedTasks]);
  const openSlot = (project: string, owner: string, dayIndex: number) => {
    setStatus("");
    setSlotDraft({
      project,
      owner: owner.split(" +")[0],
      dayIndex,
      title: `Intervention ${project}`,
      description: `Créneau réservé pour ${project}, à confirmer avec ${owner}.`,
      status: "open",
    });
  };
  const openTask = (task: PlanningTaskView) => {
    setStatus("");
    setSlotDraft({
      id: task.id,
      project: task.project,
      owner: task.owner,
      dayIndex: task.dayIndex,
      title: task.title,
      description: task.description,
      status: task.status,
    });
  };
  const saveSlot = async () => {
    if (!slotDraft) return;
    setSaving(true);
    setStatus("");
    try {
      const due = `${visibleDays[slotDraft.dayIndex]} · semaine du ${weekLabel}`;
      const payload = {
        kind: "task",
        title: slotDraft.title,
        owner: slotDraft.owner,
        due,
        status: slotDraft.status,
        description: slotDraft.description,
        project: slotDraft.project,
        dayIndex: slotDraft.dayIndex,
        weekOffset,
        linked: ["ORG-001"],
      };
      const saved = slotDraft.id
        ? await updateOpsRecord(slotDraft.id, payload)
        : await createOpsRecord(payload).then((created) => (
            // La création agentique conserve le reçu d'action ; le PATCH
            // enrichit ensuite la fiche avec sa position exacte dans la grille.
            updateOpsRecord(created.id, payload)
          ));
      setPlannedTasks((current) => [{
        id: saved.id,
        title: slotDraft.title,
        owner: slotDraft.owner,
        due,
        status: slotDraft.status,
        description: slotDraft.description,
        project: slotDraft.project,
        dayIndex: slotDraft.dayIndex,
        weekOffset,
      }, ...current.filter((task) => task.id !== saved.id)]);
      setSlotDraft(null);
    } catch {
      setStatus("Le créneau n’a pas pu être inscrit dans la mémoire centrale.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="content-page">
        <PageHeading page="planning" action={<button className="primary-button" onClick={() => openAgent("Quels conflits de planning dois-je résoudre ?")}><OpsIcon name="spark" size={16} /> Optimiser avec OPS</button>} />
        <div className="planning-summary">
          <button className="planning-summary-card" onClick={() => openAgent("Explique la charge atelier de 86 % et les capacités encore disponibles.")}><span>Charge atelier</span><strong>86 %</strong><small>+9 pts vs semaine dernière</small></button>
          <button className="planning-summary-card" onClick={() => openAgent("Analyse les deux projets à risque du planning : Rivoli et la maintenance CNC.")}><span>Projets à risque</span><strong>2</strong><small>Rivoli · CNC</small></button>
          <button className="planning-summary-card" onClick={() => openAgent("Où sont les quatre jours de capacité disponible et comment les affecter ?")}><span>Capacité disponible</span><strong>4 j</strong><small>Équipe pose · vendredi</small></button>
          <button className="planning-summary-card" onClick={() => openAgent("Classe les sept échéances du planning par urgence et impact.")}><span>Échéances</span><strong>7</strong><small>2 sensibles cette semaine</small></button>
        </div>
        <section className="panel planning-panel">
          <div className="panel-title">
            <div><span>Semaine du {weekLabel}</span><small>18 personnes · {visiblePlanningRows.length} projets visibles</small></div>
            <div className="week-switch">
              <button aria-label="Semaine précédente" onClick={() => setWeekOffset((current) => current - 1)}>‹</button>
              <button onClick={() => setWeekOffset(0)}>Aujourd’hui</button>
              <button aria-label="Semaine suivante" onClick={() => setWeekOffset((current) => current + 1)}>›</button>
            </div>
          </div>
          <div className="planning-grid">
            <div className="planning-corner">Projet / équipe</div>
            {visibleDays.map((day, index) => <div className={`planning-day ${weekOffset === 0 && index === 4 ? "today" : ""}`} key={day}>{day}<small>{weekOffset === 0 && index === 4 ? "Aujourd’hui" : ""}</small></div>)}
            {visiblePlanningRows.map((row) => (
              <div className="planning-row" key={row.project}>
                <button className="planning-project" onClick={() => openAgent(`Résume le planning, les risques et les prochaines étapes du projet ${row.project}.`)}><strong>{row.project}</strong><small>{row.owner}</small></button>
                {row.slots.map((baseActive, index) => {
                  const task = plannedTasks.find((item) => (
                    item.project === row.project
                    && item.dayIndex === index
                    && item.weekOffset === weekOffset
                  ));
                  const active = weekOffset === 0 && baseActive;
                  return (
                    <div className={`planning-slot ${weekOffset === 0 && index === 2 ? "today" : ""}`} key={index}>
                      {task ? (
                        <button className={row.tone} title={`${task.title} · cliquer pour modifier`} onClick={() => openTask(task)}>{task.title}</button>
                      ) : active ? (
                        <button className={row.tone} onClick={() => openAgent(`Ouvre le créneau ${visibleDays[index]} de ${row.project} (${row.owner}) et explique les dépendances.`)}>{index === 2 && row.project.includes("Rivoli") ? "Contrôle qualité" : "Planifié"}</button>
                      ) : (
                        <button className="planning-slot-add" aria-label={`Planifier ${row.project} le ${visibleDays[index]}`} onClick={() => openSlot(row.project, row.owner, index)}><OpsIcon name="plus" size={14} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="planning-alert"><span><OpsIcon name="spark" size={17} /></span><div><strong>Risque détecté jeudi après-midi</strong><p>Thomas est affecté simultanément à Rivoli et à la calibration CNC. Hugo peut reprendre le contrôle qualité avec la procédure existante.</p></div><button onClick={() => openAgent("Que se passe-t-il si Thomas est absent ?")}>Examiner</button></div>
        </section>
      </div>
      <OpsModal open={Boolean(slotDraft)} title={slotDraft?.id ? "Modifier le créneau" : "Planifier un créneau"} description="L’affectation est écrite dans la mémoire centrale et devient immédiatement visible par OPS." onClose={() => setSlotDraft(null)}>
        {slotDraft ? <form className="ops-form" onSubmit={(event) => { event.preventDefault(); void saveSlot(); }}>
          <label className="full"><span>Intervention</span><input required value={slotDraft.title} onChange={(event) => setSlotDraft((current) => current ? ({ ...current, title: event.target.value }) : current)} /></label>
          <label><span>Projet</span><input disabled value={slotDraft.project} /></label>
          <label><span>Jour</span><input disabled value={visibleDays[slotDraft.dayIndex]} /></label>
          <label className="full"><span>Responsable</span><input required value={slotDraft.owner} onChange={(event) => setSlotDraft((current) => current ? ({ ...current, owner: event.target.value }) : current)} /></label>
          <label className="full"><span>Statut</span><select value={slotDraft.status} onChange={(event) => setSlotDraft((current) => current ? ({ ...current, status: event.target.value as PlanningTaskView["status"] }) : current)}><option value="open">À faire</option><option value="in_progress">En cours</option><option value="done">Terminée</option></select></label>
          <label className="full"><span>Consigne</span><textarea required value={slotDraft.description} onChange={(event) => setSlotDraft((current) => current ? ({ ...current, description: event.target.value }) : current)} /></label>
          <footer className="full"><span>{status}</span><button type="button" onClick={() => openAgent(`Aide-moi à préparer le créneau ${slotDraft.title} pour ${slotDraft.project}.`)}><OpsIcon name="spark" size={15} /> Préparer avec OPS</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement…" : slotDraft.id ? "Enregistrer" : "Planifier"}</button></footer>
        </form> : null}
      </OpsModal>
    </>
  );
}

function CRMPage({ openAgent, createRequest = 0 }: {
  openAgent: OpenAgent;
  createRequest?: number;
}) {
  const stages = ["Qualification", "Découverte", "Proposition", "Négociation"] as const;
  const emptyOpportunity = (stage: OpportunityView["stage"] = "Qualification") => ({
    name: "",
    amount: "25000",
    stage,
    probability: "45",
    owner: "Camille",
    source: "Recommandation",
    next: "Appel de qualification",
  });
  const [cards, setCards] = usePersistedOpportunities();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState(emptyOpportunity);

  const pipeline = cards.reduce((sum, item) => sum + item.amount, 0);
  const openOpportunityModal = (
    stage: OpportunityView["stage"] = "Qualification",
    opportunity?: OpportunityView,
  ) => {
    setEditingId(opportunity?.id ?? null);
    if (opportunity) {
      setDraft({
        name: opportunity.name,
        amount: String(opportunity.amount),
        stage: opportunity.stage,
        probability: String(opportunity.probability),
        owner: opportunity.owner,
        source: opportunity.source,
        next: opportunity.next,
      });
    } else {
      setDraft(emptyOpportunity(stage));
    }
    setStatus("");
    setModalOpen(true);
  };

  useEffect(() => {
    if (!createRequest) return;
    setEditingId(null);
    setDraft(emptyOpportunity());
    setStatus("");
    setModalOpen(true);
  }, [createRequest]);

  const saveOpportunity = async () => {
    setSaving(true);
    setStatus("");
    try {
      const amount = safeNumber(draft.amount, 0, 0, 100_000_000);
      const probability = safeNumber(draft.probability, 0, 0, 100);
      const payload = {
        kind: "opportunity",
        name: draft.name,
        amount,
        stage: draft.stage,
        probability,
        owner: draft.owner,
        source: draft.source,
        next: draft.next,
        linked: ["ORG-001"],
      };
      const saved = editingId
        ? await updateOpsRecord(editingId, payload)
        : await createOpsRecord(payload);
      setCards((current) => [{
        id: saved.id,
        name: draft.name,
        amount,
        stage: draft.stage,
        probability,
        owner: draft.owner,
        source: draft.source,
        next: draft.next,
      }, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(emptyOpportunity());
      setEditingId(null);
      setModalOpen(false);
    } catch {
      setStatus("L’opportunité n’a pas pu être inscrite dans la mémoire centrale.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="content-page">
        <PageHeading page="crm" description={`${(pipeline / 1000).toLocaleString("fr-FR")} K€ d’opportunités ouvertes, avec les risques et signaux expliqués.`} action={<div className="heading-actions"><button className="soft-button" onClick={() => openAgent("Filtre le pipeline par probabilité, montant, source et prochaine échéance.")}><OpsIcon name="filter" size={15} /> Filtres</button><button className="primary-button" onClick={() => openOpportunityModal()}><OpsIcon name="plus" size={16} /> Opportunité</button></div>} />
        <div className="crm-topline">
          <button className="crm-metric" onClick={() => openAgent("Analyse le pipeline commercial ouvert et explique son évolution.")}><span>Pipeline ouvert</span><strong>{(pipeline / 1000).toLocaleString("fr-FR")} K€</strong><small>+12 % ce mois</small></button>
          <button className="crm-metric" onClick={() => openAgent("Compare la prévision équipe à la prévision OPS et explique l’écart.")}><span>Prévision équipe</span><strong>96 K€</strong><small>OPS prévoit 88 K€</small></button>
          <button className="crm-metric" onClick={() => openAgent("Explique le taux de transformation sur 90 jours et les leviers de progression.")}><span>Taux de transformation</span><strong>31 %</strong><small>+4 pts sur 90 jours</small></button>
          <button className="crm-ai-button" onClick={() => openAgent("Quelle opportunité faut-il prioriser ?")}><OpsIcon name="spark" size={16} /> Quelle affaire prioriser ?</button>
        </div>
        <section className="kanban-board">
          {stages.map((stage) => {
            const stageCards = cards.filter((item) => item.stage === stage);
            return (
              <div className="kanban-column" key={stage}>
                <header><span>{stage}</span><em>{stageCards.length}</em><strong>{stageCards.reduce((sum, item) => sum + item.amount, 0) / 1000} K€</strong></header>
                {stageCards.map((opportunity) => (
                  <article
                    key={opportunity.id}
                    onClick={() => openOpportunityModal(opportunity.stage, opportunity)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      openOpportunityModal(opportunity.stage, opportunity);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Modifier l'opportunité ${opportunity.name}`}
                  >
                    <div><span>{opportunity.id}</span><em>{opportunity.probability} %</em></div><h3>{opportunity.name}</h3><strong>{opportunity.amount / 1000} K€</strong><p>{opportunity.next}</p><footer><span>{opportunity.owner}</span><small>{opportunity.source}</small></footer>
                  </article>
                ))}
                {!stageCards.length && <div className="kanban-empty">Aucune affaire</div>}
                <button className="kanban-add" onClick={() => openOpportunityModal(stage)}><OpsIcon name="plus" size={14} /> Ajouter</button>
              </div>
            );
          })}
        </section>
      </div>
      <OpsModal open={modalOpen} title={editingId ? "Modifier l’opportunité" : "Nouvelle opportunité"} description="La fiche est immédiatement écrite dans la mémoire centrale et devient interrogeable par OPS." onClose={() => { setModalOpen(false); setEditingId(null); }}>
        <form className="ops-form" onSubmit={(event) => { event.preventDefault(); void saveOpportunity(); }}>
          <label className="full"><span>Affaire</span><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Rénovation Hôtel Voltaire" /></label>
          <label><span>Montant (€)</span><input min="0" required type="number" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} /></label>
          <label><span>Probabilité (%)</span><input max="100" min="0" required type="number" value={draft.probability} onChange={(event) => setDraft((current) => ({ ...current, probability: event.target.value }))} /></label>
          <label><span>Étape</span><select value={draft.stage} onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value as OpportunityView["stage"] }))}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
          <label><span>Responsable</span><input required value={draft.owner} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} /></label>
          <label><span>Source</span><input required value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} /></label>
          <label><span>Prochaine action</span><input required value={draft.next} onChange={(event) => setDraft((current) => ({ ...current, next: event.target.value }))} /></label>
          <footer className="full"><span>{status}</span><button type="button" onClick={() => openAgent(`Aide-moi à qualifier cette opportunité : ${draft.name || "nouvelle affaire"}`)}><OpsIcon name="spark" size={15} /> Qualifier avec OPS</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Créer l’opportunité"}</button></footer>
        </form>
      </OpsModal>
    </>
  );
}

function NumbersPage({ openAgent }: { openAgent: OpenAgent }) {
  const tabs = ["Vue d’ensemble", "Activité", "Marge", "Trésorerie", "Acquisition", "SEO"];
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [period, setPeriod] = useState<"Mensuel" | "Hebdomadaire">("Mensuel");
  const companyState = useCompanyState();
  const [pipelineItems] = usePersistedOpportunities();
  const livePipeline = pipelineItems.reduce((sum, item) => sum + item.amount, 0);
  const liveKpis = companyKpis(companyState, livePipeline);
  const { visibleKpis, activeChart, chartSeries } = numbersPresentation(
    companyState,
    liveKpis,
    activeTab,
    period,
  );
  const seoQualifiedLeads = companyState
    ? Math.max(
        0,
        (companyState.acquisition.qualifiedLeads ?? 0)
          - (companyState.googleAds.qualifiedLeads ?? 0)
          - (companyState.meta.qualifiedLeads ?? 0),
      )
    : null;
  const liveAcquisitionChannels = acquisitionChannels.map((channel) => {
    if (channel.name === "Google Ads") {
      return {
        ...channel,
        spend: companyState?.googleAds.spend === null || companyState?.googleAds.spend === undefined
          ? channel.spend
          : `${companyState.googleAds.spend.toLocaleString("fr-FR")} €`,
        result: formatCompactEuro(companyState?.googleAds.attributedPipeline, channel.result),
      };
    }
    if (channel.name === "SEO") {
      return {
        ...channel,
        result: seoQualifiedLeads === null ? channel.result : String(seoQualifiedLeads),
      };
    }
    if (channel.name === "Instagram") {
      return {
        ...channel,
        result: formatCompactEuro(companyState?.instagram.attributedPipeline, channel.result),
        trend: companyState?.instagram.opportunities === null
          || companyState?.instagram.opportunities === undefined
          ? channel.trend
          : `${companyState.instagram.opportunities} opportunité`,
      };
    }
    if (channel.name === "Meta Ads") {
      return {
        ...channel,
        spend: companyState?.meta.spend === null || companyState?.meta.spend === undefined
          ? channel.spend
          : `${companyState.meta.spend.toLocaleString("fr-FR")} €`,
        result: companyState?.meta.qualifiedLeads === null
          || companyState?.meta.qualifiedLeads === undefined
          ? channel.result
          : String(companyState.meta.qualifiedLeads),
      };
    }
    return channel;
  });
  const tabPrompt: Record<string, string> = {
    "Vue d’ensemble": "Analyse la vue d’ensemble des chiffres de l’entreprise aujourd’hui.",
    Activité: "Analyse l’activité et le chiffre d’affaires, puis compare à la période précédente.",
    Marge: "Analyse la marge, ses causes et les leviers de correction.",
    Trésorerie: "Analyse la trésorerie, les créances et les risques de cash.",
    Acquisition: "Compare tous les canaux d’acquisition et recommande les arbitrages.",
    SEO: "Donne-moi le récap SEO complet, chiffré, comparé à hier, avec les priorités.",
  };
  return (
    <div className="content-page">
      <PageHeading page="numbers" action={<button className="primary-button" onClick={() => openAgent("Où en sommes-nous sur la stratégie du trimestre ?")}><OpsIcon name="spark" size={16} /> Expliquer avec OPS</button>} />
      <section className="number-tabs">{tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</section>
      <section className="kpi-row numbers-kpis">{visibleKpis.map((kpi) => <button className="kpi-card" key={kpi.label} onClick={() => openAgent(`Explique le KPI ${kpi.label} (${kpi.value}, ${kpi.delta}), sa tendance, ses causes et les décisions recommandées.`)}><span>{kpi.label}</span><strong>{kpi.value}</strong><small className={kpi.tone}>{kpi.delta}</small><i><b style={{ width: kpi.tone === "negative" ? "41%" : "72%" }} /></i></button>)}</section>
      <div className="numbers-grid">
        <section className="panel performance-chart">
          <div className="panel-title"><div><span>{activeTab === "Vue d’ensemble" ? "Activité & marge" : activeTab}</span><small>Janvier — juillet 2026 · vue {period.toLocaleLowerCase("fr")}</small></div><button onClick={() => setPeriod((current) => current === "Mensuel" ? "Hebdomadaire" : "Mensuel")}>{period} <OpsIcon name="chevron" size={13} /></button></div>
          <div className="chart-legend"><span><i className="blue" /> {activeChart.legend[0]}</span><span><i className="green" /> {activeChart.legend[1]}</span></div>
          <button className="chart-interaction" onClick={() => openAgent(tabPrompt[activeTab])} aria-label={`Analyser ${activeTab}`}>
            <svg viewBox="0 0 720 260" preserveAspectRatio="none"><g className="chart-grid"><line x1="0" y1="40" x2="720" y2="40"/><line x1="0" y1="100" x2="720" y2="100"/><line x1="0" y1="160" x2="720" y2="160"/><line x1="0" y1="220" x2="720" y2="220"/></g><path className="area-path" d={chartSeries.area}/><path className="revenue-path" d={chartSeries.primary}/><path className="margin-path" d={chartSeries.secondary}/><g className="chart-labels">{chartSeries.labels.map((label, index) => <text key={label} x={index === 6 ? 690 : index * 116} y="252">{label}</text>)}</g></svg>
          </button>
          <div className="chart-insight"><OpsIcon name="spark" size={15} /><span><strong>OPS observe :</strong> {activeChart.insight}{activeChart.source ? ` [${activeChart.source}]` : ""}</span><button onClick={() => openAgent(tabPrompt[activeTab])}>Comprendre</button></div>
        </section>
        <section className="panel acquisition-panel"><div className="panel-title"><div><span>Acquisition</span><small>Performance multi-canal</small></div><button onClick={() => openAgent("Google Ads ou Meta : où investir ?")}>Arbitrer</button></div>{liveAcquisitionChannels.map((channel) => {
          const inspectChannel = () => openAgent(`Analyse en détail le canal ${channel.name} : dépenses, résultats, attribution, comparaison à hier et recommandations.`);
          return <article key={channel.name} onClick={inspectChannel} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspectChannel(); } }} role="button" tabIndex={0} aria-label={`Analyser le canal ${channel.name}`}><div><i className={channel.tone} /><span><strong>{channel.name}</strong><small>Dépense · {channel.spend}</small></span><em>{channel.trend}</em></div><p><strong>{channel.result}</strong><span>{channel.label}</span></p><i className="efficiency"><b style={{ width: `${channel.efficiency}%` }} /></i></article>;
        })}</section>
      </div>
      <section className="seo-strategy"><div><span className="seo-rank">{formatDecimal(companyState?.seo.focusKeywordPosition, "07")}</span><p><span>Position Google</span><strong>agencement hôtel Paris</strong><small>{formatDecimal(companyState?.seo.focusKeywordClicks, "96")} clics mensuels · {formatDecimal(companyState?.seo.conversions, "4")} conversions</small></p></div><div><span><OpsIcon name="spark" size={17} /> Recommandation OPS</span><p>Transformer le chantier Rivoli en étude de cas vidéo + page SEO. Un seul actif peut soutenir référencement, Ads, Instagram et prospection.</p></div><button onClick={() => openAgent("Quelle stratégie SEO prioriser ?")}>Construire la stratégie <OpsIcon name="arrow" size={14} /></button></section>
    </div>
  );
}

function BrainPage({ openAgent }: { openAgent: OpenAgent }) {
  return <div className="content-page brain-page"><PageHeading page="brain" action={<button className="brain-page-action" onClick={() => openAgent("Que dois-je comprendre de l’entreprise aujourd’hui ?")}><OpsIcon name="spark" size={15} /> Interroger le Cerveau</button>} /><BrainGraph onAsk={(prompt) => openAgent(prompt)} /></div>;
}

function CommandMenu({ open, setOpen, setPage, openAgent }: { open: boolean; setOpen: (value: boolean) => void; setPage: (page: PageId) => void; openAgent: OpenAgent }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      previousFocusRef.current?.focus();
    };
  }, [open, setOpen]);

  if (!open) return null;
  const pages = navGroups.flatMap((group) => group.items).filter((item) => item.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const submitQuery = () => {
    const prompt = query.trim();
    if (!prompt) return;
    openAgent(prompt);
    setOpen(false);
    setQuery("");
  };
  return <div className="command-backdrop" onMouseDown={() => setOpen(false)}><div aria-label="Rechercher ou commander" aria-modal="true" className="command-menu" onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog"><form className="command-input" onSubmit={(event) => { event.preventDefault(); submitQuery(); }}><OpsIcon name="search" size={19} /><input aria-label="Rechercher une page, un client ou poser une question" ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une page, un client ou poser une question…" /><kbd>Entrée</kbd></form><span className="command-label">Navigation</span>{pages.map((item) => <button key={item.id} onClick={() => { setPage(item.id); setOpen(false); }}><IconTile name={item.icon} /><span>{item.label}</span><small>Ouvrir</small><OpsIcon name="arrow" size={14} /></button>)}{query.trim() ? <button onClick={submitQuery}><IconTile name="spark" /><span>Demander « {query.trim().slice(0, 70)} »</span><small>Envoyer</small><OpsIcon name="arrow" size={14} /></button> : null}<span className="command-label">Demander à OPS</span>{agentScenarios.slice(0, 3).map((scenario) => <button key={scenario.id} onClick={() => { openAgent(scenario.label); setOpen(false); }}><IconTile name="spark" /><span>{scenario.label}</span><small>Question</small><OpsIcon name="arrow" size={14} /></button>)}</div></div>;
}

export function OpsApp() {
  const [page, setPage] = useState<PageId>("agent");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [generatedDocuments, setGeneratedDocuments] = useState<OpsDocument[]>([]);
  const [preferredDocumentId, setPreferredDocumentId] = useState<string>();
  const [crmCreateRequest, setCrmCreateRequest] = useState(0);
  const [sourceRequested, setSourceRequested] = useState<string | null>(null);
  const [sourceEvidence, setSourceEvidence] = useState<SourceEvidence | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const sourceRequestRef = useRef<AbortController | null>(null);

  const openAgent: OpenAgent = useCallback((prompt = "") => {
    setPage("agent");
    setPendingPrompt(prompt);
  }, []);

  const consumePendingPrompt = useCallback(() => setPendingPrompt(""), []);

  const addGeneratedDocument = useCallback((document: OpsDocument) => {
    setGeneratedDocuments((current) => {
      return [document, ...current.filter((item) => item.id !== document.id)];
    });
    setPreferredDocumentId(document.id);
  }, []);

  const openDocuments = useCallback((documentId?: string) => {
    if (documentId) setPreferredDocumentId(documentId);
    setPage("documents");
  }, []);

  const openNewOpportunity = useCallback(() => {
    setPage("crm");
    setCrmCreateRequest((current) => current + 1);
  }, []);

  const openSource = useCallback(async (rawSource: string) => {
    const source = rawSource.trim();
    if (!source) return;
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setSourceRequested(source);
    setSourceEvidence(null);
    setSourceError("");
    setSourceLoading(true);
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as SourceEvidence & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error === "source_not_found"
          ? "La note n’a pas été retrouvée avec certitude dans la mémoire centrale."
          : "La mémoire n’a pas pu ouvrir cette preuve pour le moment.");
      }
      if (!controller.signal.aborted) setSourceEvidence(payload);
    } catch (error) {
      if (controller.signal.aborted) return;
      setSourceError(error instanceof Error ? error.message : "La preuve n’a pas pu être ouverte.");
    } finally {
      if (!controller.signal.aborted) setSourceLoading(false);
    }
  }, []);

  const closeSource = useCallback(() => {
    sourceRequestRef.current?.abort();
    sourceRequestRef.current = null;
    setSourceRequested(null);
    setSourceEvidence(null);
    setSourceLoading(false);
    setSourceError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/documents?limit=250", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return [];
          const payload = await response.json() as { documents?: ListedOpsDocument[] };
          return (payload.documents ?? []).map(storedDocumentToUi);
        })
        .then((items) => {
          if (!controller.signal.aborted) setGeneratedDocuments(items);
        })
        .catch(() => {
          // L’agent reste disponible même si l’index des documents est momentanément indisponible.
        });
    };
    const refresh = () => load();
    load();
    document.addEventListener("ops-record-created", refresh);
    return () => {
      controller.abort();
      document.removeEventListener("ops-record-created", refresh);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); }
      if (event.key === "Escape") setCommandOpen(false);
    };
    const handleCommand = () => setCommandOpen(true);
    const handleOpenSource = (event: Event) => {
      const source = (event as CustomEvent<string>).detail;
      if (source) void openSource(source);
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("ops-command", handleCommand);
    document.addEventListener("ops-open-source", handleOpenSource);
    return () => { window.removeEventListener("keydown", handleKey); document.removeEventListener("ops-command", handleCommand); document.removeEventListener("ops-open-source", handleOpenSource); };
  }, [openSource]);

  useEffect(() => () => sourceRequestRef.current?.abort(), []);

  const content = useMemo(() => {
    switch (page) {
      case "today": return <TodayPage setPage={setPage} openAgent={openAgent} />;
      case "agent": return null;
      case "cycle": return <CyclePage openAgent={openAgent} openNewOpportunity={openNewOpportunity} />;
      case "emails": return <EmailsPage openAgent={openAgent} />;
      case "documents": return <DocumentsPage openAgent={openAgent} generatedDocuments={generatedDocuments} preferredDocumentId={preferredDocumentId} onDocumentImported={addGeneratedDocument} />;
      case "clients": return <ClientsPage openAgent={openAgent} />;
      case "planning": return <PlanningPage openAgent={openAgent} />;
      case "crm": return <CRMPage openAgent={openAgent} createRequest={crmCreateRequest} />;
      case "numbers": return <NumbersPage openAgent={openAgent} />;
      case "brain": return <BrainPage openAgent={openAgent} />;
    }
  }, [addGeneratedDocument, crmCreateRequest, generatedDocuments, openAgent, openNewOpportunity, page, preferredDocumentId]);

  return (
    <div className={`ops-app ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      <button className={`mobile-nav-backdrop ${mobileMenuOpen ? "visible" : ""}`} aria-label="Fermer la navigation" onClick={() => setMobileMenuOpen(false)} type="button" />
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} openAgent={openAgent} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="ops-main">
        <Topbar page={page} openAgent={openAgent} onMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="ops-content">
          <div style={{ display: page === "agent" ? "contents" : "none" }}>
            <AgentPage
              initialPrompt={pendingPrompt}
              consumePrompt={consumePendingPrompt}
              onDocumentGenerated={addGeneratedDocument}
              openDocuments={openDocuments}
            />
          </div>
          {content}
        </main>
      </div>
      <SourceEvidenceDialog requested={sourceRequested} evidence={sourceEvidence} loading={sourceLoading} error={sourceError} onClose={closeSource} openAgent={openAgent} />
      <CommandMenu open={commandOpen} setOpen={setCommandOpen} setPage={setPage} openAgent={openAgent} />
    </div>
  );
}
