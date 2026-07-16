"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { OpsDocumentPlan, StoredOpsDocument } from "@/lib/ops-document";
import {
  playStreamingAudioResponse,
  type StreamingAudioPlayback,
} from "@/lib/streaming-audio";

type OpenAgent = (prompt?: string) => void;

function Logo() {
  return <div className="ops-wordmark" aria-label="OPS">OPS<span>°</span></div>;
}

function IconTile({ name, active = false }: { name: IconName; active?: boolean }) {
  return <span className={`nav-icon ${active ? "active" : ""}`}><OpsIcon name={name} size={20} strokeWidth={1.65} /></span>;
}

function Sidebar({ page, setPage, collapsed, setCollapsed }: {
  page: PageId;
  setPage: (page: PageId) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}) {
  return (
    <aside className={`ops-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        <Logo />
        <button className="sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Réduire la navigation">
          <span /><span />
        </button>
      </div>
      <button className="workspace-card">
        <span className="workspace-monogram">{company.initials}</span>
        <span className="workspace-copy"><strong>{company.name}</strong><small>{company.trade}</small></span>
        <OpsIcon name="chevron" size={14} />
      </button>
      <button className="sidebar-search" onClick={() => document.dispatchEvent(new CustomEvent("ops-command"))}>
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
                onClick={() => setPage(item.id)}
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
        <button className="sidebar-user">
          <span className="user-avatar">MD</span>
          <span><strong>Marie Delmas</strong><small>Direction</small></span>
          <OpsIcon name="dots" size={16} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ page, openAgent }: { page: PageId; openAgent: OpenAgent }) {
  return (
    <header className="ops-topbar">
      <div className="topbar-location"><span>OPS</span><i>/</i><strong>{pageMeta[page].title}</strong></div>
      <div className="topbar-actions">
        <button className="topbar-search" onClick={() => document.dispatchEvent(new CustomEvent("ops-command"))}>
          <OpsIcon name="search" size={15} /><span>Rechercher ou commander</span><kbd>⌘ K</kbd>
        </button>
        <span className="sync-status"><i /> {company.synced}</span>
        <button className="validation-button" onClick={() => openAgent("Que dois-je valider aujourd’hui ?")}>2 validations</button>
        <button className="topbar-avatar">MD</button>
      </div>
    </header>
  );
}

function PageHeading({ page, action }: { page: PageId; action?: React.ReactNode }) {
  const meta = pageMeta[page];
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>
      {action}
    </div>
  );
}

function SourceChips({ sources }: { sources: string[] }) {
  return <div className="source-chips">{sources.map((source) => <button key={source}><OpsIcon name="link" size={12} />{source}</button>)}</div>;
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

function TodayPage({ setPage, openAgent }: { setPage: (page: PageId) => void; openAgent: OpenAgent }) {
  return (
    <div className="content-page today-page">
      <PageHeading page="today" action={<button className="primary-button" onClick={() => openAgent()}><OpsIcon name="spark" size={16} /> Parler à OPS</button>} />
      <MiniComposer openAgent={openAgent} />
      <section className="kpi-row">
        {kpis.map((kpi) => (
          <button key={kpi.label} onClick={() => setPage(kpi.page)} className="kpi-card">
            <span>{kpi.label}</span><strong>{kpi.value}</strong><small className={kpi.tone}>{kpi.delta}</small><i><b style={{ width: kpi.label === "Marge moyenne" ? "41%" : "72%" }} /></i>
          </button>
        ))}
      </section>
      <div className="today-grid">
        <section className="panel attention-panel">
          <div className="panel-title"><div><span>Ce qui demande attention</span><small>Priorisé par impact</small></div><button><OpsIcon name="filter" size={15} /> Filtrer</button></div>
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
            <div className="panel-title"><div><span>Missions actives</span><small>3 en cours</small></div><button>Tout voir</button></div>
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
  const content = [answer, sources, document].filter(Boolean).join("\n\n");
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

function storedDocumentToUi(document: StoredOpsDocument): OpsDocument {
  return {
    ...document,
    objectUrl: document.url,
  };
}

async function generatePdfDocument(plan: OpsDocumentPlan): Promise<OpsDocument> {
  const response = await fetch("/api/documents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
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
  | { type: "meta"; scenario: AgentScenario; mode?: string; document?: OpsDocumentPlan }
  | { type: "progress"; stage: string; label: string; detail?: string; etaMs?: number }
  | { type: "delta"; delta: string }
  | { type: "replace"; text: string }
  | { type: "speech"; text: string }
  | { type: "error"; message: string; retryable?: boolean }
  | { type: "done" };

function FullComposer({ value, setValue, onSubmit, onVoice, processing, centered = false }: {
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  onVoice: () => void;
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
        <div><button aria-label="Joindre"><OpsIcon name="plus" size={23} /></button><span className="context-select">Toute l’entreprise <OpsIcon name="chevron" size={13} /></span></div>
        <div><button type="button" aria-label="Démarrer une conversation vocale" onClick={onVoice}><OpsIcon name="microphone" size={21} /></button><button type="button" className="voice-button" onClick={onSubmit} aria-label={processing ? "Interrompre" : "Envoyer"}>{processing ? <span className="stop-square" /> : <OpsIcon name="send" size={20} />}</button></div>
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

function ScenarioResponse({ scenario, text, document, openDocuments, onSpeak }: {
  scenario: AgentScenario;
  text?: string;
  document?: OpsDocument;
  openDocuments: (documentId?: string) => void;
  onSpeak: (text: string) => void;
}) {
  const body = text ? text.split(/\n{2,}/).filter(Boolean) : scenario.body;
  const answerText = [scenario.lead, ...body].filter(Boolean).join("\n\n");
  return (
    <div className="assistant-answer">
      <div className="assistant-mark"><OpsIcon name="spark" size={18} /></div>
      <div className="assistant-content">
        {scenario.lead ? <strong className="answer-lead">{scenario.lead}</strong> : null}
        <div className="answer-body">{body.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}</div>
        {scenario.sources.length ? <SourceChips sources={scenario.sources} /> : null}
        {scenario.artifact && (
          <article className="agent-artifact">
            <span>{scenario.artifact.kicker}</span><h3>{scenario.artifact.title}</h3>
            <div>{scenario.artifact.metrics.map((metric) => <p key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></p>)}</div>
            <footer><small><OpsIcon name="shield" size={13} /> Aucune action externe sans validation</small><button>{scenario.artifact.action}</button></footer>
          </article>
        )}
        {document ? <PdfArtifactCard document={document} openDocuments={openDocuments} /> : null}
        <div className="response-actions">
          <button type="button" onClick={() => navigator.clipboard?.writeText(answerText)}><OpsIcon name="copy" size={14} /> Copier</button>
          <button type="button"><OpsIcon name="thumb" size={14} /> Utile</button>
          <button type="button"><OpsIcon name="edit" size={14} /> Corriger</button>
          <button type="button" onClick={() => onSpeak(answerText)}><OpsIcon name="volume" size={14} /> Écouter</button>
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
    inlineSpeechGenerationRef.current += 1;
    inlineSpeechRequestRef.current?.abort();
    inlineSpeechPlaybackRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  const submit = useCallback(async (override?: string, fromVoice = false) => {
    const prompt = (override ?? value).trim();
    if (!prompt || processing) return;
    setValue("");
    setProcessing(true);
    const userId = Date.now();
    const priorHistory = buildConversationHistory(messagesRef.current);
    const pendingScenario = emptyAgentScenario(prompt);

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
          setMessages((current) => current.map((message) => message.id === userId + 1
            ? { ...message, scenario: serverScenario, loading: !text.trim(), text }
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
          text = `${text}${text ? "\n\n" : ""}${event.message}`;
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
          const document = await generatePdfDocument(documentPlan);
          onDocumentGenerated(document);
          setMessages((current) => current.map((message) => message.id === userId + 1 ? {
            ...message,
            scenario: serverScenario,
            text,
            document,
            loading: false,
            progressKind: undefined,
            progressStartedAt: undefined,
            progressStage: undefined,
            progressLabel: undefined,
            progressDetail: undefined,
            progressEtaMs: undefined,
            progressUpdatedAt: undefined,
          } : message));
        } catch {
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
      setProcessing(false);
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
            <FullComposer value={value} setValue={setValue} onSubmit={() => submit()} onVoice={() => setVoiceOpen(true)} processing={processing} centered />
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
        <div className="thread-toolbar"><button onClick={() => { setMessages([]); conversationIdRef.current = createConversationId(); resetOpenCodeSessionRef.current = true; }}><OpsIcon name="plus" size={17} /> Nouvelle conversation</button><span>Conversation privée · données de démonstration</span><button><OpsIcon name="dots" size={18} /></button></div>
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
                {!message.loading && message.scenario ? <ScenarioResponse scenario={message.scenario} text={message.text} document={message.document} openDocuments={openDocuments} onSpeak={speak} /> : null}
                {!message.loading && !message.progressKind && message.scenario && (
                  <div className="followups">{message.scenario.followups.map((followup) => <button key={followup} onClick={() => submit(followup)}>{followup}<OpsIcon name="arrow" size={13} /></button>)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="thread-composer-wrap"><FullComposer value={value} setValue={setValue} onSubmit={() => submit()} onVoice={() => setVoiceOpen(true)} processing={processing} /><p>OPS cite ses sources et demande votre validation avant toute action externe.</p></div>
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

function CyclePage({ openAgent }: { openAgent: OpenAgent }) {
  return (
    <div className="content-page">
      <PageHeading page="cycle" action={<button className="primary-button" onClick={() => openAgent("Quels dossiers risquent de se bloquer cette semaine ?")}><OpsIcon name="spark" size={16} /> Analyser le cycle</button>} />
      <section className="cycle-ribbon">
        {cycleStages.map((stage, index) => <button key={stage.label}><span>0{index + 1}</span><strong>{stage.label}</strong><em>{stage.count} dossiers</em><b>{stage.value}</b><i style={{ width: `${stage.progress}%` }} /></button>)}
      </section>
      <section className="panel data-panel">
        <div className="panel-title"><div><span>Dossiers en mouvement</span><small>14 changements depuis hier</small></div><div className="table-actions"><button><OpsIcon name="filter" size={15} /> Filtrer</button><button><OpsIcon name="plus" size={15} /> Nouveau</button></div></div>
        <div className="entity-table cycle-table">
          <div className="table-head"><span>Dossier</span><span>Étape</span><span>Responsable</span><span>Montant</span><span>Prochaine action</span><span>Risque</span></div>
          {opportunities.map((opportunity) => <button className="table-row" key={opportunity.id} onClick={() => openAgent(`Résume le dossier ${opportunity.name}`)}><span><strong>{opportunity.name}</strong><small>{opportunity.id} · {opportunity.source}</small></span><span><i className="stage-dot" />{opportunity.stage}</span><span>{opportunity.owner}</span><span><strong>{(opportunity.amount / 1000).toLocaleString("fr-FR")} K€</strong></span><span>{opportunity.next}</span><span className={opportunity.probability > 70 ? "risk-low" : "risk-mid"}>{opportunity.probability > 70 ? "Faible" : "À suivre"}</span></button>)}
        </div>
      </section>
    </div>
  );
}

function EmailsPage({ openAgent }: { openAgent: OpenAgent }) {
  const [selected, setSelected] = useState(emailThreads[0]);
  return (
    <div className="content-page wide-page">
      <PageHeading page="emails" action={<button className="primary-button" onClick={() => openAgent("Quels emails demandent une réponse aujourd’hui ?")}><OpsIcon name="spark" size={16} /> Prioriser avec OPS</button>} />
      <section className="mail-shell">
        <aside className="mail-folders"><button className="compose-mail"><OpsIcon name="plus" size={16} /> Nouveau message</button><span>Boîtes</span>{["À traiter · 7", "Prioritaires · 3", "En attente · 5", "Envoyés", "Tous les emails"].map((item, index) => <button className={index === 0 ? "active" : ""} key={item}><OpsIcon name={index === 0 ? "mail" : index === 1 ? "target" : "document"} size={16} />{item}</button>)}<span>Classification OPS</span>{["Positif · 3", "Question · 2", "Plus tard · 4", "Opposition · 0"].map((item) => <button key={item}><i />{item}</button>)}</aside>
        <div className="mail-list"><div className="mail-list-head"><strong>À traiter</strong><button><OpsIcon name="filter" size={15} /></button></div>{emailThreads.map((thread) => <button key={thread.id} onClick={() => setSelected(thread)} className={`mail-thread ${selected.id === thread.id ? "active" : ""}`}><span className="contact-avatar">{thread.sender.split(" ").map((part) => part[0]).join("")}</span><span><strong>{thread.sender}</strong><small>{thread.company}</small><b>{thread.subject}</b><p>{thread.preview}</p><em>{thread.tag}</em></span><time>{thread.time}</time>{thread.unread && <i className="unread-dot" />}</button>)}</div>
        <article className="mail-reader"><header><div><span>{selected.tag}</span><h2>{selected.subject}</h2><p>{selected.sender} · {selected.company}</p></div><div><button><OpsIcon name="dots" size={17} /></button><button><OpsIcon name="arrow" size={17} /></button></div></header><div className="mail-ai-summary"><span><OpsIcon name="spark" size={15} /> Résumé OPS</span><p>Le client confirme le traitement interne de la facture. Aucun litige n’est mentionné. Une réponse courte est recommandée pour confirmer le suivi sans créer de tension.</p><SourceChips sources={[selected.linked, selected.id]} /></div><div className="mail-body"><p>Bonjour Marie,</p><p>Nous avons bien reçu votre message et faisons le nécessaire avec notre service comptable. Le règlement devrait être traité cette semaine.</p><p>Je reviens vers vous dès que le virement est confirmé.</p><p>Bien à vous,<br />{selected.sender}</p></div><div className="draft-box"><span><OpsIcon name="spark" size={14} /> Brouillon préparé</span><p>Bonjour {selected.sender.split(" ")[0]}, merci pour votre retour. Je note le traitement cette semaine et reste disponible si votre service comptable a besoin d’un duplicata.</p><footer><small>Ton : cordial · aucune pression</small><button onClick={() => openAgent(`Améliore le brouillon pour ${selected.sender}`)}>Modifier avec OPS</button><button className="dark">Valider</button></footer></div></article>
      </section>
    </div>
  );
}

function DocumentsPage({ openAgent, generatedDocuments, preferredDocumentId }: {
  openAgent: OpenAgent;
  generatedDocuments: OpsDocument[];
  preferredDocumentId?: string;
}) {
  const allDocuments = useMemo(() => [...generatedDocuments, ...documents], [generatedDocuments]);
  const [selectedId, setSelectedId] = useState(preferredDocumentId ?? allDocuments[0].id);
  const selected = allDocuments.find((document) => document.id === selectedId) ?? allDocuments[0];

  useEffect(() => {
    if (preferredDocumentId && allDocuments.some((document) => document.id === preferredDocumentId)) setSelectedId(preferredDocumentId);
  }, [allDocuments, preferredDocumentId]);

  return (
    <div className="content-page">
      <PageHeading page="documents" action={<button className="primary-button"><OpsIcon name="plus" size={16} /> Importer</button>} />
      <div className="documents-layout">
        <section className="panel documents-panel"><div className="panel-title"><div><span>{286 + generatedDocuments.length} documents</span><small>{17 + generatedDocuments.length} ajoutés cette semaine</small></div><div className="table-actions"><button><OpsIcon name="search" size={15} /> Rechercher</button><button><OpsIcon name="filter" size={15} /> Filtrer</button></div></div><div className="entity-table documents-table"><div className="table-head"><span>Document</span><span>Type</span><span>Lié à</span><span>Responsable</span><span>Mise à jour</span><span>État OPS</span></div>{allDocuments.map((document) => <button className={`table-row ${selected.id === document.id ? "selected" : ""}`} onClick={() => setSelectedId(document.id)} key={document.id}><span><i className="doc-type"><OpsIcon name={document.generated ? "download" : "document"} size={16} /></i><span><strong>{document.name}</strong><small>{document.id}</small></span></span><span>{document.type}</span><span>{document.linked}</span><span>{document.owner}</span><span>{document.updated}</span><span className={`doc-status status-${document.status.toLocaleLowerCase("fr").replace("à ", "").replaceAll(" ", "-")}`}>{document.status}</span></button>)}</div></section>
        <aside className="document-inspector"><header><span className="doc-preview-icon"><OpsIcon name="document" size={28} /></span><button><OpsIcon name="dots" size={17} /></button></header><span className="eyebrow">{selected.id} · {selected.type}</span><h2>{selected.name}</h2><p>Lié à <strong>{selected.linked}</strong> · mis à jour par {selected.owner}</p>{selected.url || selected.objectUrl || selected.dataUrl ? <object className="pdf-preview" data={selected.url ?? selected.objectUrl ?? selected.dataUrl} type="application/pdf" aria-label={`Aperçu de ${selected.name}`}><a href={selected.url ?? selected.objectUrl ?? selected.dataUrl} target="_blank" rel="noreferrer">Ouvrir le PDF</a></object> : <div className="doc-preview-lines"><i /><i /><i /><i /><i /></div>}<div className="doc-insight"><span><OpsIcon name="spark" size={15} /> Ce qu’OPS en retient</span><strong>{selected.facts} faits exploitables</strong><p>Montants, dates, engagements, personnes et relations ont été reliés au dossier concerné.</p>{selected.url || selected.objectUrl || selected.dataUrl ? <a className="document-download" href={selected.downloadUrl ?? selected.url ?? selected.objectUrl ?? selected.dataUrl} download={selected.name}><OpsIcon name="download" size={15} /> Télécharger le PDF</a> : null}<button onClick={() => openAgent(`Résume et analyse ${selected.name}`)}>Interroger ce document <OpsIcon name="arrow" size={14} /></button></div><SourceChips sources={[selected.id, selected.linked]} /></aside>
      </div>
    </div>
  );
}

function ClientsPage({ openAgent }: { openAgent: OpenAgent }) {
  const [selected, setSelected] = useState(clients[0]);
  return (
    <div className="content-page">
      <PageHeading page="clients" action={<button className="primary-button"><OpsIcon name="plus" size={16} /> Nouveau client</button>} />
      <div className="clients-layout"><section className="panel clients-panel"><div className="panel-title"><div><span>126 clients & prospects</span><small>Portefeuille actualisé aujourd’hui</small></div><div className="table-actions"><button><OpsIcon name="search" size={15} /> Rechercher</button><button><OpsIcon name="filter" size={15} /> Segments</button></div></div><div className="entity-table clients-table"><div className="table-head"><span>Client</span><span>Statut</span><span>CA 12 mois</span><span>Marge</span><span>Dernier échange</span><span>Santé</span></div>{clients.map((client) => <button key={client.id} className={`table-row ${selected.id === client.id ? "selected" : ""}`} onClick={() => setSelected(client)}><span><i className="client-avatar">{client.initials}</i><span><strong>{client.name}</strong><small>{client.id} · {client.owner}</small></span></span><span>{client.status}</span><span><strong>{client.revenue}</strong></span><span>{client.margin}</span><span>{client.last}</span><span><i className="health-bar"><b style={{ width: `${client.health}%` }} /></i>{client.health}</span></button>)}</div></section><aside className="client-inspector"><header><span className="large-client-avatar">{selected.initials}</span><button><OpsIcon name="dots" size={17} /></button></header><span className="eyebrow">{selected.id} · {selected.status}</span><h2>{selected.name}</h2><p>Compte suivi par {selected.owner}</p><button className="primary-button full" onClick={() => openAgent(`Résume-moi le compte ${selected.name} avant mon appel`)}><OpsIcon name="spark" size={15} /> Demander à OPS</button><div className="client-summary"><span>Résumé OPS</span><p>{selected.name} représente {selected.revenue} sur 12 mois, avec une marge de {selected.margin}. La prochaine action identifiée est : {selected.opportunity}.</p></div><div className="client-numbers"><div><span>CA 12 mois</span><strong>{selected.revenue}</strong></div><div><span>Marge</span><strong>{selected.margin}</strong></div><div><span>Santé</span><strong>{selected.health}/100</strong></div></div><div className="client-timeline"><span>Derniers événements</span><p><i />Aujourd’hui · Données synchronisées</p><p><i />{selected.last} · Dernière interaction</p><p><i />90 j · Revue de compte OPS</p></div></aside></div>
    </div>
  );
}

function PlanningPage({ openAgent }: { openAgent: OpenAgent }) {
  return <div className="content-page"><PageHeading page="planning" action={<button className="primary-button" onClick={() => openAgent("Quels conflits de planning dois-je résoudre ?")}><OpsIcon name="spark" size={16} /> Optimiser avec OPS</button>} /><div className="planning-summary"><div><span>Charge atelier</span><strong>86 %</strong><small>+9 pts vs semaine dernière</small></div><div><span>Projets à risque</span><strong>2</strong><small>Rivoli · CNC</small></div><div><span>Capacité disponible</span><strong>4 j</strong><small>Équipe pose · vendredi</small></div><div><span>Échéances</span><strong>7</strong><small>2 sensibles cette semaine</small></div></div><section className="panel planning-panel"><div className="panel-title"><div><span>Semaine du 13 juillet</span><small>18 personnes · 7 projets</small></div><div className="week-switch"><button>‹</button><button>Aujourd’hui</button><button>›</button></div></div><div className="planning-grid"><div className="planning-corner">Projet / équipe</div>{planningDays.map((day, index) => <div className={`planning-day ${index === 2 ? "today" : ""}`} key={day}>{day}<small>{index === 2 ? "Aujourd’hui" : ""}</small></div>)}{planningRows.map((row) => <div className="planning-row" key={row.project}><div className="planning-project"><strong>{row.project}</strong><small>{row.owner}</small></div>{row.slots.map((active, index) => <div className={`planning-slot ${index === 2 ? "today" : ""}`} key={index}>{active ? <span className={row.tone}>{index === 2 && row.project.includes("Rivoli") ? "Contrôle qualité" : "Planifié"}</span> : null}</div>)}</div>)}</div><div className="planning-alert"><span><OpsIcon name="spark" size={17} /></span><div><strong>Risque détecté jeudi après-midi</strong><p>Thomas est affecté simultanément à Rivoli et à la calibration CNC. Hugo peut reprendre le contrôle qualité avec la procédure existante.</p></div><button onClick={() => openAgent("Que se passe-t-il si Thomas est absent ?")}>Examiner</button></div></section></div>;
}

function CRMPage({ openAgent }: { openAgent: OpenAgent }) {
  const stages = ["Qualification", "Découverte", "Proposition", "Négociation"];
  return <div className="content-page"><PageHeading page="crm" action={<div className="heading-actions"><button className="soft-button"><OpsIcon name="filter" size={15} /> Filtres</button><button className="primary-button"><OpsIcon name="plus" size={16} /> Opportunité</button></div>} /><div className="crm-topline"><div><span>Pipeline ouvert</span><strong>184 K€</strong><small>+12 % ce mois</small></div><div><span>Prévision équipe</span><strong>96 K€</strong><small>OPS prévoit 88 K€</small></div><div><span>Taux de transformation</span><strong>31 %</strong><small>+4 pts sur 90 jours</small></div><button onClick={() => openAgent("Quelle opportunité faut-il prioriser ?")}><OpsIcon name="spark" size={16} /> Quelle affaire prioriser ?</button></div><section className="kanban-board">{stages.map((stage) => { const cards = opportunities.filter((item) => item.stage === stage); return <div className="kanban-column" key={stage}><header><span>{stage}</span><em>{cards.length}</em><strong>{cards.reduce((sum, item) => sum + item.amount, 0) / 1000} K€</strong></header>{cards.map((opportunity) => <article key={opportunity.id}><div><span>{opportunity.id}</span><em>{opportunity.probability} %</em></div><h3>{opportunity.name}</h3><strong>{opportunity.amount / 1000} K€</strong><p>{opportunity.next}</p><footer><span>{opportunity.owner}</span><small>{opportunity.source}</small></footer></article>)}{!cards.length && <div className="kanban-empty">Aucune affaire</div>}<button className="kanban-add"><OpsIcon name="plus" size={14} /> Ajouter</button></div>; })}</section></div>;
}

function NumbersPage({ openAgent }: { openAgent: OpenAgent }) {
  return <div className="content-page"><PageHeading page="numbers" action={<button className="primary-button" onClick={() => openAgent("Où en sommes-nous sur la stratégie du trimestre ?")}><OpsIcon name="spark" size={16} /> Expliquer avec OPS</button>} /><section className="number-tabs"><button className="active">Vue d’ensemble</button><button>Activité</button><button>Marge</button><button>Trésorerie</button><button>Acquisition</button><button>SEO</button></section><section className="kpi-row numbers-kpis">{kpis.map((kpi) => <div className="kpi-card" key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong><small className={kpi.tone}>{kpi.delta}</small><i><b style={{ width: kpi.label === "Marge moyenne" ? "41%" : "72%" }} /></i></div>)}</section><div className="numbers-grid"><section className="panel performance-chart"><div className="panel-title"><div><span>Activité & marge</span><small>Janvier — juillet 2026</small></div><button>Mensuel <OpsIcon name="chevron" size={13} /></button></div><div className="chart-legend"><span><i className="blue" /> Chiffre d’affaires</span><span><i className="green" /> Marge</span></div><svg viewBox="0 0 720 260" preserveAspectRatio="none"><g className="chart-grid"><line x1="0" y1="40" x2="720" y2="40"/><line x1="0" y1="100" x2="720" y2="100"/><line x1="0" y1="160" x2="720" y2="160"/><line x1="0" y1="220" x2="720" y2="220"/></g><path className="area-path" d="M0 205 C80 190 105 142 170 155 S260 120 340 130 S445 75 510 102 S620 54 720 62 L720 260 L0 260Z"/><path className="revenue-path" d="M0 205 C80 190 105 142 170 155 S260 120 340 130 S445 75 510 102 S620 54 720 62"/><path className="margin-path" d="M0 150 C90 138 130 132 190 121 S310 110 380 124 S490 136 555 144 S650 160 720 174"/><g className="chart-labels"><text x="0" y="252">Jan.</text><text x="112" y="252">Fév.</text><text x="230" y="252">Mars</text><text x="350" y="252">Avr.</text><text x="470" y="252">Mai</text><text x="590" y="252">Juin</text><text x="690" y="252">Juil.</text></g></svg><div className="chart-insight"><OpsIcon name="spark" size={15} /><span><strong>OPS observe :</strong> le CA progresse, mais la marge se dégrade depuis mai. Rivoli explique l’essentiel de l’écart.</span><button onClick={() => openAgent("Pourquoi la marge atelier baisse ?")}>Comprendre</button></div></section><section className="panel acquisition-panel"><div className="panel-title"><div><span>Acquisition</span><small>Performance multi-canal</small></div><button onClick={() => openAgent("Google Ads ou Meta : où investir ?")}>Arbitrer</button></div>{acquisitionChannels.map((channel) => <article key={channel.name}><div><i className={channel.tone} /><span><strong>{channel.name}</strong><small>Dépense · {channel.spend}</small></span><em>{channel.trend}</em></div><p><strong>{channel.result}</strong><span>{channel.label}</span></p><i className="efficiency"><b style={{ width: `${channel.efficiency}%` }} /></i></article>)}</section></div><section className="seo-strategy"><div><span className="seo-rank">07</span><p><span>Position Google</span><strong>agencement hôtel Paris</strong><small>96 clics mensuels · 4 conversions</small></p></div><div><span><OpsIcon name="spark" size={17} /> Recommandation OPS</span><p>Transformer le chantier Rivoli en étude de cas vidéo + page SEO. Un seul actif peut soutenir référencement, Ads, Instagram et prospection.</p></div><button onClick={() => openAgent("Quelle stratégie SEO prioriser ?")}>Construire la stratégie <OpsIcon name="arrow" size={14} /></button></section></div>;
}

function BrainPage({ openAgent }: { openAgent: OpenAgent }) {
  return <div className="content-page brain-page"><PageHeading page="brain" action={<button className="brain-page-action" onClick={() => openAgent("Que dois-je comprendre de l’entreprise aujourd’hui ?")}><OpsIcon name="spark" size={15} /> Interroger le Cerveau</button>} /><BrainGraph onAsk={(prompt) => openAgent(prompt)} /></div>;
}

function CommandMenu({ open, setOpen, setPage, openAgent }: { open: boolean; setOpen: (value: boolean) => void; setPage: (page: PageId) => void; openAgent: OpenAgent }) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const pages = navGroups.flatMap((group) => group.items).filter((item) => item.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  return <div className="command-backdrop" onMouseDown={() => setOpen(false)}><div className="command-menu" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><OpsIcon name="search" size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une page, un client ou poser une question…" /><kbd>Échap</kbd></div><span className="command-label">Navigation</span>{pages.map((item) => <button key={item.id} onClick={() => { setPage(item.id); setOpen(false); }}><IconTile name={item.icon} /><span>{item.label}</span><small>Ouvrir</small><OpsIcon name="arrow" size={14} /></button>)}<span className="command-label">Demander à OPS</span>{agentScenarios.slice(0, 3).map((scenario) => <button key={scenario.id} onClick={() => { openAgent(scenario.label); setOpen(false); }}><IconTile name="spark" /><span>{scenario.label}</span><small>Question</small><OpsIcon name="arrow" size={14} /></button>)}</div></div>;
}

export function OpsApp() {
  const [page, setPage] = useState<PageId>("agent");
  const [collapsed, setCollapsed] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [generatedDocuments, setGeneratedDocuments] = useState<OpsDocument[]>([]);
  const [preferredDocumentId, setPreferredDocumentId] = useState<string>();

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

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/documents", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return [];
        const payload = await response.json() as { documents?: StoredOpsDocument[] };
        return (payload.documents ?? []).map(storedDocumentToUi);
      })
      .then((items) => {
        if (!controller.signal.aborted) setGeneratedDocuments(items);
      })
      .catch(() => {
        // L’agent reste disponible même si l’index des documents est momentanément indisponible.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); }
      if (event.key === "Escape") setCommandOpen(false);
    };
    const handleCommand = () => setCommandOpen(true);
    window.addEventListener("keydown", handleKey);
    document.addEventListener("ops-command", handleCommand);
    return () => { window.removeEventListener("keydown", handleKey); document.removeEventListener("ops-command", handleCommand); };
  }, []);

  const content = useMemo(() => {
    switch (page) {
      case "today": return <TodayPage setPage={setPage} openAgent={openAgent} />;
      case "agent": return null;
      case "cycle": return <CyclePage openAgent={openAgent} />;
      case "emails": return <EmailsPage openAgent={openAgent} />;
      case "documents": return <DocumentsPage openAgent={openAgent} generatedDocuments={generatedDocuments} preferredDocumentId={preferredDocumentId} />;
      case "clients": return <ClientsPage openAgent={openAgent} />;
      case "planning": return <PlanningPage openAgent={openAgent} />;
      case "crm": return <CRMPage openAgent={openAgent} />;
      case "numbers": return <NumbersPage openAgent={openAgent} />;
      case "brain": return <BrainPage openAgent={openAgent} />;
    }
  }, [generatedDocuments, openAgent, page, preferredDocumentId]);

  return (
    <div className={`ops-app ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="ops-main">
        <Topbar page={page} openAgent={openAgent} />
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
      <CommandMenu open={commandOpen} setOpen={setCommandOpen} setPage={setPage} openAgent={openAgent} />
      <div className="demo-watermark">Données de démonstration</div>
    </div>
  );
}
