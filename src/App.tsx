import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './hq/hq-game.css'
import {
  AssetPreviewModal,
  BriefingScreen,
  CompleteScreen,
  ExecutionScreen,
  FirstResultScreen,
  GeneratingScreen,
  HQScreen,
  LandingScreen,
  ReportScreen,
  ScenarioScreen,
} from './screens'
import { defaultBrief, deriveVentureName, missions as baseMissions } from './data'
import { useTheme } from './theme'
import { Badge, Toast } from './components'
import { useToast } from './useToast'
import {
  computeAssetsCount,
  computeEnergy,
  computeFounderLevel,
  computeStageLabel,
  computeXP,
  levelLabel,
} from './state'
import { LevelUpModal } from './hq'
import type { HqTab, Mission, Screen, VentureBrief } from './types'

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [hqTab, setHqTab] = useState<HqTab>('overview')
  const [brief, setBrief] = useState<VentureBrief>(defaultBrief)
  const [step, setStep] = useState(0)
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [openAssetId, setOpenAssetId] = useState<string | null>(null)

  const { theme, toggle } = useTheme()
  const toast = useToast()

  const currentLevel = computeFounderLevel(step)
  const prevLevelRef = useRef(currentLevel)
  const [levelUp, setLevelUp] = useState<{ level: number; perks: string[] } | null>(null)

  useEffect(() => {
    if (currentLevel > prevLevelRef.current) {
      setLevelUp({ level: currentLevel, perks: levelUpPerks(currentLevel) })
    }
    prevLevelRef.current = currentLevel
  }, [currentLevel])

  const ventureName = useMemo(() => deriveVentureName(brief.businessIdea), [brief.businessIdea])

  const activeMission = useMemo<Mission | null>(
    () => baseMissions.find((m) => m.id === activeMissionId) ?? null,
    [activeMissionId],
  )

  const startMission = useCallback((m: Mission) => {
    setActiveMissionId(m.id)
    setScreen('execution')
  }, [])

  const approveMission = useCallback(() => {
    if (!activeMission) return
    const newStep = activeMission.index
    setStep((prev) => Math.max(prev, newStep))
    setScreen('complete')
  }, [activeMission])

  const returnToHQ = useCallback(() => {
    setActiveMissionId(null)
    setHqTab('missions')
    setScreen('hq')
    toast.show('Livrable ajouté à la bibliothèque', 'success')
  }, [toast])

  const runDemo = useCallback(() => {
    setStep(7)
    setHqTab('overview')
    setScreen('hq')
    toast.show('Démo chargée · parcours complet', 'info')
  }, [toast])

  // Keyboard shortcut: 'D' toggle theme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const showShell = screen !== 'landing'

  return (
    <div className="app">
      {showShell && (
        <AppShell
          screen={screen}
          step={step}
          hqTab={hqTab}
          theme={theme}
          onToggleTheme={toggle}
          ventureName={ventureName}
          onHome={() => {
            setScreen('hq')
            setHqTab('overview')
          }}
          onNav={(t) => {
            setScreen('hq')
            setHqTab(t)
          }}
        />
      )}

      <main className={`app-main ${showShell ? 'with-shell' : ''}`}>
        {screen === 'landing' && (
          <LandingScreen onStart={() => setScreen('scenario')} onDemo={runDemo} />
        )}
        {screen === 'scenario' && <ScenarioScreen onStart={() => setScreen('briefing')} />}
        {screen === 'briefing' && (
          <BriefingScreen
            brief={brief}
            onChange={setBrief}
            onGenerate={() => setScreen('generating')}
          />
        )}
        {screen === 'generating' && (
          <GeneratingScreen ventureName={ventureName} onDone={() => setScreen('first-result')} />
        )}
        {screen === 'first-result' && (
          <FirstResultScreen
            brief={brief}
            ventureName={ventureName}
            onDone={() => {
              setStep((prev) => Math.max(prev, 1))
              setHqTab('overview')
              setScreen('hq')
              toast.show('Premier résultat ajouté au QG', 'success')
            }}
          />
        )}
        {screen === 'hq' && (
          <HQScreen
            brief={brief}
            ventureName={ventureName}
            step={step}
            activeTab={hqTab}
            onTab={setHqTab}
            onStartMission={startMission}
            onOpenAsset={(id) => setOpenAssetId(id)}
          />
        )}
        {screen === 'execution' && activeMission && (
          <ExecutionScreen
            mission={activeMission}
            brief={brief}
            onReview={() => setScreen('report')}
            onCancel={() => {
              setActiveMissionId(null)
              setScreen('hq')
            }}
          />
        )}
        {screen === 'report' && activeMission && (
          <ReportScreen
            mission={activeMission}
            brief={brief}
            ventureName={ventureName}
            onApprove={approveMission}
            onCancel={() => {
              setActiveMissionId(null)
              setScreen('hq')
            }}
          />
        )}
        {screen === 'complete' && activeMission && (
          <CompleteScreen mission={activeMission} step={step} onReturn={returnToHQ} />
        )}
      </main>

      <AssetPreviewModal
        open={!!openAssetId}
        missionId={openAssetId}
        brief={brief}
        ventureName={ventureName}
        onClose={() => setOpenAssetId(null)}
      />

      <Toast
        open={toast.state.open}
        tone={toast.state.tone}
        message={toast.state.message}
        onClose={toast.hide}
      />

      <LevelUpModal
        open={!!levelUp}
        level={levelUp?.level ?? 1}
        perks={levelUp?.perks ?? []}
        onClose={() => setLevelUp(null)}
      />
    </div>
  )
}

