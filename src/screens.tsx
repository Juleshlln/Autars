import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  ProgressBar,
  RarityBadge,
  SectionHeader,
  SelectField,
  Skeleton,
  Stat,
  StatusPill,
  Stepper,
  TabBar,
} from './components'
import { CommandCenter, LiveActivityFeed, MissionQuestCard, PixelAgent } from './hq'
import {
  agents as baseAgents,
  deriveVentureName,
  executionLogs,
  executionSteps,
  missions as baseMissions,
  reports,
  achievements,
} from './data'
import {
  computeAssetsCount,
  computeCompanyMaturity,
  computeEnergy,
  computeFounderLevel,
  computeMetrics,
  computeStageLabel,
  computeXP,
  getAgents,
  getMissionStatus,
  levelLabel,
} from './state'
import type { AgentDepartment, AgentStatus, HqTab, Mission, MissionStatus, VentureBrief } from './types'

type OperationalAgent = ReturnType<typeof getAgents>[number]

/* ============================================================
   LANDING
   ============================================================ */

export function LandingScreen({
  onStart,
  onDemo,
}: {
  onStart: () => void
  onDemo: () => void
}) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <Badge tone="accent" size="sm">Premier parcours</Badge>
        <h1 className="display">
          Transforme une idée business <br />en parcours opérationnel.
        </h1>
        <p className="lead">
          Autars guide chaque étape : marché, positionnement, offre, marque, landing, acquisition, test.
          Vos agents IA produisent les livrables. Vous validez avant chaque action.
        </p>
        <div className="cta-row">
          <Button size="lg" onClick={onStart}>Démarrer un parcours</Button>
          <Button size="lg" variant="secondary" onClick={onDemo}>
            Charger une démo complète
          </Button>
        </div>
        <div className="landing-points">
          <div>
            <span className="mono">01</span>
            <p>Brief en 2 minutes</p>
          </div>
          <div>
            <span className="mono">02</span>
            <p>7 missions guidées</p>
          </div>
          <div>
            <span className="mono">03</span>
            <p>Validation à chaque étape</p>
          </div>
        </div>
      </div>

      <Card padding="lg" className="landing-preview">
        <header className="landing-preview-head">
          <div>
            <p className="eyebrow">Aperçu du QG</p>
            <h3>Visibility Lab</h3>
          </div>
          <StatusPill tone="progress">En cours</StatusPill>
        </header>

        <div className="landing-mini-stepper">
          {baseMissions.slice(0, 5).map((m, i) => (
            <span key={m.id} className={`mini-step ${i < 2 ? 'done' : i === 2 ? 'now' : ''}`}>
              <span className="mono">{String(m.index).padStart(2, '0')}</span>
              {m.title}
            </span>
          ))}
        </div>

        <div className="landing-stats">
          <Stat label="Étapes" value="2 / 7" hint="parcours" />
          <Stat label="XP" value="260" hint="niveau Opérateur" />
          <Stat label="Énergie" value="84" hint="capacité de mission" />
          <Stat label="Assets" value="2" hint="livrables approuvés" />
        </div>

        <ProgressBar value={28} label="Progression globale" showValue />
      </Card>
    </section>
  )
}

/* ============================================================
   SCENARIO
   ============================================================ */

export function ScenarioScreen({ onStart }: { onStart: () => void }) {
  const scenarios = [
    { title: 'Lancer une activité de service', status: 'Disponible', desc: "Transformer une idée en offre prête à tester : positionnement, pricing, landing, acquisition." },
    { title: 'Créer un SaaS', status: 'Bientôt', desc: 'MVP, roadmap, waitlist et boucle de validation produit.' },
    { title: 'Lancer une agence', status: 'Bientôt', desc: 'Offres, delivery, acquisition client et systèmes de fulfillment.' },
    { title: 'Business de contenu', status: 'Bientôt', desc: "Stratégie d'audience, calendrier éditorial, monétisation." },
  ]

  return (
    <section className="screen">
      <SectionHeader
        eyebrow="Étape 1 / 3"
        title="Choisissez votre parcours"
        description="Chaque scénario ouvre des missions, des agents et des livrables adaptés."
      />
      <div className="scenario-grid">
        {scenarios.map((s, i) => {
          const playable = i === 0
          return (
            <Card key={s.title} padding="lg" className={playable ? 'scenario-card playable' : 'scenario-card disabled'}>
              <div className="scenario-card-top">
                <Badge tone={playable ? 'success' : 'neutral'} size="sm">{s.status}</Badge>
                <span className="mono dim">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{s.title}</h3>
              <p className="muted">{s.desc}</p>
              {playable ? (
                <Button onClick={onStart}>Démarrer</Button>
              ) : (
                <Button variant="ghost" disabled>Verrouillé</Button>
              )}
            </Card>
          )
        })}
      </div>
    </section>
  )
}

/* ============================================================
   BRIEFING
   ============================================================ */

