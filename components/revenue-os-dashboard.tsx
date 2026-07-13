"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Home,
  Inbox,
  Layers3,
  Linkedin,
  List,
  Mail,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Pause,
  PenLine,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  campaigns,
  crmOpportunities,
  inboxThreads,
  leads,
  linkedInPosts,
  missions,
  weeklyActivity,
  type PageId,
} from "@/lib/mock-data";

type DemoAction = (message: string) => void;

const navItems: Array<{ id: PageId; label: string; icon: LucideIcon; badge?: number }> = [
  { id: "overview", label: "Cockpit IA", icon: Home },
  { id: "missions", label: "Missions", icon: Layers3, badge: 3 },
  { id: "leads", label: "Lead Finder", icon: Search },
  { id: "crm", label: "CRM", icon: Database },
  { id: "campaigns", label: "Campagnes", icon: Mail },
  { id: "inbox", label: "Inbox", icon: Inbox, badge: 7 },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
];

const pageTitles: Record<PageId, { label: string; meta: string }> = {
  overview: { label: "Cockpit IA", meta: "Centre de commande" },
  missions: { label: "Missions", meta: "Objectifs, plans et exécution" },
  leads: { label: "Lead Finder", meta: "Recherche multi-source" },
  crm: { label: "CRM conversationnel", meta: "Interroger votre historique" },
  campaigns: { label: "Campagnes email", meta: "Préparation et supervision" },
  inbox: { label: "Inbox unifiée", meta: "Réponses et signaux entrants" },
  linkedin: { label: "LinkedIn Studio", meta: "Contenu et prospection assistée" },
};