function levelUpPerks(level: number): string[] {
  const table: Record<number, string[]> = {
    2: ['Architecte d\'Offre rejoint l\'équipe', 'Mission "Construction de l\'offre" débloquée', 'Bibliothèque ouverte'],
    3: ['Brand Builder activé', 'Direction de marque débloquée', 'Capacité +10 énergie'],
    4: ['Opérateur Croissance disponible', 'Plan d\'acquisition débloqué', 'Niveau "Business System"'],
    5: ['Premier test marché disponible', 'Tableau de bord traction', 'Mode "Autonomous Company"'],
  }
  return table[level] ?? ['Nouveau palier atteint', 'Nouvelles missions disponibles']
}

/* ============================================================
   AppShell : Sidebar + Header
   ============================================================ */

interface ShellProps {
  screen: Screen
  step: number
  hqTab: HqTab
  theme: 'light' | 'dark'
  ventureName: string
  onToggleTheme: () => void
  onHome: () => void
  onNav: (tab: HqTab) => void
}

function AppShell({
  screen,
  step,
  hqTab,
  theme,
  ventureName,
  onToggleTheme,
  onHome,
  onNav,
}: ShellProps) {
  const xp = computeXP(step)
  const energy = computeEnergy(step)
  const stage = computeStageLabel(step)
  const level = computeFounderLevel(step)
  const assets = computeAssetsCount(step)

  const navItems: { id: HqTab; label: string; icon: string }[] = [
    { id: 'overview', label: "Vue d'ensemble", icon: '◫' },
    { id: 'missions', label: 'Missions', icon: '◇' },
    { id: 'agents', label: 'Agents', icon: '◉' },
    { id: 'assets', label: 'Bibliothèque', icon: '▤' },
  ]

  return (
    <aside className="shell">
      <div className="shell-top">
        <button className="brand" onClick={onHome} type="button" aria-label="Retour au QG">
          <span className="brand-mark">A</span>
          <span className="brand-name">Autars</span>
        </button>

        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Changer de thème"
          title={`Passer en thème ${theme === 'light' ? 'sombre' : 'clair'}`}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </div>

      <div className="shell-profile">
        <div className="profile-avatar" aria-hidden>JH</div>
        <div className="profile-info">
          <strong>{ventureName}</strong>
          <span className="muted small">Niveau {level} · {levelLabel(level)}</span>
        </div>
      </div>

      <nav className="shell-nav" aria-label="Navigation principale">
        {navItems.map((item) => {
          const isActive = screen === 'hq' && hqTab === item.id
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'nav-active' : ''}`}
              onClick={() => onNav(item.id)}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="shell-stats">
        <p className="eyebrow">État du projet</p>
        <div className="shell-stat">
          <span className="muted small">Étape</span>
          <strong>{step} / 7</strong>
        </div>
        <div className="shell-stat">
          <span className="muted small">XP</span>
          <strong className="mono">{xp.toLocaleString('fr-FR')}</strong>
        </div>
        <div className="shell-stat">
          <span className="muted small">Énergie</span>
          <strong className="mono">{energy}/100</strong>
        </div>
        <div className="shell-stat">
          <span className="muted small">Assets</span>
          <strong className="mono">{assets}</strong>
        </div>
        <div className="shell-stage">
          <Badge tone="accent" size="sm">{stage}</Badge>
        </div>
      </div>

      <div className="shell-foot">
        <Badge tone="info" size="sm">Validation requise</Badge>
        <p className="muted small">Aucune action externe sans votre accord.</p>
      </div>
    </aside>
  )
}