export function BriefingScreen({
  brief,
  onChange,
  onGenerate,
}: {
  brief: VentureBrief
  onChange: (b: VentureBrief) => void
  onGenerate: () => void
}) {
  const set = (key: keyof VentureBrief) => (v: string) => onChange({ ...brief, [key]: v })
  const ventureName = deriveVentureName(brief.businessIdea)
  const onboardingAgents = getAgents(0).filter((agent) => agent.status !== 'Locked')
  const objectiveOptions = [
    'Trouver plus de clients',
    'Automatiser mes tâches',
    'Créer du contenu',
    'Analyser mon marché',
    'Structurer mon business',
    'Améliorer ma productivité',
  ]

  return (
    <section className="screen briefing">
      <div className="briefing-intro">
        <SectionHeader
          eyebrow="Étape 2 / 3"
          title="Préparez votre brief"
          description="Quelques informations pour ancrer toutes les missions à votre réalité."
        />
        <Card padding="md" className="briefing-tip">
          <Badge tone="info" size="sm">Astuce</Badge>
          <p className="muted">
            Plus le brief est précis, plus les livrables s'adaptent à votre contexte. Vous pourrez tout modifier plus tard.
          </p>
        </Card>
      </div>

      <div className="onboarding-command">
        <Card padding="lg" className="onboarding-company">
          <p className="eyebrow">Entreprise IA</p>
          <h2>{ventureName}</h2>
          <p className="muted">
            Votre QG sera initialisé avec une première équipe IA, une mission guidée et un tableau de progression.
          </p>
          <div className="onboarding-progress">
            {['Nommer', 'Choisir objectif', 'Activer agents', 'Lancer mission'].map((label, index) => (
              <div key={label} className="onboarding-step">
                <span className="mono">{String(index + 1).padStart(2, '0')}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="lg" className="onboarding-agents">
          <SectionHeader eyebrow="Premiers agents" title="Équipe de démarrage" />
          <div className="onboarding-agent-list">
            {onboardingAgents.map((agent) => (
              <div key={agent.id} className="onboarding-agent">
                <AgentAvatar agent={agent} compact />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.className}</span>
                </div>
                <Badge tone="success" size="sm">Activé</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div className="form-grid">
          <Field label="Idée business" value={brief.businessIdea} onChange={set('businessIdea')} />
          <Field label="Client cible" value={brief.targetCustomer} onChange={set('targetCustomer')} />
          <Field label="Assets existants" value={brief.existingAssets} onChange={set('existingAssets')} />
          <div className="form-row">
            <Field label="Budget de départ" value={brief.startingBudget} onChange={set('startingBudget')} />
            <Field label="Temps par semaine" value={brief.timePerWeek} onChange={set('timePerWeek')} />
          </div>
          <Field label="Stade actuel" value={brief.currentStage} onChange={set('currentStage')} />
          <Field label="Objectif principal" value={brief.mainObjective} onChange={set('mainObjective')} />
          <div className="objective-choice-grid" aria-label="Objectifs principaux">
            {objectiveOptions.map((objective) => {
              const selected = brief.mainObjective.toLowerCase().includes(objective.toLowerCase().split(' ')[0])
              return (
                <button
                  key={objective}
                  type="button"
                  className={`objective-choice ${selected ? 'objective-choice-selected' : ''}`}
                  onClick={() => onChange({ ...brief, mainObjective: objective })}
                >
                  <span className="objective-choice-dot" aria-hidden />
                  <span>{objective}</span>
                </button>
              )
            })}
          </div>
          <Field label="Ton / style" value={brief.tone} onChange={set('tone')} />
          <SelectField
            label="Autonomie des agents"
            value={brief.autonomy}
            onChange={set('autonomy')}
            options={['Brouillon uniquement', 'Validation requise', 'Autopilote contrôlé', 'Autopilote complet']}
          />
        </div>
        <div className="briefing-actions">
          <Button size="lg" onClick={onGenerate} fullWidth>
            Générer le QG du projet
          </Button>
        </div>
      </Card>
    </section>
  )
}

/* ============================================================
   GENERATING
   ============================================================ */

export function GeneratingScreen({
  ventureName,
  onDone,
}: {
  ventureName: string
  onDone: () => void
}) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setProgress((p) => Math.min(p + 5, 100)), 90)
    const end = window.setTimeout(onDone, 1900)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(end)
    }
  }, [onDone])

  return (
    <section className="screen generating">
      <Card padding="lg">
        <Badge tone="accent" size="sm">Génération en cours</Badge>
        <h1 className="page-title">{ventureName}</h1>
        <p className="muted">Configuration du QG, assignation des agents et préparation des missions.</p>
        <ProgressBar value={progress} showValue size="lg" />
        <div className="generation-list">
          {['Analyse du brief', 'Modèle de ressources', 'Assignation des agents', 'Préparation des missions'].map((s, i) => (
            <div key={s} className={`gen-step ${progress > i * 25 ? 'done' : ''}`}>
              <span className="gen-bullet" aria-hidden />
              <span>{s}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}

/* ============================================================
   FIRST RESULT
   ============================================================ */

export function FirstResultScreen({
  brief,
  ventureName,
  onDone,
}: {
  brief: VentureBrief
  ventureName: string
  onDone: () => void
}) {
  const [progress, setProgress] = useState(18)
  const mission = baseMissions[0]
  const activeAgents = getAgents(0).filter((agent) => mission.assignedAgentIds.includes(agent.id))
  const opportunityScore = Math.min(91, 64 + brief.mainObjective.length % 18)

  useEffect(() => {
    const t = window.setInterval(() => setProgress((p) => Math.min(p + 4, 100)), 160)
    return () => window.clearInterval(t)
  }, [])

  return (
    <section className="screen first-result">
      <div className="first-result-main">
        <Card padding="lg" className="first-result-hero">
          <Badge tone={progress >= 100 ? 'success' : 'accent'} size="sm">
            {progress >= 100 ? 'Premier résultat prêt' : 'Première mission en cours'}
          </Badge>
          <h1 className="page-title">{ventureName}</h1>
          <p className="muted">
            Vos premiers agents analysent le brief et produisent un signal exploitable avant l'ouverture du QG.
          </p>

          <div className="first-result-agents">
            {activeAgents.map((agent) => (
              <div key={agent.id} className="first-result-agent">
                <AgentAvatar agent={{ ...agent, status: progress >= 100 ? 'Result' : 'Working', progress }} compact />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{progress >= 100 ? 'Résultat disponible' : agent.avatar.workspace}</span>
                </div>
                <AgentStatusBadge status={progress >= 100 ? 'Result' : 'Working'} />
              </div>
            ))}
          </div>

          <ProgressBar
            value={progress}
            label={progress >= 100 ? 'Premier livrable prêt' : 'Analyse du brief'}
            showValue
            size="lg"
            tone={progress >= 100 ? 'success' : 'accent'}
          />

          <div className="first-result-actions">
            <Button size="lg" onClick={onDone} disabled={progress < 100}>
              Découvrir mon QG
            </Button>
          </div>
        </Card>

        <Card padding="lg" className={`first-result-report ${progress >= 100 ? 'report-ready' : ''}`}>
          <div className="report-pulse" aria-hidden />
          <p className="eyebrow">Signal initial</p>
          <h2>Opportunité détectée</h2>
          <p className="muted">
            {brief.businessIdea} pour {brief.targetCustomer}. L'objectif prioritaire est clair :
            {' '}{brief.mainObjective.toLowerCase()}.
          </p>
          <div className="first-result-score">
            <span className="mono">{opportunityScore}</span>
            <small>/100</small>
          </div>
          <div className="first-result-findings">
            <ResultFinding label="Segment prioritaire" value={brief.targetCustomer} />
            <ResultFinding label="Première mission" value={mission.title} />
            <ResultFinding label="Résultat attendu" value={mission.expectedResult} />
          </div>
        </Card>
      </div>

      <Card padding="lg" className="first-result-next">
        <SectionHeader
          eyebrow="Votre boucle démarre"
          title="Un premier livrable sera ajouté à votre bibliothèque"
          description="Le QG s'ouvrira avec la maturité initiale, les agents actifs et la prochaine mission disponible."
        />
        <div className="first-result-unlocks">
          {['QG entreprise IA', '2 agents activés', "Rapport d'opportunité", 'Mission suivante prête'].map((item) => (
            <Badge key={item} tone="success" size="sm">{item}</Badge>
          ))}
        </div>
      </Card>
    </section>
  )
}

function ResultFinding({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-finding">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

/* ============================================================
   HQ
   ============================================================ */

interface HQProps {
  brief: VentureBrief
  ventureName: string
  step: number
  activeTab: HqTab
  onTab: (t: HqTab) => void
  onStartMission: (m: Mission) => void
  onOpenAsset: (id: string) => void
}

export function HQScreen(props: HQProps) {
  const { brief, ventureName, step, activeTab, onTab, onStartMission, onOpenAsset } = props
  const missions = baseMissions
  const metrics = computeMetrics(step)
  const energy = computeEnergy(step)
  const xp = computeXP(step)
  const stage = computeStageLabel(step)
  const assets = computeAssetsCount(step)
  const level = computeFounderLevel(step)

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const agents = getAgents(step)
  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) ?? null,
    [missions, selectedMissionId],
  )
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  )

  const nextMission = missions.find((m) => getMissionStatus(m, step) === 'available')
  const completedCount = step

  return (
    <section className="hq">
      <header className="hq-hero">
        <div>
          <p className="eyebrow">QG · Niveau {level} {levelLabel(level)}</p>
          <h1 className="page-title">{ventureName}</h1>
          <p className="muted hq-pitch">
            {brief.businessIdea} pour {brief.targetCustomer}.
          </p>
        </div>
        <Card padding="md" className="objective-card">
          <p className="eyebrow">Objectif principal</p>
          <p className="objective-text">{brief.mainObjective}</p>
          <div className="objective-meta">
            <span>{brief.currentStage}</span>
            <span>·</span>
            <span>{brief.startingBudget}</span>
            <span>·</span>
            <span>{brief.autonomy}</span>
          </div>
        </Card>
      </header>

      <Card padding="md" className="next-action">
        <div className="next-action-left">
          <Badge tone="accent" size="sm">Prochaine action</Badge>
          <div>
            <h3>
              {nextMission ? `Mission ${nextMission.index} · ${nextMission.title}` : 'Parcours terminé'}
            </h3>
            <p className="muted">
              {nextMission ? nextMission.description : 'Toutes les missions ont été validées. Préparez la suite.'}
            </p>
          </div>
        </div>
        {nextMission && (
          <Button size="lg" onClick={() => setSelectedMissionId(nextMission.id)}>
            Préparer la mission
          </Button>
        )}
      </Card>

      <div className="hq-stats">
        <Stat label="Étapes" value={`${completedCount} / 7`} hint="missions validées" />
        <Stat label="XP" value={xp.toLocaleString('fr-FR')} hint={`Niveau ${level}`} />
        <Stat label="Énergie" value={`${energy}/100`} hint="capacité de mission" />
        <Stat label="Assets" value={assets} hint="livrables approuvés" />
        <Stat label="Stade" value={stage} hint="du parcours" size="sm" />
      </div>

      <Stepper
        steps={missions.map((m) => ({
          id: m.id,
          label: m.title,
          status: getMissionStatus(m, step),
        }))}
        current={nextMission?.id}
        onSelect={(id) => setSelectedMissionId(id)}
      />

      <div className="hq-tabs">
        <TabBar<HqTab>
          tabs={[
            { id: 'overview', label: 'Vue d\'ensemble' },
            { id: 'missions', label: 'Missions', count: missions.length },
            { id: 'agents', label: 'Agents', count: baseAgents.length },
            { id: 'assets', label: 'Bibliothèque', count: assets },
          ]}
          value={activeTab}
          onChange={onTab}
        />
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          step={step}
          metrics={metrics}
          ventureName={ventureName}
          brief={brief}
          onOpenAgent={setSelectedAgentId}
        />
      )}
      {activeTab === 'missions' && (
        <MissionsTab
          step={step}
          onSelect={(m) => setSelectedMissionId(m.id)}
        />
      )}
      {activeTab === 'agents' && <AgentsTab step={step} onOpenAgent={setSelectedAgentId} />}
      {activeTab === 'assets' && (
        <AssetsTab step={step} onOpen={onOpenAsset} />
      )}

      {selectedMission && (
        <MissionDetailModal
          mission={selectedMission}
          status={getMissionStatus(selectedMission, step)}
          onClose={() => setSelectedMissionId(null)}
          onStart={() => {
            const m = selectedMission
            setSelectedMissionId(null)
            onStartMission(m)
          }}
        />
      )}

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgentId(null)}
          onPrepareMission={(missionId) => {
            setSelectedAgentId(null)
            setSelectedMissionId(missionId)
          }}
        />
      )}
    </section>
  )
}

