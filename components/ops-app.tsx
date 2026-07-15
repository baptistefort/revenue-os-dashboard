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
import { asksForPdf, buildFallbackScenario, extractPdfTopic } from "@/lib/ops-agent-engine";

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
};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("PDF illisible"));
    reader.onerror = () => reject(reader.error ?? new Error("PDF illisible"));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function createReply(id: string, lead: string, body: string[], sources: string[], followups: string[]): AgentScenario {
  return { id, label: lead, keywords: [], lead, body, sources, followups };
}

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
        {document?.dataUrl ? (
          <article className="document-artifact">
            <div className="document-artifact-icon"><OpsIcon name="document" size={22} /></div>
            <div className="document-artifact-copy">
              <span>PDF généré par OPS</span>
              <strong>{document.name}</strong>
              <small>{document.pages ?? 3} pages · {document.size ?? "—"} · {document.facts} sources reliées</small>
            </div>
            <div className="document-artifact-actions">
              <a href={document.dataUrl} target="_blank" rel="noreferrer"><OpsIcon name="folder" size={15} /> Ouvrir</a>
              <a href={document.dataUrl} download={document.name}><OpsIcon name="download" size={15} /> Télécharger</a>
              <button type="button" onClick={() => openDocuments(document.id)}>Voir dans Documents <OpsIcon name="arrow" size={14} /></button>
            </div>
          </article>
        ) : null}
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
  const [pendingPdf, setPendingPdf] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const voiceModeRef = useRef<VoiceModeHandle>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const speak = useCallback((text: string) => {
    if (voiceOpen && voiceModeRef.current) {
      voiceModeRef.current.speak(text);
      return;
    }
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\b[A-Z]{2,}-[A-Z0-9-]+\b/g, ""));
    utterance.lang = "fr-FR";
    utterance.rate = 0.98;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLocaleLowerCase().startsWith("fr"));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, [voiceOpen]);

  const submit = useCallback(async (override?: string, fromVoice = false) => {
    const prompt = (override ?? value).trim();
    if (!prompt || processing) return;
    setValue("");
    setProcessing(true);
    const userId = Date.now();
    const fallbackScenario = buildFallbackScenario(prompt);
    const shouldResolvePdf = pendingPdf || asksForPdf(prompt);
    const pdfTopic = extractPdfTopic(prompt);

    if (asksForPdf(prompt) && !pdfTopic) {
      const clarification = createReply(
        "pdf-clarification",
        "D’accord. Quel document souhaitez-vous créer ?",
        ["Vous pouvez me demander, par exemple, le rapport de direction 2026, un brief CODIR, une analyse de marge ou une stratégie à 90 jours."],
        [],
        ["Le rapport de direction 2026", "Un brief CODIR", "La stratégie à 90 jours"],
      );
      setMessages((current) => [...current, { id: userId, role: "user", prompt }, { id: userId + 1, role: "assistant", scenario: clarification }]);
      setPendingPdf(true);
      setProcessing(false);
      if (fromVoice) speak([clarification.lead, ...clarification.body].join(" "));
      return;
    }

    if (shouldResolvePdf && pdfTopic) {
      const buildingScenario = createReply(
        "pdf-building",
        `Je prépare « ${pdfTopic} » à partir de la mémoire de l’entreprise.`,
        ["Je rapproche les chiffres, les décisions, le CRM, les projets et l’acquisition, puis je relie chaque conclusion à ses sources."],
        ["FIN-SNAPSHOT-20260715", "CRM-SNAPSHOT-20260715", "STRAT-2026-Q3"],
        [],
      );
      setMessages((current) => [...current, { id: userId, role: "user", prompt }, { id: userId + 1, role: "assistant", scenario: buildingScenario, loading: true, statusText: "Construction du rapport et mise en page" }]);

      try {
        const response = await fetch("/api/documents/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: pdfTopic, topic: pdfTopic }),
        });
        if (!response.ok) throw new Error("La génération du PDF a échoué");
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        const document: OpsDocument = {
          id: response.headers.get("X-Document-Id") ?? `RAPPORT-${Date.now()}`,
          name: `${pdfTopic}.pdf`,
          type: "Rapport PDF",
          linked: "Direction",
          owner: "OPS",
          updated: "À l’instant",
          status: "Généré",
          facts: 9,
          dataUrl,
          size: formatBytes(blob.size),
          pages: Number(response.headers.get("X-Document-Pages") ?? 3),
          generated: true,
        };
        const readyScenario = createReply(
          "pdf-ready",
          `${pdfTopic} est prêt.`,
          ["Je l’ai ajouté à Documents et relié aux neuf sources utilisées. Vous pouvez l’ouvrir ou le télécharger directement ici."],
          ["STRAT-2026-Q3", "FIN-SNAPSHOT-20260715", "CRM-SNAPSHOT-20260715", "PROJET-241", "GADS-2026-07"],
          ["Résume les trois décisions", "Prépare l’email d’accompagnement", "Crée les missions du rapport"],
        );
        onDocumentGenerated(document);
        setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, scenario: readyScenario, document, loading: false } : message));
        setPendingPdf(false);
        if (fromVoice) speak(`${readyScenario.lead} ${readyScenario.body.join(" ")}`);
      } catch {
        const errorScenario = createReply("pdf-error", "Je n’ai pas pu finaliser le PDF.", ["Aucune donnée n’a été perdue. Vous pouvez relancer la génération ; le brouillon reste prêt."], [], ["Relance la génération du PDF"]);
        setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, scenario: errorScenario, loading: false } : message));
      } finally {
        setProcessing(false);
      }
      return;
    }

    setMessages((current) => [...current, { id: userId, role: "user", prompt }, { id: userId + 1, role: "assistant", scenario: fallbackScenario, loading: true, statusText: "Analyse de la mémoire de l’entreprise" }]);

    try {
      const history = messagesRef.current.slice(-8).map((message) => ({
        role: message.role,
        content: message.role === "user" ? message.prompt ?? "" : message.text ?? [message.scenario?.lead, ...(message.scenario?.body ?? [])].filter(Boolean).join("\n\n"),
      })).filter((entry) => entry.content);
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history }),
      });
      if (!response.ok || !response.body) throw new Error("agent unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, loading: false, text: "" } : message));
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        text += decoder.decode(chunk, { stream: true });
        setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, loading: false, text } : message));
      }
      if (fromVoice && text.trim()) speak(text);
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      setMessages((current) => current.map((message) => message.id === userId + 1 ? { ...message, loading: false } : message));
      if (fromVoice) speak(`${fallbackScenario.lead} ${fallbackScenario.body.join(" ")}`);
    } finally {
      setProcessing(false);
    }
  }, [onDocumentGenerated, pendingPdf, processing, speak, value]);

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
        <VoiceMode ref={voiceModeRef} open={voiceOpen} onClose={() => setVoiceOpen(false)} onSubmit={submit} busy={processing} />
      </>
    );
  }

  return (
    <>
      <div className="agent-thread-page">
        <div className="thread-toolbar"><button onClick={() => { setMessages([]); setPendingPdf(false); }}><OpsIcon name="plus" size={17} /> Nouvelle conversation</button><span>Conversation privée · données de démonstration</span><button><OpsIcon name="dots" size={18} /></button></div>
        <div className="thread-scroll" ref={scrollRef}>
          <div className="thread-content">
            {messages.map((message) => message.role === "user" ? (
              <div className="user-message" data-message-id={message.id} key={message.id}>{message.prompt}</div>
            ) : (
              <div key={message.id}>
                {message.loading ? (
                  <div className="agent-thinking"><span className="assistant-mark"><OpsIcon name="spark" size={18} /></span><div><i /><span>{message.statusText ?? "Recherche dans 7 sources"}</span></div></div>
                ) : message.scenario ? <ScenarioResponse scenario={message.scenario} text={message.text} document={message.document} openDocuments={openDocuments} onSpeak={speak} /> : null}
                {!message.loading && message.scenario && (
                  <div className="followups">{message.scenario.followups.map((followup) => <button key={followup} onClick={() => submit(followup)}>{followup}<OpsIcon name="arrow" size={13} /></button>)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="thread-composer-wrap"><FullComposer value={value} setValue={setValue} onSubmit={() => submit()} onVoice={() => setVoiceOpen(true)} processing={processing} /><p>OPS cite ses sources et demande votre validation avant toute action externe.</p></div>
      </div>
      <VoiceMode ref={voiceModeRef} open={voiceOpen} onClose={() => setVoiceOpen(false)} onSubmit={submit} busy={processing} />
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
        <aside className="document-inspector"><header><span className="doc-preview-icon"><OpsIcon name="document" size={28} /></span><button><OpsIcon name="dots" size={17} /></button></header><span className="eyebrow">{selected.id} · {selected.type}</span><h2>{selected.name}</h2><p>Lié à <strong>{selected.linked}</strong> · mis à jour par {selected.owner}</p>{selected.dataUrl ? <object className="pdf-preview" data={selected.dataUrl} type="application/pdf" aria-label={`Aperçu de ${selected.name}`}><a href={selected.dataUrl} target="_blank" rel="noreferrer">Ouvrir le PDF</a></object> : <div className="doc-preview-lines"><i /><i /><i /><i /><i /></div>}<div className="doc-insight"><span><OpsIcon name="spark" size={15} /> Ce qu’OPS en retient</span><strong>{selected.facts} faits exploitables</strong><p>Montants, dates, engagements, personnes et relations ont été reliés au dossier concerné.</p>{selected.dataUrl ? <a className="document-download" href={selected.dataUrl} download={selected.name}><OpsIcon name="download" size={15} /> Télécharger le PDF</a> : null}<button onClick={() => openAgent(`Résume et analyse ${selected.name}`)}>Interroger ce document <OpsIcon name="arrow" size={14} /></button></div><SourceChips sources={[selected.id, selected.linked]} /></aside>
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
      const next = [document, ...current.filter((item) => item.id !== document.id)];
      try { window.localStorage.setItem("ops-generated-documents-v1", JSON.stringify(next.slice(0, 6))); } catch { /* Le chat reste fonctionnel même si le stockage est saturé. */ }
      return next;
    });
    setPreferredDocumentId(document.id);
  }, []);

  const openDocuments = useCallback((documentId?: string) => {
    if (documentId) setPreferredDocumentId(documentId);
    setPage("documents");
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ops-generated-documents-v1");
      if (stored) setGeneratedDocuments(JSON.parse(stored) as OpsDocument[]);
    } catch { /* La démonstration repart simplement sans documents générés. */ }
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
      case "agent": return <AgentPage initialPrompt={pendingPrompt} consumePrompt={consumePendingPrompt} onDocumentGenerated={addGeneratedDocument} openDocuments={openDocuments} />;
      case "cycle": return <CyclePage openAgent={openAgent} />;
      case "emails": return <EmailsPage openAgent={openAgent} />;
      case "documents": return <DocumentsPage openAgent={openAgent} generatedDocuments={generatedDocuments} preferredDocumentId={preferredDocumentId} />;
      case "clients": return <ClientsPage openAgent={openAgent} />;
      case "planning": return <PlanningPage openAgent={openAgent} />;
      case "crm": return <CRMPage openAgent={openAgent} />;
      case "numbers": return <NumbersPage openAgent={openAgent} />;
      case "brain": return <BrainPage openAgent={openAgent} />;
    }
  }, [addGeneratedDocument, consumePendingPrompt, generatedDocuments, openAgent, openDocuments, page, pendingPrompt, preferredDocumentId]);

  return (
    <div className={`ops-app ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="ops-main">
        <Topbar page={page} openAgent={openAgent} />
        <main className="ops-content">{content}</main>
      </div>
      <CommandMenu open={commandOpen} setOpen={setCommandOpen} setPage={setPage} openAgent={openAgent} />
      <div className="demo-watermark">Données de démonstration</div>
    </div>
  );
}