function LogoMark() {
  return (
    <div className="logo-mark" aria-label="Revenue OS">
      <span />
      <span />
      <span />
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "dark" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function SourceBadge({ children }: { children: React.ReactNode }) {
  return <span className="source-badge">{children}</span>;
}

function SectionHeader({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <span className="eyebrow">{title}</span>
        {meta && <span className="section-meta">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

function MiniTrend() {
  const max = Math.max(...weeklyActivity);
  const points = weeklyActivity
    .map((value, index) => `${(index / (weeklyActivity.length - 1)) * 100},${44 - (value / max) * 38}`)
    .join(" ");

  return (
    <svg className="mini-trend" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M0,48 L${points} L100,48 Z`} className="trend-fill" />
      <polyline points={points} className="trend-line" />
    </svg>
  );
}

function Rail({ page, setPage, onMenu }: { page: PageId; setPage: (page: PageId) => void; onMenu: () => void }) {
  return (
    <>
      <aside className="rail">
        <button className="rail-logo" onClick={() => setPage("overview")} title="Revenue OS">
          <LogoMark />
        </button>
        <nav className="rail-nav" aria-label="Navigation principale">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`rail-button ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
                title={item.label}
                aria-label={item.label}
              >
                <Icon size={16} strokeWidth={1.7} />
                {item.badge ? <span className="rail-badge">{item.badge}</span> : null}
                <span className="rail-tooltip">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="rail-bottom">
          <button className="rail-button" title="Paramètres" aria-label="Paramètres" onClick={onMenu}>
            <Settings size={16} strokeWidth={1.7} />
            <span className="rail-tooltip">Paramètres</span>
          </button>
          <button className="avatar-button" title="Compte Atelier Nord">AN</button>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
              <Icon size={18} strokeWidth={1.7} />
              <span>{item.label.replace("Cockpit IA", "Accueil").replace("Lead Finder", "Leads")}</span>
            </button>
          );
        })}
        <button onClick={onMenu}>
          <Menu size={18} strokeWidth={1.7} />
          <span>Plus</span>
        </button>
      </nav>
    </>
  );
}

function TopBar({ page, onSearch, onDemo }: { page: PageId; onSearch: () => void; onDemo: DemoAction }) {
  return (
    <header className="topbar">
      <div className="topbar-page">
        <strong>{pageTitles[page].label}</strong>
        <span>{pageTitles[page].meta}</span>
      </div>
      <div className="topbar-actions">
        <button className="workspace-switcher" onClick={() => onDemo("Le changement d’espace sera disponible après connexion du CRM.")}> 
          <span className="workspace-dot">AN</span>
          <span>Atelier Nord</span>
          <ChevronDown size={13} />
        </button>
        <button className="global-search" onClick={onSearch}>
          <Search size={14} />
          <span>Rechercher ou commander</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="demo-badge"><span /> Démo · aucune connexion</div>
        <button className="credit-chip" onClick={() => onDemo("Budget simulé : aucune consommation réelle.")}> 
          <WalletCards size={14} />
          <span>42,80 € / 150 €</span>
        </button>
        <button className="icon-button" onClick={() => onDemo("5 validations attendent votre décision.")} aria-label="Notifications">
          <Bell size={15} />
          <i />
        </button>
      </div>
    </header>
  );
}

function AgentComposer({
  compact = false,
  onOpen,
  defaultValue = "",
}: {
  compact?: boolean;
  onOpen: (value: string) => void;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const submit = () => {
    if (!value.trim()) return;
    onOpen(value.trim());
  };

  return (
    <div className={`agent-composer ${compact ? "compact" : ""}`}>
      {!compact && (
        <div className="composer-topline">
          <div className="agent-identity"><span className="agent-orb"><Sparkles size={15} /></span> Agent Revenue</div>
          <span className="context-chip">Contexte · Atelier Nord</span>
        </div>
      )}
      <textarea
        aria-label="Demander à l’agent"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Confiez un objectif à l’agent…"
      />
      <div className="composer-footer">
        <div className="composer-tools">
          <button title="Ajouter un contexte"><Plus size={14} /></button>
          {!compact && <span>Lecture et préparation automatiques · action externe sur validation</span>}
        </div>
        <button className="send-button" onClick={submit} aria-label="Envoyer à l’agent"><ArrowUpRight size={17} /></button>
      </div>
    </div>
  );
}

function KpiStrip() {
  const kpis = [
    { label: "Pipeline influencé", value: "184 k€", delta: "+22%", icon: CircleDollarSign },
    { label: "Leads qualifiés", value: "91", delta: "+37", icon: Target },
    { label: "Réponses positives", value: "7", delta: "7,7%", icon: MessageCircle },
    { label: "Rendez-vous", value: "12", delta: "+4", icon: CalendarDays },
    { label: "Missions actives", value: "3", delta: "1 à valider", icon: Activity },
  ];
  return (
    <div className="kpi-strip">
      {kpis.map((kpi, index) => {
        const Icon = kpi.icon;
        return (
          <div className="kpi-cell" key={kpi.label}>
            <div className="kpi-label"><Icon size={13} /> {kpi.label}</div>
            <div className="kpi-value-row"><strong>{kpi.value}</strong><span>{kpi.delta}</span></div>
            {index === 0 && <MiniTrend />}
          </div>
        );
      })}
    </div>
  );
}

function OverviewPage({ openAgent, setPage, demoAction }: { openAgent: (prompt: string) => void; setPage: (page: PageId) => void; demoAction: DemoAction }) {
  const prompts = [
    { icon: Search, title: "Trouver des leads", text: "Chercher 100 entreprises selon mes critères" },
    { icon: Database, title: "Réactiver mon CRM", text: "Retrouver les meilleures opportunités dormantes" },
    { icon: Mail, title: "Préparer une campagne", text: "Créer l’audience, l’angle et la séquence" },
    { icon: Linkedin, title: "Créer du contenu", text: "Transformer ma matière en posts LinkedIn" },
  ];

  return (
    <div className="page overview-page">
      <section className="welcome-block">
        <div className="welcome-copy">
          <span className="eyebrow">Lundi 13 juillet · briefing du matin</span>
          <h1>Que voulez-vous confier<br />à votre agent commercial&nbsp;?</h1>
          <p>Décrivez un résultat. L’agent construit le plan, utilise vos sources et vous demande l’autorisation avant toute action externe.</p>
        </div>
        <AgentComposer onOpen={openAgent} defaultValue="Trouve-moi 80 entreprises industrielles en Bretagne, exclue mon CRM et utilise Apollo uniquement sur les 50 meilleurs comptes." />
        <div className="quick-prompts">
          {prompts.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <button key={prompt.title} onClick={() => openAgent(prompt.text)}>
                <span className="quick-icon"><Icon size={16} /></span>
                <span><strong>{prompt.title}</strong><small>{prompt.text}</small></span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}
        </div>
      </section>

      <KpiStrip />

      <section className="cockpit-grid">
        <div className="panel mission-focus">
          <SectionHeader title="Mission en cours" meta="MIS-028 · mise à jour il y a 2 min" action={<button className="text-action" onClick={() => setPage("missions")}>Ouvrir <ArrowRight size={13} /></button>} />
          <div className="mission-focus-body">
            <div className="mission-title-row">
              <div><StatusPill tone="success">En cours</StatusPill><h2>Trouver 80 industriels<br />en Bretagne</h2></div>
              <div className="progress-ring" style={{ "--progress": "68%" } as React.CSSProperties}><span>68<small>%</small></span></div>
            </div>
            <p>Entreprises de 20 à 200 salariés avec un signal de maintenance récent. DG et responsable maintenance recherchés.</p>
            <div className="mission-current-step">
              <span className="pulse-dot" />
              <div><small>ÉTAPE 5 SUR 8</small><strong>Enrichissement des 50 meilleurs comptes</strong><span>Apollo · 31 / 50 traités</span></div>
            </div>
            <div className="cost-row">
              <div><span>Budget consommé</span><strong>72,40 € <small>/ 150 €</small></strong></div>
              <div><span>Leads prêts</span><strong>91 <small>/ objectif 80</small></strong></div>
            </div>
          </div>
        </div>

        <div className="panel workflow-panel">
          <SectionHeader title="Chaîne de travail" meta="Traçabilité de la mission" action={<span className="live-label"><i /> En direct</span>} />
          <div className="workflow-body">
            <div className="workflow-caption"><span>Demande</span><span>Données</span><span>Décision</span><span>Activation</span></div>
            <div className="workflow-nodes">
              {[
                { label: "Serper Maps", value: "327", sub: "établissements", icon: MapPin, state: "done" },
                { label: "data.gouv", value: "189", sub: "entreprises uniques", icon: Building2, state: "done" },
                { label: "Exclusion CRM", value: "−31", sub: "déjà connus", icon: Database, state: "done" },
                { label: "Apollo", value: "50", sub: "comptes enrichis", icon: Users, state: "active" },
                { label: "Scoring IA", value: "91", sub: "leads prêts", icon: Sparkles, state: "next" },
                { label: "Campagne", value: "—", sub: "après validation", icon: Send, state: "locked" },
              ].map((node, index) => {
                const Icon = node.icon;
                return (
                  <div className={`workflow-node ${node.state}`} key={node.label}>
                    <div className="node-icon"><Icon size={15} /></div>
                    <div><small>{node.label}</small><strong>{node.value}</strong><span>{node.sub}</span></div>
                    {index < 5 && <div className="node-connector"><ChevronRight size={12} /></div>}
                  </div>
                );
              })}
            </div>
            <div className="workflow-foot">
              <div className="workflow-proof"><ShieldCheck size={15} /><span><strong>Chaque donnée reste sourcée</strong><small>5 conflits détectés · 4 résolus · 1 à vérifier</small></span></div>
              <button className="soft-button" onClick={() => setPage("leads")}>Voir les 91 leads <ArrowRight size={13} /></button>
            </div>
          </div>
        </div>

        <div className="panel attention-panel">
          <SectionHeader title="Besoin de vous" meta="5 décisions" />
          <div className="attention-list">
            <button onClick={() => setPage("campaigns")}>
              <span className="attention-icon warning"><Mail size={15} /></span>
              <span><strong>12 emails à relire</strong><small>Réactivation devis perdus</small></span>
              <ChevronRight size={14} />
            </button>
            <button onClick={() => setPage("leads")}>
              <span className="attention-icon"><Users size={15} /></span>
              <span><strong>91 leads à approuver</strong><small>4 données restent incertaines</small></span>
              <ChevronRight size={14} />
            </button>
            <button onClick={() => setPage("inbox")}>
              <span className="attention-icon danger"><MessageSquare size={15} /></span>
              <span><strong>3 réponses sensibles</strong><small>Objection prix · conformité</small></span>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="hot-reply">
            <div className="hot-reply-top"><span className="eyebrow">Réponse chaude</span><span>Il y a 12 min</span></div>
            <p>« Oui, le sujet est d’actualité. Êtes-vous disponible jeudi matin&nbsp;? »</p>
            <div><span className="mini-avatar">CL</span><span><strong>Claire Le Goff</strong><small>Armor Process · 24 k€ estimés</small></span></div>
            <button className="dark-button full" onClick={() => setPage("inbox")}>Traiter la réponse <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <section className="system-strip">
        <span className="eyebrow">État du système</span>
        <div><i className="ok" /> SERPER <small>SIMULÉ</small></div>
        <div><i className="ok" /> DATA.GOUV <small>SIMULÉ</small></div>
        <div><i className="ok" /> APOLLO <small>SIMULÉ</small></div>
        <div><i /> EMAIL <small>NON CONNECTÉ</small></div>
        <div><i /> LINKEDIN <small>MODE ASSISTÉ</small></div>
        <button onClick={() => demoAction("Les connecteurs seront configurés dans une phase ultérieure.")}>Voir les connecteurs <ArrowUpRight size={12} /></button>
      </section>
    </div>
  );
}

function MissionsPage({ demoAction }: { demoAction: DemoAction }) {
  const [selected, setSelected] = useState(missions[0]);
  const steps = [
    ["Brief compris", "Objectif, limites et budget validés", "08:42", "done"],
    ["Recherche multi-source", "327 établissements collectés", "08:48", "done"],
    ["Fusion et dédoublonnage", "138 doublons ou établissements secondaires retirés", "09:06", "done"],
    ["Exclusion du CRM", "31 comptes connus exclus", "09:12", "done"],
    ["Enrichissement", "31 des 50 meilleurs comptes traités", "En cours", "active"],
    ["Scoring et vérification", "Pertinence, signal, contact et confiance", "À venir", "next"],
    ["Rédaction", "Personnalisation à partir des preuves", "À venir", "next"],
    ["Validation et activation", "Aucun envoi sans votre accord", "Bloqué", "locked"],
  ];

  return (
    <div className="page standard-page">
      <div className="page-intro">
        <div><span className="eyebrow">Agent IA · mémoire d’exécution</span><h1>Missions</h1><p>Chaque objectif conserve son plan, son budget, ses erreurs, ses autorisations et ses résultats.</p></div>
        <button className="dark-button" onClick={() => demoAction("Le créateur de mission est prêt en démonstration, sans lancement réel.")}><Plus size={14} /> Nouvelle mission</button>
      </div>
      <div className="mission-layout">
        <aside className="mission-list panel">
          <SectionHeader title="Toutes les missions" meta="4 affichées" action={<button className="icon-plain"><Filter size={14} /></button>} />
          {missions.map((mission) => (
            <button key={mission.id} className={`mission-list-item ${selected.id === mission.id ? "selected" : ""}`} onClick={() => setSelected(mission)}>
              <div className="mission-list-top"><StatusPill tone={mission.status === "En cours" ? "success" : mission.status === "Approbation" ? "warning" : "neutral"}>{mission.status}</StatusPill><span>{mission.id}</span></div>
              <strong>{mission.title}</strong>
              <p>{mission.currentStep}</p>
              <div className="thin-progress"><span style={{ width: `${mission.progress}%` }} /></div>
              <div className="mission-list-meta"><span>{mission.progress}%</span><span>{mission.leads} comptes</span><span>{mission.budget.split(" / ")[0]}</span></div>
            </button>
          ))}
        </aside>
        <main className="mission-detail panel">
          <div className="mission-detail-head">
            <div><div className="id-row"><StatusPill tone="success">{selected.status}</StatusPill><span>{selected.id}</span><span>{selected.created}</span></div><h2>{selected.title}</h2><p>{selected.objective}</p></div>
            <div className="button-row"><button className="soft-button" onClick={() => demoAction("Mission suspendue uniquement dans la maquette.")}><Pause size={13} /> Suspendre</button><button className="dark-button" onClick={() => demoAction("Rapport de mission simulé.")}>Voir le rapport <ArrowUpRight size={13} /></button></div>
          </div>
          <div className="mission-detail-grid">
            <div className="mission-timeline">
              <SectionHeader title="Plan d’exécution" meta="8 étapes" />
              <div className="timeline-steps">
                {steps.map(([title, subtitle, time, state], index) => (
                  <div className={`timeline-step ${state}`} key={title}>
                    <div className="timeline-marker">{state === "done" ? <Check size={12} /> : index + 1}</div>
                    <div><strong>{title}</strong><p>{subtitle}</p></div><span>{time}</span>
                  </div>
                ))}
              </div>
            </div>
            <aside className="mission-audit">
              <SectionHeader title="Contrôle de mission" />
              <div className="audit-card"><span>Budget</span><strong>72,40 € <small>/ 150 €</small></strong><div className="thin-progress"><span style={{ width: "48%" }} /></div><small>48 % consommé · prévision finale 103 €</small></div>
              <div className="audit-section"><span className="eyebrow">Permissions</span><div><CheckCircle2 size={14} /><span><strong>Lire et analyser</strong><small>Autorisé automatiquement</small></span></div><div><CheckCircle2 size={14} /><span><strong>Préparer des actions</strong><small>Autorisé automatiquement</small></span></div><div className="locked"><ShieldCheck size={14} /><span><strong>Envoyer ou publier</strong><small>Validation obligatoire</small></span></div></div>
              <div className="audit-section"><span className="eyebrow">Livrables liés</span>{["L-091 · Liste qualifiée", "C-017 · Campagne brouillon", "R-032 · Réponse positive"].map((item) => <button key={item}>{item}<ArrowUpRight size={12} /></button>)}</div>
              <div className="audit-section"><span className="eyebrow">Journal récent</span><p><time>10:31</time> 3 adresses email vérifiées.</p><p><time>10:28</time> Conflit d’effectif résolu via SIRENE.</p><p><time>10:23</time> Limite Apollo appliquée à 50 comptes.</p></div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function LeadFinderPage({ demoAction }: { demoAction: DemoAction }) {
  const [view, setView] = useState<"table" | "map">("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leadDetail, setLeadDetail] = useState<(typeof leads)[number] | null>(null);
  const allSelected = selectedIds.length === leads.length;
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <div className="page standard-page lead-page">
      <div className="page-intro compact-intro">
        <div><span className="eyebrow">Mission MIS-028 · résultats simulés</span><h1>Lead Finder</h1><p>Un moteur unique pour chercher, fusionner, exclure, enrichir et expliquer chaque score.</p></div>
        <div className="button-row"><button className="soft-button"><FileText size={14} /> Importer une liste</button><button className="dark-button" onClick={() => demoAction("Une recherche réelle nécessitera les connecteurs Serper, data.gouv et Apollo.")}><Search size={14} /> Nouvelle recherche</button></div>
      </div>

      <div className="search-builder panel">
        <div className="search-builder-main"><Sparkles size={17} /><input aria-label="Requête Lead Finder" readOnly value="Entreprises industrielles en Bretagne, 20 à 200 salariés, avec un signal de maintenance récent" /><button onClick={() => demoAction("Recherche simulée : aucun crédit consommé.")}><ArrowRight size={16} /></button></div>
        <div className="understood-filters">
          <span>L’agent a compris</span>
          {[
            ["Secteur", "Industrie"], ["Zone", "Bretagne"], ["Effectif", "20–200"], ["Fonctions", "DG + Maintenance"], ["Exclusion", "CRM"], ["Volume", "80 minimum"],
          ].map(([label, value]) => <button key={label}><small>{label}</small>{value}<X size={11} /></button>)}
          <button className="add-filter"><Plus size={12} /> Filtre</button>
        </div>
        <div className="source-selector">
          <span className="eyebrow">Sources et règle de coût</span>
          <label><input type="checkbox" checked readOnly /><span><MapPin size={14} /><strong>Serper Maps</strong><small>Découverte locale · simulé</small></span></label>
          <label><input type="checkbox" checked readOnly /><span><Building2 size={14} /><strong>data.gouv / SIRENE</strong><small>Données légales · simulé</small></span></label>
          <label><input type="checkbox" checked readOnly /><span><Users size={14} /><strong>Apollo</strong><small>Contacts · top 50 seulement</small></span></label>
          <div className="cost-estimate"><span>Coût estimé</span><strong>63–89 €</strong><small>Plafond mission : 150 €</small></div>
        </div>
      </div>

      <div className="collection-pipeline panel">
        <SectionHeader title="Pipeline de collecte" meta="Dernière exécution · il y a 2 min" />
        <div className="collection-stages">
          {[
            ["Trouvés", "327", "Serper + SIRENE"], ["Fusionnés", "189", "−138 doublons"], ["Exclus CRM", "31", "déjà connus"], ["Qualifiés", "112", "selon ICP"], ["Enrichis", "50", "limite Apollo"], ["Emails valides", "96", "confiance > 85%"], ["Prêts", "91", "score final"],
          ].map(([label, value, sub], index) => <div key={label} className={index === 6 ? "final" : ""}><span>{label}</span><strong>{value}</strong><small>{sub}</small>{index < 6 && <ChevronRight size={12} />}</div>)}
        </div>
      </div>

      <div className="leads-table-panel panel">
        <div className="table-toolbar">
          <div><span className="eyebrow">Résultats qualifiés</span><strong>91 leads prêts</strong><span>sur 189 entreprises uniques</span></div>
          <div className="toolbar-actions">
            {selectedIds.length > 0 && <span className="selection-count">{selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}</span>}
            <button className="soft-button"><Filter size={13} /> Filtres</button>
            <div className="segmented"><button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><List size={13} /> Tableau</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Map size={13} /> Carte</button></div>
            <button className="dark-button" onClick={() => demoAction(`${selectedIds.length || 91} leads ajoutés à une liste simulée.`)}><Plus size={13} /> Ajouter à une liste</button>
          </div>
        </div>
        {view === "table" ? (
          <div className="data-table-wrap">
            <table className="data-table leads-table">
              <thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : leads.map((lead) => lead.id))} /></th><th>Score</th><th>Entreprise</th><th>Signal détecté</th><th>Décideur</th><th>Sources</th><th>État</th><th /></tr></thead>
              <tbody>{leads.map((lead) => (
                <tr key={lead.id} onClick={() => setLeadDetail(lead)}>
                  <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => toggle(lead.id)} /></td>
                  <td><span className={`score score-${lead.score >= 90 ? "high" : lead.score >= 80 ? "medium" : "low"}`}>{lead.score}</span></td>
                  <td><div className="company-cell"><span className="company-avatar">{lead.company.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{lead.company}</strong><small>{lead.city} · {lead.size} · {lead.revenue}</small></span></div></td>
                  <td><div className="signal-cell"><Zap size={13} /><span><strong>{lead.signal}</strong><small>{lead.age}</small></span></div></td>
                  <td><strong className="table-primary">{lead.contact}</strong><small className="table-secondary">{lead.role}</small></td>
                  <td><div className="source-stack">{lead.sources.map((source) => <SourceBadge key={source}>{source}</SourceBadge>)}</div></td>
                  <td><StatusPill tone={lead.state === "Prêt" ? "success" : lead.state === "À vérifier" ? "warning" : "neutral"}>{lead.state}</StatusPill></td>
                  <td><ChevronRight size={14} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <MockMap leads={leads} onLead={setLeadDetail} />}
      </div>

      {leadDetail && <LeadDrawer lead={leadDetail} onClose={() => setLeadDetail(null)} demoAction={demoAction} />}
    </div>
  );
}

function MockMap({ leads: leadList, onLead }: { leads: typeof leads; onLead: (lead: (typeof leads)[number]) => void }) {
  return (
    <div className="mock-map">
      <div className="map-grid" />
      <div className="map-water water-one" /><div className="map-water water-two" />
      <span className="map-city rennes">RENNES</span><span className="map-city brest">BREST</span><span className="map-city vannes">VANNES</span><span className="map-city quimper">QUIMPER</span><span className="map-city lorient">LORIENT</span>
      {leadList.map((lead, index) => <button key={lead.id} style={{ left: `${16 + ((index * 17) % 70)}%`, top: `${18 + ((index * 19) % 58)}%` }} onClick={() => onLead(lead)}><span>{lead.score}</span><small>{lead.company}</small></button>)}
      <div className="map-legend"><span><i className="high" /> Score 90+</span><span><i className="medium" /> Score 80–89</span><span><i /> Score &lt;80</span></div>
    </div>
  );
}

function LeadDrawer({ lead, onClose, demoAction }: { lead: (typeof leads)[number]; onClose: () => void; demoAction: DemoAction }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><span className="eyebrow">Entreprise 360 · {lead.id}</span><h2>{lead.company}</h2><p><MapPin size={12} /> {lead.city} · {lead.naf}</p></div><button className="close-button" onClick={onClose}><X size={16} /></button></div>
        <div className="drawer-score"><div className="large-score">{lead.score}<small>/100</small></div><div><StatusPill tone="success">Très pertinent</StatusPill><p>Score calculé sur la correspondance ICP, la fraîcheur du signal, le bon interlocuteur et la confiance des données.</p></div></div>
        <div className="drawer-section"><SectionHeader title="Pourquoi ce score" /><div className="reason-grid"><div><CheckCircle2 size={14} /><span><strong>ICP · 29/30</strong><small>{lead.size} · NAF {lead.naf}</small></span></div><div><Zap size={14} /><span><strong>Signal · 28/30</strong><small>{lead.signal}</small></span></div><div><UserRound size={14} /><span><strong>Contact · 22/25</strong><small>{lead.role} identifié</small></span></div><div><ShieldCheck size={14} /><span><strong>Confiance · 15/15</strong><small>3 sources concordantes</small></span></div></div></div>
        <div className="drawer-section"><SectionHeader title="Décideur recommandé" action={<SourceBadge>Apollo · simulé</SourceBadge>} /><div className="contact-card"><span className="mini-avatar">{lead.contact.split(" ").map((word) => word[0]).join("")}</span><div><strong>{lead.contact}</strong><span>{lead.role}</span><small>{lead.email}</small></div><button onClick={() => demoAction("Adresse copiée dans la maquette.")}><Copy size={13} /></button></div></div>
        <div className="drawer-section evidence"><SectionHeader title="Preuves et provenance" />{lead.sources.map((source, index) => <button key={source}><span><SourceBadge>{source}</SourceBadge><strong>{index === 0 ? lead.signal : index === 1 ? `Effectif légal : ${lead.size}` : `Fonction de ${lead.contact} confirmée`}</strong></span><span>{index === 0 ? lead.age : "13 juil."}<ExternalLink size={11} /></span></button>)}</div>
        <div className="drawer-section"><SectionHeader title="Coût de la donnée" /><div className="cost-breakdown"><span>Recherche <strong>0,07 €</strong></span><span>Enrichissement <strong>0,61 €</strong></span><span>Vérification <strong>0,09 €</strong></span><span>Total <strong>0,77 €</strong></span></div></div>
        <div className="drawer-actions"><button className="soft-button" onClick={() => demoAction("Le compte serait exclu de cette mission.")}>Exclure</button><button className="dark-button" onClick={() => demoAction(`${lead.company} ajouté à la liste L-091 dans la maquette.`)}><Plus size={13} /> Ajouter à la liste</button></div>
      </aside>
    </div>
  );
}

function CrmPage({ demoAction }: { demoAction: DemoAction }) {
  const [query, setQuery] = useState("Quels devis supérieurs à 15 000 € avons-nous perdus pour cause de timing ?");
  const [asked, setAsked] = useState(true);
  const submit = () => { if (query.trim()) setAsked(true); };
  return (
    <div className="page standard-page crm-page">
      <div className="page-intro compact-intro"><div><span className="eyebrow">17 482 enregistrements · dernière synchro simulée</span><h1>CRM conversationnel</h1><p>Posez une question à tout votre historique. Chaque réponse cite les fiches, notes et opportunités utilisées.</p></div><div className="button-row"><button className="soft-button"><SlidersHorizontal size={13} /> Périmètre : tout le CRM</button><button className="dark-button" onClick={() => demoAction("Import CRM non connecté dans ce prototype.")}><Plus size={13} /> Importer des données</button></div></div>
      <div className="crm-layout">
        <aside className="crm-segments panel">
          <SectionHeader title="Mémoire commerciale" meta="Tous les objets" />
          {[
            [Building2, "Comptes", "2 416"], [Users, "Contacts", "6 804"], [BriefcaseBusiness, "Opportunités", "1 192"], [FileText, "Devis perdus", "384"], [Clock3, "Dormants +180 j", "216"], [CheckCircle2, "Tâches à relancer", "43"],
          ].map(([Icon, label, value], index) => {
            const SegmentIcon = Icon as LucideIcon;
            return <button key={String(label)} className={index === 3 ? "active" : ""}><SegmentIcon size={14} /><span>{String(label)}</span><strong>{String(value)}</strong></button>;
          })}
          <div className="crm-saved"><span className="eyebrow">Questions enregistrées</span><button onClick={() => setQuery("Quelles affaires n’ont pas été relancées depuis sept jours ?")}>Affaires non relancées</button><button onClick={() => setQuery("Quels clients peuvent nous introduire chez Armor Process ?")}>Introductions possibles</button><button onClick={() => setQuery("Quels devis perdus ont un nouveau signal ?")}>Signaux sur devis perdus</button></div>
        </aside>
        <main className="crm-conversation panel">
          <SectionHeader title="Parler aux données" meta="Réponses sourcées" action={<button className="text-action" onClick={() => { setQuery(""); setAsked(false); }}>Nouvelle conversation <Plus size={12} /></button>} />
          <div className="conversation-scroll">
            {asked ? (
              <>
                <div className="user-query"><span>Vous</span><p>{query || "Quels devis supérieurs à 15 000 € avons-nous perdus pour cause de timing ?"}</p></div>
                <div className="ai-answer">
                  <div className="answer-author"><span className="agent-orb"><Sparkles size={14} /></span><span><strong>Agent Revenue</strong><small>Analyse terminée · 8 sources CRM</small></span></div>
                  <h2>4 opportunités correspondent, pour un potentiel cumulé de <u>120 500 €</u>.</h2>
                  <p>Trois comptes présentent aujourd’hui un signal suffisamment fort pour justifier une réactivation. MecaOuest est prioritaire : le décideur a changé il y a 12 jours et le motif de perte était uniquement le timing.</p>
                  <div className="answer-insight"><Zap size={15} /><span><strong>Recommandation</strong><small>Réactiver les 3 premiers comptes avec un message différent selon leur signal actuel.</small></span></div>
                  <div className="inline-opportunities">
                    {crmOpportunities.map((opportunity, index) => (
                      <button key={opportunity.company}>
                        <span className={`score score-${opportunity.score >= 90 ? "high" : opportunity.score >= 80 ? "medium" : "low"}`}>{opportunity.score}</span>
                        <span><strong>{opportunity.company}</strong><small>{opportunity.contact} · perdu le {opportunity.lost}</small></span>
                        <span><strong>{opportunity.amount}</strong><small>{opportunity.signal}</small></span>
                        <SourceBadge>CRM/OPP-{241 + index}</SourceBadge>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                  <div className="answer-actions"><button className="dark-button" onClick={() => demoAction("Mission de réactivation préparée dans la maquette.")}><Sparkles size={13} /> Préparer une mission pour les 3 meilleurs</button><button className="soft-button">Exporter la vue</button></div>
                </div>
              </>
            ) : <div className="crm-empty"><span className="agent-orb large"><Sparkles size={19} /></span><h2>Interrogez votre mémoire commerciale</h2><p>Exemple : « Résume-moi Armor Process avant mon appel de 14 h. »</p></div>}
          </div>
          <div className="crm-composer"><Plus size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="Posez une question sur vos comptes, notes ou opportunités…" /><button onClick={submit}><ArrowUpRight size={16} /></button></div>
        </main>
        <aside className="crm-sources panel">
          <SectionHeader title="Sources utilisées" meta="8 enregistrements" />
          <div className="source-summary"><div><Database size={16} /><span><strong>Réponse vérifiable</strong><small>L’agent n’a utilisé que les données listées ci-dessous.</small></span></div></div>
          {[
            ["OPP-241", "MecaOuest · opportunité", "46 000 € · Perdue"], ["NOTE-882", "Note d’appel · 12 févr.", "« Revoir au prochain budget »"], ["OPP-298", "Groupe Althéa · opportunité", "31 500 € · Reportée"], ["EMAIL-419", "Email entrant · 3 juin", "Projet repoussé à 2026"], ["OPP-317", "Noroît Équipements", "24 800 € · Perdue"],
          ].map(([id, title, detail]) => <button className="crm-source-row" key={id}><span><SourceBadge>CRM/{id}</SourceBadge><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={12} /></button>)}
          <div className="coverage-box"><span>Couverture de la réponse</span><strong>96%</strong><div className="thin-progress"><span style={{ width: "96%" }} /></div><small>1 note ancienne manque de contexte.</small></div>
        </aside>
      </div>
    </div>
  );
}

function CampaignsPage({ demoAction }: { demoAction: DemoAction }) {
  const [selected, setSelected] = useState(campaigns[1]);
  return (
    <div className="page standard-page campaigns-page">
      <div className="page-intro compact-intro"><div><span className="eyebrow">Email · supervision humaine</span><h1>Campagnes</h1><p>L’agent prépare l’audience, les preuves, la séquence et les règles. Vous gardez la maîtrise de l’envoi.</p></div><button className="dark-button" onClick={() => demoAction("Nouvelle campagne créée en brouillon dans la maquette.")}><Plus size={13} /> Nouvelle campagne</button></div>
      <div className="campaign-kpis">
        {[["Campagnes actives", "1", "2 en préparation"], ["Délivrabilité", "97,8%", "+0,6 pt"], ["Réponses", "8", "14,8%"], ["Réponses positives", "4", "7,4%"], ["Rendez-vous", "2", "48 k€ estimés"]].map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}
      </div>
      <div className="campaign-layout">
        <aside className="campaign-list panel">
          <SectionHeader title="Toutes les campagnes" meta="3 campagnes" />
          {campaigns.map((campaign) => <button key={campaign.name} className={selected.name === campaign.name ? "selected" : ""} onClick={() => setSelected(campaign)}><div><StatusPill tone={campaign.status === "Active" ? "success" : campaign.status === "À approuver" ? "warning" : "neutral"}>{campaign.status}</StatusPill><span>{campaign.audience} contacts</span></div><strong>{campaign.name}</strong><p>{campaign.next}</p><div className="campaign-mini-stats"><span><strong>{campaign.sent}</strong> envoyés</span><span><strong>{campaign.positive}</strong> positifs</span><span><strong>{campaign.meetings}</strong> RDV</span></div></button>)}
        </aside>
        <main className="campaign-builder panel">
          <div className="campaign-title"><div><div className="id-row"><StatusPill tone="warning">{selected.status}</StatusPill><span>C-017 · créée par {selected.owner}</span></div><h2>{selected.name}</h2><p>25 opportunités perdues pour timing · 3 segments selon le nouveau signal.</p></div><button className="more-button"><MoreHorizontal size={16} /></button></div>
          <div className="campaign-tabs"><button className="active">Séquence</button><button>Audience <span>25</span></button><button>Aperçu réel <span>12</span></button><button>Règles</button></div>
          <div className="sequence-layout">
            <div className="sequence-canvas">
              <SectionHeader title="Séquence proposée" meta="3 emails · 11 jours" action={<button className="soft-button"><Plus size={12} /> Ajouter une étape</button>} />
              {[
                { n: "01", when: "Jour 1 · 08:45", name: "Signal actuel", subject: "Votre nouveau site de production", body: "Bonjour Julien, j’ai vu que MecaOuest venait de nommer un nouveau directeur industriel…", rate: "12 variantes" },
                { n: "02", when: "+ 3 jours", name: "Preuve comparable", subject: "Réduire le temps perdu en qualification", body: "Nous avons accompagné une équipe industrielle de taille comparable à…", rate: "3 segments" },
                { n: "03", when: "+ 7 jours", name: "Question courte", subject: "Je clôture ?", body: "Le timing est-il toujours le principal frein ou le sujet mérite-t-il…", rate: "1 variante" },
              ].map((email, index) => <div className="sequence-step" key={email.n}><div className="sequence-number">{email.n}</div><div className="sequence-card"><div><span className="eyebrow">Email {email.n} · {email.when}</span><span>{email.rate}</span></div><h3>{email.name}</h3><label>Objet <strong>{email.subject}</strong></label><p>{email.body}</p><button onClick={() => demoAction(`Aperçu de l’email ${index + 1} ouvert dans la maquette.`)}>Voir les messages réels <ArrowRight size={12} /></button></div></div>)}
            </div>
            <aside className="preflight-panel">
              <SectionHeader title="Contrôle avant lancement" meta="5 / 6 conformes" />
              <div className="preflight-progress"><div className="thin-progress"><span style={{ width: "84%" }} /></div><span>Une validation humaine requise</span></div>
              {[
                ["Audience", "25 contacts · doublons exclus", true], ["Oppositions", "9 contacts exclus globalement", true], ["Domaines", "100 % vérifiés", true], ["Volume", "40 nouveaux contacts / jour", true], ["Budget", "Plafond 150 € / mois", true], ["Messages", "12 exemples à relire", false],
              ].map(([title, detail, done]) => <div className={`preflight-row ${done ? "done" : "pending"}`} key={String(title)}>{done ? <Check size={12} /> : <AlertCircle size={13} />}<span><strong>{String(title)}</strong><small>{String(detail)}</small></span>{!done && <button>Relire</button>}</div>)}
              <div className="stop-rules"><span className="eyebrow">Arrêts automatiques</span><p><CheckCircle2 size={12} /> Toute réponse reçue</p><p><CheckCircle2 size={12} /> Bounce ou opposition</p><p><CheckCircle2 size={12} /> 3 réponses négatives / domaine</p><p><CheckCircle2 size={12} /> Budget ou volume atteint</p></div>
              <button className="dark-button full" onClick={() => demoAction("Simulation uniquement : aucun email n’a été envoyé.")}><Play size={13} /> Simuler le lancement</button>
              <p className="safety-note"><ShieldCheck size={12} /> Aucun email ne partira depuis ce prototype.</p>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function InboxPage({ demoAction }: { demoAction: DemoAction }) {
  const [activeId, setActiveId] = useState(1);
  const active = inboxThreads.find((thread) => thread.id === activeId) ?? inboxThreads[0];
  const [filter, setFilter] = useState("Prioritaire");
  return (
    <div className="page inbox-page">
      <aside className="inbox-filters">
        <div className="inbox-title"><span className="eyebrow">Réponses entrantes</span><h1>Inbox</h1><p>37 à traiter</p></div>
        <button className="inbox-search"><Search size={14} /> Rechercher</button>
        <nav>{[["Prioritaire", "6"], ["Positive", "7"], ["Question", "3"], ["Objection", "5"], ["Plus tard", "8"], ["Mauvais interlocuteur", "2"], ["Négative", "14"], ["Opposition", "3"]].map(([label, value]) => <button key={label} className={filter === label ? "active" : ""} onClick={() => setFilter(label)}><span><i className={`cat-${label.toLowerCase().replace(" ", "-")}`} />{label}</span><strong>{value}</strong></button>)}</nav>
        <div className="channel-summary"><span className="eyebrow">Canaux actifs</span><p><Mail size={12} /> Email <strong>21</strong></p><p><Globe2 size={12} /> Formulaires <strong>4</strong></p><p><Phone size={12} /> Appels manqués <strong>3</strong></p><p><Linkedin size={12} /> LinkedIn assisté <strong>9</strong></p></div>
      </aside>
      <aside className="thread-list">
        <div className="thread-list-head"><div><strong>{filter}</strong><span>Classé par l’IA</span></div><button><Filter size={14} /></button></div>
        {inboxThreads.map((thread) => <button key={thread.id} className={`${activeId === thread.id ? "selected" : ""} ${thread.unread ? "unread" : ""}`} onClick={() => setActiveId(thread.id)}><span className="mini-avatar">{thread.initials}</span><span className="thread-copy"><span><strong>{thread.name}</strong><time>{thread.time}</time></span><small>{thread.company} · {thread.channel}</small><p>{thread.preview}</p><StatusPill tone={thread.category === "Positive" ? "success" : thread.category === "Question" ? "warning" : "neutral"}>{thread.category}</StatusPill></span></button>)}
      </aside>
      <main className="thread-view">
        <header className="thread-head"><div><span className="mini-avatar large">{active.initials}</span><span><strong>{active.name}</strong><small>{active.company} · {active.channel}</small></span></div><div><button className="icon-button"><Phone size={14} /></button><button className="icon-button"><MoreHorizontal size={15} /></button></div></header>
        <div className="thread-body">
          <div className="classification-banner"><span className="classification-icon"><Sparkles size={14} /></span><span><strong>Réponse positive · confiance 97 %</strong><small>Séquence C-016 arrêtée automatiquement · priorité haute</small></span><StatusPill tone="success">À traiter &lt; 2 h</StatusPill></div>
          <div className="message-date">Aujourd’hui · 10:24</div>
          <div className="message incoming"><div className="message-meta"><span>{active.name}</span><time>10:24</time></div><p>Bonjour,<br /><br />Oui, le sujet est d’actualité. Nous revoyons justement nos contrats de maintenance pour septembre.<br /><br />Êtes-vous disponible jeudi matin pour m’expliquer votre approche&nbsp;?<br /><br />Claire</p></div>
          <div className="ai-next-action"><div className="ai-next-head"><span className="agent-orb"><Sparkles size={13} /></span><span><strong>Prochaine action recommandée</strong><small>Répondre maintenant et proposer deux créneaux précis</small></span></div><div className="draft-message"><span className="eyebrow">Brouillon préparé</span><p>Bonjour Claire,<br /><br />Avec plaisir. Je peux vous présenter l’approche jeudi à 9 h 30 ou 11 h. Comptez 25 minutes ; je prendrai votre contexte actuel comme point de départ.<br /><br />Quel créneau vous convient le mieux&nbsp;?</p><div><span>Ton : direct et professionnel</span><button><PenLine size={12} /> Modifier</button></div></div><div className="reply-actions"><button className="dark-button" onClick={() => demoAction("Réponse validée dans la maquette. Aucun email envoyé.")}><Check size={13} /> Valider la réponse</button><button className="soft-button" onClick={() => demoAction("Opportunité O-004 créée dans la maquette.")}><BriefcaseBusiness size={13} /> Créer l’opportunité</button></div></div>
        </div>
      </main>
      <aside className="thread-context">
        <SectionHeader title="Contexte du compte" action={<button className="icon-plain"><ArrowUpRight size={13} /></button>} />
        <div className="context-company"><span className="company-avatar large">AP</span><div><strong>Armor Process</strong><span>Industrie · Lorient</span><small>48 salariés · 8,4 M€</small></div></div>
        <div className="context-score"><span>Intent score</span><strong>94</strong><div className="thin-progress"><span style={{ width: "94%" }} /></div></div>
        <div className="context-section"><span className="eyebrow">Signal d’origine</span><p><Zap size={13} /> Recrute un responsable maintenance</p><small>Détecté il y a 2 jours · source presse emploi</small></div>
        <div className="context-section"><span className="eyebrow">Parcours</span><p><Check size={12} /> Lead qualifié <time>08:51</time></p><p><Check size={12} /> Email 1 envoyé <time>09:05</time></p><p><Check size={12} /> Email ouvert <time>09:43</time></p><p><MessageCircle size={12} /> Réponse positive <time>10:24</time></p></div>
        <div className="opportunity-estimate"><span className="eyebrow">Opportunité estimée</span><strong>24 000 €</strong><small>Confiance 72 % · cycle moyen 45 j</small></div>
        <button className="agent-context-button" onClick={() => demoAction("L’agent utiliserait uniquement le contexte Armor Process.")}><Sparkles size={14} /> Demander à l’agent sur ce compte</button>
      </aside>
    </div>
  );
}

function LinkedInPage({ demoAction }: { demoAction: DemoAction }) {
  const [tab, setTab] = useState<"content" | "prospecting">("content");
  return (
    <div className="page standard-page linkedin-page">
      <div className="linkedin-safety"><Linkedin size={14} /><span><strong>Mode assisté</strong> · aucune invitation, aucun DM, commentaire ou like n’est envoyé automatiquement.</span><button onClick={() => demoAction("Cette règle protège le compte et respecte les restrictions de LinkedIn.")}>Pourquoi ?</button></div>
      <div className="page-intro compact-intro"><div><span className="eyebrow">Profil dirigeant · Alexandre Noël</span><h1>LinkedIn Studio</h1><p>Construisez la présence et les conversations du dirigeant, avec une exécution organique toujours humaine.</p></div><div className="button-row"><button className="soft-button"><Mic size={14} /> Ajouter une interview</button><button className="dark-button" onClick={() => demoAction("Brouillon de post généré localement dans la maquette.")}><Plus size={13} /> Créer un post</button></div></div>
      <div className="linkedin-tabs"><button className={tab === "content" ? "active" : ""} onClick={() => setTab("content")}>Contenu</button><button className={tab === "prospecting" ? "active" : ""} onClick={() => setTab("prospecting")}>Prospection assistée</button><button>File du jour <span>18</span></button><button>Voix du dirigeant</button></div>
      {tab === "content" ? <LinkedInContent demoAction={demoAction} /> : <LinkedInProspecting demoAction={demoAction} />}
    </div>
  );
}

function LinkedInContent({ demoAction }: { demoAction: DemoAction }) {
  return (
    <div className="linkedin-content-layout">
      <section className="content-calendar panel">
        <SectionHeader title="Calendrier éditorial" meta="Semaine du 13 juillet" action={<div className="button-row"><button className="icon-plain"><ChevronDown size={13} /></button><button className="soft-button">Vue calendrier</button></div>} />
        <div className="content-source-card"><span className="source-wave"><i /><i /><i /><i /><i /><i /><i /><i /></span><span><strong>Interview dirigeant · 28:14</strong><small>12 angles extraits · 8 posts préparés</small></span><StatusPill tone="success">Analysée</StatusPill></div>
        <div className="post-list">{linkedInPosts.map((post, index) => <button key={post.hook} className={index === 0 ? "selected" : ""}><div><StatusPill tone={post.status === "À valider" ? "warning" : post.status === "Planifié" ? "success" : "neutral"}>{post.status}</StatusPill><span>{post.date}</span></div><p>{post.hook}</p><small>{post.theme} · matière issue de l’interview #12</small><ChevronRight size={14} /></button>)}</div>
        <button className="soft-button full"><Plus size={13} /> Ajouter une idée au calendrier</button>
      </section>
      <main className="post-editor panel">
        <SectionHeader title="Post à valider" meta="Brouillon #P-048" action={<button className="more-button"><MoreHorizontal size={15} /></button>} />
        <div className="editor-columns">
          <div className="editor-form">
            <div className="editor-meta"><div><span className="mini-avatar">AN</span><span><strong>Alexandre Noël</strong><small>Dirigeant · Atelier Nord</small></span></div><StatusPill tone="warning">À valider</StatusPill></div>
            <textarea readOnly value={`Le vrai coût d’une machine arrêtée n’apparaît jamais sur le devis de maintenance.\n\nIl apparaît ailleurs :\n\n— dans les commandes livrées en retard\n— dans l’équipe qui attend sans pouvoir produire\n— dans la confiance du client qui s’érode\n\nLa semaine dernière, un directeur de site m’a dit : « Notre panne nous a coûté 4 fois le prix de la réparation. »\n\nC’est pour cette raison qu’une maintenance efficace ne se mesure pas seulement au coût de l’intervention. Elle se mesure au temps de production protégé.\n\nQuel indicateur utilisez-vous vraiment pour piloter ce risque ?`} />
            <div className="editor-proof"><Sparkles size={13} /><span><strong>Voix respectée à 92 %</strong><small>Direct · expert · phrases courtes · aucun mot interdit</small></span></div>
            <div className="editor-actions"><button className="soft-button"><Sparkles size={13} /> Proposer 3 accroches</button><button className="dark-button" onClick={() => demoAction("Post approuvé dans la maquette, sans publication LinkedIn.")}><Check size={13} /> Approuver le post</button></div>
          </div>
          <aside className="linkedin-preview">
            <span className="eyebrow">Aperçu LinkedIn</span>
            <div className="linkedin-card"><div className="linkedin-author"><span className="mini-avatar large">AN</span><span><strong>Alexandre Noël</strong><small>Dirigeant d’Atelier Nord · 1 h</small></span><MoreHorizontal size={15} /></div><p><strong>Le vrai coût d’une machine arrêtée n’apparaît jamais sur le devis de maintenance.</strong><br /><br />Il apparaît ailleurs :<br /><br />— dans les commandes livrées en retard<br />— dans l’équipe qui attend sans pouvoir produire<br />— dans la confiance du client qui s’érode<br /><br /><span>… voir plus</span></p><div className="linkedin-reactions"><span>◉ 24</span><span>7 commentaires</span></div><div className="linkedin-buttons"><button>J’aime</button><button>Commenter</button><button>Republier</button></div></div>
          </aside>
        </div>
      </main>
      <aside className="voice-panel panel">
        <SectionHeader title="Voix du dirigeant" meta="Profil actif" />
        <div className="voice-score"><div className="progress-ring small" style={{ "--progress": "92%" } as React.CSSProperties}><span>92<small>%</small></span></div><span><strong>Fidélité de voix</strong><small>Basée sur 4 h 32 de matière</small></span></div>
        <div className="voice-section"><span className="eyebrow">Style</span><div className="tag-list"><span>Direct</span><span>Expert</span><span>Concret</span><span>Sans jargon</span><span>Retours terrain</span></div></div>
        <div className="voice-section"><span className="eyebrow">À éviter</span><div className="forbidden-list"><span>révolutionnaire</span><span>game changer</span><span>incroyable</span><span>🚀</span></div></div>
        <div className="voice-section"><span className="eyebrow">Matière disponible</span><p><Mic size={13} /> 4 interviews <strong>2 h 08</strong></p><p><MessageSquare size={13} /> 19 appels commerciaux</p><p><FileText size={13} /> 36 notes terrain</p></div>
        <button className="soft-button full">Modifier le profil de voix</button>
      </aside>
    </div>
  );
}

function LinkedInProspecting({ demoAction }: { demoAction: DemoAction }) {
  const actions = [
    { initials: "ML", name: "Marie Laurent", role: "DG · ClimaNova", signal: "A publié sur son nouveau site", action: "Commenter", message: "La standardisation avant l’automatisation : c’est souvent le point oublié…" },
    { initials: "PB", name: "Paul Besson", role: "Dir. technique · Thermalis", signal: "A accepté votre invitation", action: "Envoyer le DM", message: "Bonjour Paul, merci pour la connexion. Votre retour sur la maintenance préventive…" },
    { initials: "JC", name: "Jérôme Colin", role: "DG · Rhône Maintenance", signal: "A visité votre profil", action: "Voir le profil", message: "Compte prioritaire · score 89 · aucun message à envoyer avant familiarité." },
    { initials: "AM", name: "Amandine Morel", role: "Achats · Alpin Fluides", signal: "Post sur un appel d’offres", action: "Commenter", message: "Un cahier des charges clair sur les délais d’intervention change réellement…" },
  ];
  return (
    <div className="prospecting-layout">
      <section className="prospecting-plan panel">
        <SectionHeader title="Campagne assistée" meta="Cibles industrie · 42 comptes" action={<StatusPill tone="success">Active</StatusPill>} />
        <div className="assist-sequence">
          {[["01", "Voir le profil", "Humain · 42 actions"], ["02", "Commentaire suggéré", "Humain · si signal pertinent"], ["03", "Invitation préparée", "Humain · 30 / semaine"], ["04", "DM de contexte", "Humain · après acceptation"], ["05", "Relance courte", "Humain · J+5"]].map(([n, title, detail], index) => <div key={n} className={index < 2 ? "active" : ""}><span>{n}</span><span><strong>{title}</strong><small>{detail}</small></span>{index < 4 && <ChevronRight size={12} />}</div>)}
        </div>
        <div className="assist-metrics"><div><span>Connexions préparées</span><strong>30</strong></div><div><span>Acceptées</span><strong>17</strong></div><div><span>Conversations</span><strong>6</strong></div><div><span>RDV attribués</span><strong>2</strong></div></div>
      </section>
      <main className="daily-queue panel">
        <SectionHeader title="File d’actions humaines" meta="18 actions aujourd’hui" action={<button className="soft-button"><Filter size={13} /> Priorité</button>} />
        {actions.map((item, index) => <div className="daily-action" key={item.name}><span className="mini-avatar">{item.initials}</span><div className="daily-person"><strong>{item.name}</strong><small>{item.role}</small><span><Zap size={11} /> {item.signal}</span></div><div className="prepared-message"><span className="eyebrow">Suggestion de l’agent</span><p>{item.message}</p></div><div className="daily-buttons"><button className="soft-button" onClick={() => demoAction("Texte copié dans la maquette.")}><Copy size={12} /></button><button className="dark-button" onClick={() => demoAction("Ouverture de LinkedIn désactivée dans ce prototype.")}>{item.action} <ExternalLink size={11} /></button></div>{index === 0 && <StatusPill tone="warning">Prioritaire</StatusPill>}</div>)}
      </main>
      <aside className="assist-rules panel">
        <SectionHeader title="Règles de sécurité" />
        <div className="rule-hero"><ShieldCheck size={18} /><span><strong>Exécution 100 % humaine</strong><small>L’agent prépare. Le dirigeant clique dans LinkedIn.</small></span></div>
        {[["Invitations", "30 / semaine"], ["DM", "Après acceptation"], ["Commentaires", "Toujours relus"], ["Likes", "Jamais automatisés"]].map(([label, value]) => <div className="rule-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        <button className="soft-button full" onClick={() => demoAction("Paramètres LinkedIn affichés en lecture seule.")}>Modifier les règles</button>
      </aside>
    </div>
  );
}

function AgentDrawer({ open, onClose, initialPrompt, demoAction }: { open: boolean; onClose: () => void; initialPrompt: string; demoAction: DemoAction }) {
  const [input, setInput] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt);
  useEffect(() => { if (initialPrompt) setPrompt(initialPrompt); }, [initialPrompt]);
  const submit = () => { if (input.trim()) { setPrompt(input.trim()); setInput(""); } };
  return (
    <div className={`agent-drawer-shell ${open ? "open" : ""}`} aria-hidden={!open}>
      <button className="agent-scrim" onClick={onClose} aria-label="Fermer l’agent" />
      <aside className="agent-drawer">
        <header><div><span className="agent-orb"><Sparkles size={14} /></span><span><strong>Agent Revenue</strong><small>Disponible · contexte global</small></span></div><button className="close-button" onClick={onClose}><X size={16} /></button></header>
        <div className="agent-permissions"><span><i /> Lecture automatique</span><span><i /> Préparation automatique</span><span><ShieldCheck size={11} /> Action sur validation</span></div>
        <div className="agent-chat">
          {!prompt ? <div className="agent-empty"><span className="agent-orb large"><Bot size={20} /></span><h2>Que voulez-vous accomplir&nbsp;?</h2><p>Je peux chercher, analyser, préparer et surveiller. Je demanderai votre accord avant toute action externe.</p></div> : (
            <>
              <div className="agent-user-message"><span>Vous</span><p>{prompt}</p></div>
              <div className="agent-response">
                <div className="answer-author"><span className="agent-orb"><Sparkles size={13} /></span><span><strong>Plan de mission préparé</strong><small>Compréhension · aucune action lancée</small></span></div>
                <p>Je propose une mission en six étapes. J’utiliserai les sources gratuites pour filtrer avant de consommer les crédits Apollo.</p>
                <div className="agent-plan">
                  {[["01", "Interpréter les critères", "Secteur, zone, taille, fonctions"], ["02", "Découvrir les entreprises", "Serper Maps + data.gouv"], ["03", "Fusionner et exclure", "Doublons + comptes CRM"], ["04", "Scorer les comptes", "Fit, signal et fraîcheur"], ["05", "Enrichir le top 50", "Apollo uniquement après le score"], ["06", "Préparer la campagne", "Messages réels avant validation"]].map(([n, title, detail]) => <div key={n}><span>{n}</span><span><strong>{title}</strong><small>{detail}</small></span></div>)}
                </div>
                <div className="agent-estimate"><div><span>Résultat visé</span><strong>80–110 leads</strong></div><div><span>Coût estimé</span><strong>63–89 €</strong></div><div><span>Durée estimée</span><strong>34 min</strong></div></div>
                <div className="agent-warning"><ShieldCheck size={14} /><span><strong>Point de contrôle</strong><small>La campagne sera préparée, mais aucun email ne sera envoyé sans votre validation.</small></span></div>
                <button className="dark-button full" onClick={() => demoAction("Mission créée en mode démonstration. Aucune source interrogée.")}><Play size={13} /> Créer la mission en démo</button>
              </div>
            </>
          )}
        </div>
        <div className="agent-drawer-composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Demander, modifier ou préciser…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} /><div><button><Plus size={14} /></button><span>Entrée pour envoyer</span><button className="send-button" onClick={submit}><ArrowUpRight size={16} /></button></div></div>
      </aside>
    </div>
  );
}

function CommandPalette({ open, onClose, setPage, openAgent }: { open: boolean; onClose: () => void; setPage: (page: PageId) => void; openAgent: (prompt: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => navItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);
  if (!open) return null;
  return (
    <div className="command-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()}>
        <div className="command-input"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un module, un compte ou donner un ordre…" /><kbd>ESC</kbd></div>
        <div className="command-results">
          <span className="eyebrow">Navigation</span>
          {results.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { setPage(item.id); onClose(); }}><span className="command-icon"><Icon size={15} /></span><span><strong>{item.label}</strong><small>{pageTitles[item.id].meta}</small></span><span>Ouvrir</span><ArrowRight size={12} /></button>; })}
          <span className="eyebrow">Commandes rapides</span>
          {["Trouve 50 entreprises autour de Rennes", "Résume Armor Process avant mon appel", "Prépare une campagne de réactivation"].map((prompt) => <button key={prompt} onClick={() => { openAgent(prompt); onClose(); }}><span className="command-icon"><Sparkles size={15} /></span><span><strong>{prompt}</strong><small>Confier à l’agent Revenue</small></span><span>Préparer</span><ArrowRight size={12} /></button>)}
        </div>
        <footer><span>↑↓ naviguer</span><span>↵ ouvrir</span><span>⌘ K fermer</span></footer>
      </div>
    </div>
  );
}

function MoreMenu({ open, onClose, setPage, demoAction }: { open: boolean; onClose: () => void; setPage: (page: PageId) => void; demoAction: DemoAction }) {
  if (!open) return null;
  return (
    <div className="drawer-overlay menu-overlay" onClick={onClose}>
      <aside className="more-menu" onClick={(event) => event.stopPropagation()}>
        <div className="more-menu-head"><div><LogoMark /><span><strong>Revenue OS</strong><small>Atelier Nord · Mode démo</small></span></div><button className="close-button" onClick={onClose}><X size={16} /></button></div>
        <span className="eyebrow">Navigation</span>
        {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { setPage(item.id); onClose(); }}><span><Icon size={16} /><strong>{item.label}</strong></span><ChevronRight size={13} /></button>; })}
        <span className="eyebrow">Infrastructure</span>
        <button onClick={() => demoAction("Tous les connecteurs sont actuellement simulés ou non connectés.")}><span><Globe2 size={16} /><strong>Connecteurs et sources</strong></span><StatusPill tone="warning">Démo</StatusPill></button>
        <button onClick={() => demoAction("Les paramètres seront disponibles après la phase prototype.")}><span><Settings size={16} /><strong>Paramètres et permissions</strong></span><ChevronRight size={13} /></button>
      </aside>
    </div>
  );
}

export function RevenueOSDashboard() {
  const [page, setPage] = useState<PageId>("overview");
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState("");

  const demoAction: DemoAction = (message) => setToast(message);
  const openAgent = (prompt: string) => { setAgentPrompt(prompt); setAgentOpen(true); };
  const navigate = (next: PageId) => { setPage(next); setMoreOpen(false); };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setAgentOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  return (
    <div className="app-shell">
      <Rail page={page} setPage={navigate} onMenu={() => setMoreOpen(true)} />
      <div className="app-main">
        <TopBar page={page} onSearch={() => setCommandOpen(true)} onDemo={demoAction} />
        <main className="page-shell">
          {page === "overview" && <OverviewPage openAgent={openAgent} setPage={navigate} demoAction={demoAction} />}
          {page === "missions" && <MissionsPage demoAction={demoAction} />}
          {page === "leads" && <LeadFinderPage demoAction={demoAction} />}
          {page === "crm" && <CrmPage demoAction={demoAction} />}
          {page === "campaigns" && <CampaignsPage demoAction={demoAction} />}
          {page === "inbox" && <InboxPage demoAction={demoAction} />}
          {page === "linkedin" && <LinkedInPage demoAction={demoAction} />}
        </main>
      </div>
      <button className={`agent-launcher ${agentOpen ? "hidden" : ""}`} onClick={() => openAgent("")}><span className="agent-orb inverted"><Sparkles size={17} /></span><span>Demander à l’agent</span><kbd>⌘K</kbd></button>
      <AgentDrawer open={agentOpen} onClose={() => setAgentOpen(false)} initialPrompt={agentPrompt} demoAction={demoAction} />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} setPage={navigate} openAgent={openAgent} />
      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} setPage={navigate} demoAction={demoAction} />
      {toast && <div className="toast"><span><ShieldCheck size={15} /></span><div><strong>Mode démonstration</strong><p>{toast}</p></div><button onClick={() => setToast("")}><X size={13} /></button></div>}
    </div>
  );
}