/* ---------- HQ tabs ---------- */

function OverviewTab({
  step,
  metrics,
  ventureName,
  brief,
  onOpenAgent,
}: {
  step: number
  metrics: ReturnType<typeof computeMetrics>
  ventureName: string
  brief: VentureBrief
  onOpenAgent: (id: string) => void
}) {
  const unlockedAchievements = achievements.filter((a) => step >= a.unlockAt)
  const maturity = computeCompanyMaturity(step)
  const agents = getAgents(step)
  const activeAgents = agents.filter((a) => a.status === 'Working' || a.status === 'Result')
  const workingCount = agents.filter((a) => a.status === 'Working' || a.status === 'Result').length
  const energy = computeEnergy(step)
  const level = computeFounderLevel(step)
  const stage = computeStageLabel(step)

  return (
    <div className="overview-stack">
      <CommandCenter
        agents={agents}
        ventureName={ventureName}
        level={level}
        levelLabel={levelLabel(level)}
        stage={stage}
        energy={energy}
        workingCount={workingCount}
        totalAgents={agents.length}
        onOpenAgent={onOpenAgent}
      />

      <section className="overview-split">
        <CompanyMaturityCard
          ventureName={ventureName}
          maturity={maturity}
          activeAgents={activeAgents.length}
          completedMissions={step}
        />
        <LiveActivityFeed step={step} agents={agents} />
      </section>

      <Card padding="lg" className="company-loop-card">
        <SectionHeader
          eyebrow="Boucle de pilotage"
          title="Votre équipe IA avance par missions"
          description={`${brief.mainObjective}. Chaque résultat validé améliore le système opérationnel.`}
        />
        <div className="loop-track" aria-label="Boucle d'engagement Autars">
          {['Créer agent', 'Assigner mission', 'Observer', 'Valider résultat', 'Améliorer'].map((item, index) => (
            <div key={item} className={`loop-step ${index <= Math.min(step, 4) ? 'loop-step-active' : ''}`}>
              <span className="loop-index mono">{String(index + 1).padStart(2, '0')}</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>

      <VirtualOffice step={step} agents={agents} onOpenAgent={onOpenAgent} />

      <div className="overview-grid">
        <Card padding="lg" className="resources-card">
          <SectionHeader eyebrow="Maturité" title="Forces de l'entreprise IA" description="Chaque mission renforce un axe business spécifique." />
          <div className="resource-list">
            <ResourceRow label="Connaissance marché" value={metrics.marketKnowledge} />
            <ResourceRow label="Clarté produit" value={metrics.productClarity} />
            <ResourceRow label="Force de marque" value={metrics.brandStrength} />
            <ResourceRow label="Puissance d'acquisition" value={metrics.acquisitionPower} />
            <ResourceRow label="Traction" value={metrics.traction} />
          </div>
        </Card>

        <Card padding="lg" className="achievements-card">
          <SectionHeader
            eyebrow="Succès"
            title={`${unlockedAchievements.length} / ${achievements.length} débloqués`}
          />
          {unlockedAchievements.length === 0 ? (
            <EmptyState
              title="Aucun succès pour l'instant"
              description="Validez la première mission pour débloquer votre premier succès."
            />
          ) : (
            <ul className="achievement-list">
              {achievements.map((a) => {
                const unlocked = step >= a.unlockAt
                return (
                  <li key={a.id} className={unlocked ? 'ach-unlocked' : 'ach-locked'}>
                    <span className="ach-dot" aria-hidden />
                    <div>
                      <strong>{a.title}</strong>
                      <p className="muted">{a.description}</p>
                    </div>
                    <Badge tone={unlocked ? 'success' : 'neutral'} size="sm">
                      {unlocked ? 'Obtenu' : 'À venir'}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function ResourceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="resource-row">
      <ProgressBar
        value={value}
        label={label}
        showValue
        tone={value >= 70 ? 'success' : 'accent'}
      />
    </div>
  )
}

function MissionsTab({
  step,
  onSelect,
}: {
  step: number
  onSelect: (m: Mission) => void
}) {
  const agents = getAgents(step)
  return (
    <div className="quest-grid">
      {baseMissions.map((m) => (
        <MissionQuestCard
          key={m.id}
          mission={m}
          status={getMissionStatus(m, step)}
          agents={agents}
          onAction={onSelect}
        />
      ))}
    </div>
  )
}

function AgentsTab({
  step,
  onOpenAgent,
}: {
  step: number
  onOpenAgent: (id: string) => void
}) {
  const list = getAgents(step)
  return (
    <div className="agents-workspace">
      <SectionHeader
        eyebrow="Workers IA"
        title="Équipe active"
        description="Chaque agent possède un rôle, un état de travail, des compétences et un résultat attendu."
      />
      <div className="agent-grid">
        {list.map((a) => (
          <AgentCard key={a.id} agent={a} onOpen={() => onOpenAgent(a.id)} />
        ))}
      </div>
    </div>
  )
}

function CompanyMaturityCard({
  ventureName,
  maturity,
  activeAgents,
  completedMissions,
}: {
  ventureName: string
  maturity: ReturnType<typeof computeCompanyMaturity>
  activeAgents: number
  completedMissions: number
}) {
  return (
    <Card padding="lg" className="maturity-card">
      <div className="maturity-top">
        <div>
          <p className="eyebrow">Mon entreprise IA</p>
          <h2>{ventureName}</h2>
          <p className="muted small">
            {activeAgents} agent{activeAgents > 1 ? 's' : ''} actif{activeAgents > 1 ? 's' : ''} · {completedMissions} mission{completedMissions > 1 ? 's' : ''} validée{completedMissions > 1 ? 's' : ''}
          </p>
        </div>
        <div className="maturity-score">
          <span className="mono">{maturity.overall}%</span>
          <small>Maturité</small>
        </div>
      </div>
      <ProgressBar value={maturity.overall} label="Maturité de votre entreprise IA" showValue size="lg" />
      <div className="maturity-mini-grid">
        <MaturityMini label="Acquisition" value={maturity.acquisition} />
        <MaturityMini label="Automatisation" value={maturity.automation} />
        <MaturityMini label="Analyse" value={maturity.analysis} />
        <MaturityMini label="Contenu" value={maturity.content} />
        <MaturityMini label="Finance" value={maturity.finance} />
        <MaturityMini label="Support" value={maturity.support} />
      </div>
    </Card>
  )
}

function MaturityMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="maturity-mini">
      <span>{label}</span>
      <strong className="mono">{value}%</strong>
    </div>
  )
}

function VirtualOffice({
  step,
  agents,
  onOpenAgent,
}: {
  step: number
  agents: OperationalAgent[]
  onOpenAgent: (id: string) => void
}) {
  const departments: AgentDepartment[] = ['Acquisition', 'Marketing', 'Finance', 'Opérations', 'Support', 'Stratégie', 'Automatisation']
  const nextUnlock = baseAgents.find((agent) => step < agent.unlockAfter)

  return (
    <section className="virtual-office">
      <div className="office-head">
        <SectionHeader
          eyebrow="Bureau virtuel"
          title="Mon entreprise IA"
          description="Vue opérationnelle des départements, agents et missions en cours."
        />
        {nextUnlock && (
          <Badge tone="info" size="sm">Prochain agent · {nextUnlock.name}</Badge>
        )}
      </div>
      <div className="office-map">
        {departments.map((department) => {
          const departmentAgents = agents.filter((agent) => agent.department === department)
          return (
            <DepartmentZone
              key={department}
              department={department}
              agents={departmentAgents}
              onOpenAgent={onOpenAgent}
            />
          )
        })}
      </div>
    </section>
  )
}

function DepartmentZone({
  department,
  agents,
  onOpenAgent,
}: {
  department: AgentDepartment
  agents: OperationalAgent[]
  onOpenAgent: (id: string) => void
}) {
  const hasAgents = agents.length > 0
  const working = agents.some((agent) => agent.status === 'Working')

  return (
    <div className={`department-zone ${working ? 'department-working' : ''}`}>
      <div className="department-top">
        <span className="department-icon" aria-hidden>{departmentIcon(department)}</span>
        <div>
          <strong>{department}</strong>
          <span>{hasAgents ? `${agents.length} agent${agents.length > 1 ? 's' : ''}` : 'À débloquer'}</span>
        </div>
      </div>
      <div className="department-desks">
        {hasAgents ? agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className="desk-agent"
            onClick={() => onOpenAgent(agent.id)}
            aria-label={`Ouvrir la fiche de ${agent.name}`}
          >
            <AgentAvatar agent={agent} compact />
            <span>{agent.name}</span>
          </button>
        )) : (
          <div className="empty-desk">
            <span aria-hidden>+</span>
            <small>Département futur</small>
          </div>
        )}
      </div>
    </div>
  )
}

function AgentCard({ agent, onOpen }: { agent: OperationalAgent; onOpen: () => void }) {
  const meta = agentStatusMeta(agent.status)
  return (
    <Card padding="md" className={`agent-card agent-state-${agent.status.toLowerCase()}`} interactive>
      <button type="button" className="agent-card-button" onClick={onOpen}>
        <header className="agent-card-head">
          <AgentAvatar agent={agent} />
          <div className="agent-card-title">
            <h3>{agent.name}</h3>
            <p className="muted small">{agent.className} · {agent.role}</p>
          </div>
          <AgentStatusBadge status={agent.status} />
        </header>
        <div className="agent-work">
          <p>{agent.unlock ?? agent.mission}</p>
          {!agent.unlock && (
            <ProgressBar value={agent.progress} label={meta.progressLabel} showValue tone={meta.tone} />
          )}
        </div>
        <div className="agent-result">
          <span className="muted small">Résultat attendu</span>
          <strong>{agent.result}</strong>
        </div>
        <div className="stat-row">
          {Object.entries(agent.stats).slice(0, 4).map(([k, v]) => (
            <div key={k} className="stat-chip">
              <span>{k}</span>
              <span className="mono">{v}</span>
            </div>
          ))}
        </div>
      </button>
    </Card>
  )
}

function AgentAvatar({
  agent,
  compact,
}: {
  agent: OperationalAgent
  compact?: boolean
}) {
  return (
    <PixelAgent
      color={agent.avatar.color}
      status={agent.status}
      initials={agent.avatar.initials}
      size={compact ? 'sm' : 'md'}
      showAura={!compact}
    />
  )
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const meta = agentStatusMeta(status)
  return (
    <span className={`agent-status status-agent-${status.toLowerCase()}`}>
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  )
}

function AgentDetailModal({
  agent,
  onClose,
  onPrepareMission,
}: {
  agent: OperationalAgent
  onClose: () => void
  onPrepareMission: (missionId: string) => void
}) {
  const meta = agentStatusMeta(agent.status)
  const mission = agent.activeMission
  return (
    <Modal
      open
      onClose={onClose}
      title={`${agent.name} · Agent ${agent.className}`}
      footer={
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          {mission && (
            <Button onClick={() => onPrepareMission(mission.id)}>
              {agent.status === 'Result' || agent.status === 'Complete' ? 'Voir la mission' : 'Préparer la mission'}
            </Button>
          )}
        </div>
      }
    >
      <div className="agent-detail">
        <div className="agent-detail-hero">
          <AgentAvatar agent={agent} />
          <div>
            <AgentStatusBadge status={agent.status} />
            <h3>{agent.role}</h3>
            <p className="muted">{agent.personality}</p>
          </div>
        </div>

        <div className="agent-detail-grid">
          <div>
            <p className="eyebrow">Mission actuelle</p>
            <p>{mission?.title ?? agent.mission}</p>
          </div>
          <div>
            <p className="eyebrow">Niveau</p>
            <p className="mono">Niv. {agent.level}</p>
          </div>
          <div>
            <p className="eyebrow">Fiabilité</p>
            <p className="mono">{agent.reliability}%</p>
          </div>
          <div>
            <p className="eyebrow">Poste</p>
            <p>{agent.avatar.workspace}</p>
          </div>
        </div>

        {!agent.unlock && (
          <ProgressBar value={agent.progress} label={meta.progressLabel} showValue tone={meta.tone} size="lg" />
        )}

        <div className="agent-result-detail">
          <p className="eyebrow">Résultats générés</p>
          <ul>
            {agent.recentHistory.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="agent-skills">
          {agent.skills.map((skill) => (
            <Badge key={skill} tone="neutral" size="sm">{skill}</Badge>
          ))}
        </div>

        <div className="safety-note">
          <Badge tone="info" size="sm">Recommandation</Badge>
          <p className="muted small">{agent.recommendation}</p>
        </div>
      </div>
    </Modal>
  )
}

function agentStatusMeta(status: AgentStatus): {
  label: string
  icon: string
  tone: 'accent' | 'success' | 'warning'
  progressLabel: string
} {
  const table: Record<AgentStatus, { label: string; icon: string; tone: 'accent' | 'success' | 'warning'; progressLabel: string }> = {
    Ready: { label: 'Prêt', icon: '●', tone: 'accent', progressLabel: 'Disponibilité' },
    Working: { label: 'En mission', icon: '↻', tone: 'accent', progressLabel: 'Mission en cours' },
    Waiting: { label: 'En attente', icon: '◌', tone: 'warning', progressLabel: 'Attente utilisateur' },
    Complete: { label: 'Terminé', icon: '✓', tone: 'success', progressLabel: 'Travail terminé' },
    Blocked: { label: 'Bloqué', icon: '!', tone: 'warning', progressLabel: 'Action requise' },
    Upgrade: { label: 'À améliorer', icon: '↑', tone: 'warning', progressLabel: 'Optimisation' },
    Result: { label: 'Résultat dispo', icon: '✓', tone: 'success', progressLabel: 'Livrable prêt' },
    Locked: { label: 'Verrouillé', icon: '–', tone: 'warning', progressLabel: 'Déblocage' },
  }
  return table[status]
}

function departmentIcon(department: AgentDepartment): string {
  const icons: Record<AgentDepartment, string> = {
    Acquisition: '↗',
    Marketing: '◐',
    Finance: '∑',
    Opérations: '▦',
    Support: '◌',
    Stratégie: '◇',
    Automatisation: '⚙',
  }
  return icons[department]
}

function AssetsTab({
  step,
  onOpen,
}: {
  step: number
  onOpen: (id: string) => void
}) {
  const items = baseMissions.filter((m) => m.index <= step).map((m) => ({
    id: m.id,
    title: reports[m.id]?.title ?? m.output,
    type: m.type,
    quality: reports[m.id]?.qualityScore ?? 80,
    authors: reports[m.id]?.authors ?? '—',
  }))

  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucun asset pour l'instant"
        description="Validez votre première mission pour ajouter un livrable à la bibliothèque."
      />
    )
  }

  return (
    <div className="asset-grid">
      {items.map((a) => (
        <Card key={a.id} padding="md" className="asset-card" interactive>
          <div className="asset-card-top">
            <Badge tone="accent" size="sm">{a.type}</Badge>
            <Badge tone="success" size="sm">Approuvé</Badge>
          </div>
          <h3>{a.title}</h3>
          <p className="muted small">Créé par {a.authors}</p>
          <div className="asset-card-foot">
            <span className="muted small">Qualité <span className="mono">{a.quality}/100</span></span>
            <Button variant="ghost" size="sm" onClick={() => onOpen(a.id)}>
              Ouvrir →
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ---------- Mission detail modal ---------- */

function MissionDetailModal({
  mission,
  status,
  onClose,
  onStart,
}: {
  mission: Mission
  status: MissionStatus
  onClose: () => void
  onStart: () => void
}) {
  const playable = status === 'available'
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mission ${mission.index} · ${mission.title}`}
      footer={
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button onClick={onStart} disabled={!playable}>
            {playable ? 'Lancer la mission' : status === 'completed' ? 'Déjà terminée' : 'Verrouillée'}
          </Button>
        </div>
      }
    >
      <div className="mission-detail">
        <p className="muted">{mission.description}</p>
        <div className="mission-detail-grid">
          <div>
            <p className="eyebrow">Rareté</p>
            <RarityBadge rarity={mission.rarity} />
          </div>
          <div>
            <p className="eyebrow">Temps estimé</p>
            <p>{mission.estimatedTime}</p>
          </div>
          <div>
            <p className="eyebrow">Énergie</p>
            <p className="mono">{mission.energyCost} / 100</p>
          </div>
          <div>
            <p className="eyebrow">Difficulté</p>
            <p>{mission.difficulty}</p>
          </div>
          <div>
            <p className="eyebrow">Résultat attendu</p>
            <p>{mission.expectedResult}</p>
          </div>
          <div>
            <p className="eyebrow">Impact</p>
            <p>{mission.impact}</p>
          </div>
        </div>
        {status === 'locked' && mission.required && (
          <p className="muted small">Prérequis · {mission.required}</p>
        )}
        <div className="safety-note">
          <Badge tone="info" size="sm">Sécurité</Badge>
          <p className="muted small">Aucune action externe ne sera exécutée sans votre validation explicite.</p>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   EXECUTION
   ============================================================ */

export function ExecutionScreen({
  mission,
  brief,
  onReview,
  onCancel,
}: {
  mission: Mission
  brief: VentureBrief
  onReview: () => void
  onCancel: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [logCount, setLogCount] = useState(1)
  const activeAgents = getAgents(mission.index - 1).filter((agent) => mission.assignedAgentIds.includes(agent.id))

  useEffect(() => {
    const t = window.setInterval(() => {
      setProgress((p) => Math.min(p + 5, 100))
      setLogCount((c) => Math.min(c + 1, executionLogs.length))
    }, 220)
    return () => window.clearInterval(t)
  }, [])

  const currentStep = Math.min(Math.floor(progress / 20), executionSteps.length - 1)

  return (
    <section className="screen execution">
      <div className="execution-main">
        <header className="execution-head">
          <Badge tone="accent" size="sm">Mission {mission.index} en cours</Badge>
          <h1 className="page-title">{mission.title}</h1>
          <p className="muted">
            Les agents préparent <strong>{mission.output}</strong> à partir de votre brief ({brief.businessIdea}).
          </p>
        </header>

        <ProgressBar value={progress} size="lg" showValue label="Progression" />

        <div className="execution-stats">
          <Stat label="Progression" value={`${progress}%`} size="sm" />
          <Stat label="Agents actifs" value={activeAgents.length} size="sm" />
          <Stat label="Impact" value={mission.impact} size="sm" />
        </div>

        <div className="execution-agent-strip">
          {activeAgents.map((agent) => (
            <div key={agent.id} className="execution-agent">
              <AgentAvatar agent={agent} compact />
              <div>
                <strong>{agent.name}</strong>
                <span>{agent.avatar.workspace}</span>
              </div>
              <AgentStatusBadge status="Working" />
            </div>
          ))}
        </div>

        <ol className="execution-steps">
          {executionSteps.map((step, i) => (
            <li key={step} className={i <= currentStep ? 'done' : ''}>
              <span className="exec-bullet" aria-hidden />
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <div className="execution-actions">
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
          {progress >= 100 ? (
            <Button onClick={onReview}>Voir le livrable</Button>
          ) : (
            <Button disabled>En cours…</Button>
          )}
        </div>
      </div>

      <Card padding="md" className="execution-side">
        <SectionHeader eyebrow="Console de travail" title="Agents en mission" />
        <div className="execution-result-card">
          <p className="eyebrow">Résultat attendu</p>
          <strong>{mission.expectedResult}</strong>
          <span>{mission.estimatedTime} · {mission.difficulty}</span>
        </div>
        <div className="log-stream">
          {executionLogs.slice(0, logCount).map((log, i) => (
            <p key={i} className="log-line">
              <span className="mono dim">{String(i + 1).padStart(2, '0')}</span>
              <span>{log}</span>
            </p>
          ))}
          {logCount < executionLogs.length && (
            <div className="log-skeleton">
              <Skeleton width="60%" height={10} />
            </div>
          )}
        </div>
      </Card>
    </section>
  )
}

/* ============================================================
   REPORT (unified)
   ============================================================ */

export function ReportScreen({
  mission,
  brief,
  ventureName,
  onApprove,
  onCancel,
}: {
  mission: Mission
  brief: VentureBrief
  ventureName: string
  onApprove: () => void
  onCancel: () => void
}) {
  const report = reports[mission.id]
  if (!report) {
    return (
      <section className="screen">
        <EmptyState
          title="Livrable indisponible"
          description="Aucune donnée de rapport pour cette mission."
          action={<Button onClick={onCancel}>Retour</Button>}
        />
      </section>
    )
  }

  return (
    <section className="screen report-screen">
      <Card padding="lg" className="report">
        <header className="report-head">
          <div>
            <Badge tone="accent" size="sm">Livrable · Mission {mission.index}</Badge>
            <h1 className="page-title">{report.title}</h1>
            <p className="muted">{report.subtitle}</p>
            <p className="muted small">
              Créé par {report.authors} · Score qualité <span className="mono">{report.qualityScore}/100</span>
            </p>
          </div>
          <div className="quality-score">
            <span className="mono">{report.qualityScore}</span>
            <span className="muted small">/100</span>
          </div>
        </header>

        <div className="report-body">
          {report.sections.map((s) => (
            <section key={s.title} className="report-section">
              <h2>{s.title}</h2>
              <p>{s.body(brief, ventureName)}</p>
            </section>
          ))}
        </div>

        {report.footer && (
          <div className="report-footer-chips">
            {report.footer.map((f) => (
              <Badge key={f} tone="neutral" size="sm">{f}</Badge>
            ))}
          </div>
        )}

        <footer className="report-actions">
          <Button size="lg" onClick={onApprove}>{report.approveLabel}</Button>
          <Button size="lg" variant="secondary">Demander une amélioration</Button>
          <Button size="lg" variant="ghost">Modifier manuellement</Button>
          <Button size="lg" variant="ghost" onClick={onCancel}>Plus tard</Button>
        </footer>
      </Card>
    </section>
  )
}

/* ============================================================
   COMPLETE (mini reward screen)
   ============================================================ */

export function CompleteScreen({
  mission,
  step,
  onReturn,
}: {
  mission: Mission
  step: number
  onReturn: () => void
}) {
  const xpGain = computeXP(step) - computeXP(step - 1)
  const maturity = computeCompanyMaturity(step)
  const unlockedAgents = getAgents(step).filter((agent) => agent.unlockAfter === step)
  const rewardBadges = [
    { label: `+${xpGain} XP`, tone: 'accent' as const },
    { label: mission.output, tone: 'success' as const },
    { label: mission.impact, tone: 'info' as const },
    { label: `Maturité ${maturity.overall}%`, tone: 'neutral' as const },
  ]

  return (
    <section className="screen complete">
      <Card padding="lg" className="complete-card">
        <div className="reward-icon" aria-hidden>✓</div>
        <Badge tone="success" size="sm">Mission validée</Badge>
        <h1 className="page-title">{mission.title}</h1>
        <p className="muted">
          Le livrable a été ajouté à votre bibliothèque. La prochaine mission est désormais disponible.
        </p>
        <div className="reward-stats">
          <Stat label="XP gagnée" value={`+${xpGain}`} />
          <Stat label="Étapes" value={`${step} / 7`} />
          <Stat label="Niveau" value={`${computeFounderLevel(step)} · ${levelLabel(computeFounderLevel(step))}`} size="sm" />
        </div>
        <div className="reward-badges">
          {rewardBadges.map((badge) => (
            <Badge key={badge.label} tone={badge.tone} size="sm">{badge.label}</Badge>
          ))}
        </div>
        {unlockedAgents.length > 0 && (
          <div className="unlocked-agents">
            <p className="eyebrow">Nouveaux agents disponibles</p>
            {unlockedAgents.map((agent) => (
              <div key={agent.id} className="unlocked-agent">
                <AgentAvatar agent={agent} compact />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="complete-actions">
          <Button size="lg" onClick={onReturn}>Retour au QG</Button>
        </div>
      </Card>
    </section>
  )
}

/* ============================================================
   Asset preview modal (used from HQ)
   ============================================================ */

export function AssetPreviewModal({
  open,
  missionId,
  brief,
  ventureName,
  onClose,
}: {
  open: boolean
  missionId: string | null
  brief: VentureBrief
  ventureName: string
  onClose: () => void
}) {
  const report = missionId ? reports[missionId] : null
  if (!open || !report) return null

  function buildMarkdown() {
    if (!report) return ''
    const sections = report.sections
      .map((s) => `## ${s.title}\n\n${s.body(brief, ventureName)}`)
      .join('\n\n')
    return `# ${report.title}\n\n${sections}\n`
  }

  function copy() {
    void navigator.clipboard?.writeText(buildMarkdown())
  }

  function download() {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report!.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={report.title}
      footer={
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="secondary" onClick={download}>Exporter en Markdown</Button>
          <Button onClick={copy}>Copier</Button>
        </div>
      }
    >
      <p className="muted">{report.subtitle}</p>
      <div className="asset-modal-body">
        {report.sections.map((s) => (
          <section key={s.title} className="report-section">
            <h2>{s.title}</h2>
            <p>{s.body(brief, ventureName)}</p>
          </section>
        ))}
      </div>
    </Modal>
  )
}
