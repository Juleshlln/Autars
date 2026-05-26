import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleDotDashed,
  Clock3,
  Compass,
  Cpu,
  Eye,
  Flag,
  Gauge,
  KanbanSquare,
  Layers3,
  LineChart,
  LockKeyhole,
  LogIn,
  LogOut,
  Moon,
  Orbit,
  PanelsTopLeft,
  Play,
  Plus,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TimerReset,
  UserPlus,
  UsersRound,
  WalletCards,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTheme } from '../theme'
import type { Agent, MainGoal, Mission, Project, ProjectType } from '../lib/types'
import { useGame, type ActiveProduct, type AgentLifeState } from '../game/store'
import { useShallow } from 'zustand/react/shallow'
import { defaultAgents, mainGoals, projectTypes, quickActions } from './data'
import { useAutarsBackend } from './useAutarsBackend'
import type { ActivityEvent } from '../services/activityService'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  AgentsGamificationGrid,
  BusinessBadges,
  BusinessScoreCard,
  HQProgressHeader,
  MissionsRoadmap,
  NextBestMission,
  SkinsPanel,
  useGamification,
} from './gamification'
import './autars.css'

type Route = 'landing' | 'login' | 'signup' | 'onboarding' | 'dashboard'

const routePaths: Record<Route, string> = {
  landing: '/',
  login: '/login',
  signup: '/signup',
  onboarding: '/onboarding',
  dashboard: '/dashboard',
}

const agentIcons: Record<Agent['icon'], LucideIcon> = {
  compass: Compass,
  search: Search,
  builder: Layers3,
  growth: LineChart,
}

const PixiCanvas = lazy(() =>
  import('../game/PixiCanvas').then((module) => ({ default: module.PixiCanvas })),
)

function routeFromPath(pathname: string): Route {
  if (pathname.startsWith('/login')) return 'login'
  if (pathname.startsWith('/signup')) return 'signup'
  if (pathname.startsWith('/onboarding')) return 'onboarding'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  return 'landing'
}

export default function AutarsApp() {
  const backend = useAutarsBackend()
  const { state } = backend
  const {
    user,
    project,
    agents,
    missions,
    activity,
    mode,
    status,
    error,
    wallet,
    plan,
    creditError,
  } = state
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname))
  const { theme, toggle } = useTheme()

  const navigate = useCallback((next: Route, mode: 'push' | 'replace' = 'push') => {
    const path = routePaths[next]
    if (window.location.pathname !== path) {
      window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', path)
    }
    setRoute(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const startSignup = async (email: string, password?: string) => {
    try {
      await backend.signUp(email, password)
      navigate('onboarding')
    } catch {
      /* error surfaced through state.error */
    }
  }

  const signIn = async (email: string, password?: string) => {
    try {
      await backend.signIn(email, password)
      navigate(project ? 'dashboard' : 'onboarding')
    } catch {
      /* error surfaced through state.error */
    }
  }

  const logout = async () => {
    await backend.signOut()
    navigate('landing')
  }

  const completeOnboarding = async (payload: {
    name: string
    description: string
    projectType: ProjectType
    mainGoal: MainGoal
  }) => {
    if (!user) return
    try {
      await backend.createWorkspace(payload)
      navigate('dashboard')
    } catch {
      /* error surfaced through state.error */
    }
  }

  const createMission = (payload: { agentId: string; title: string; description: string }) => {
    void backend.createMission(payload)
  }

  const activeRoute: Route =
    (route === 'dashboard' || route === 'onboarding') && !user
      ? route === 'dashboard'
        ? 'login'
        : 'signup'
      : route === 'dashboard' && user && !project
        ? 'onboarding'
        : route

  const backendBanner =
    status === 'error' && error ? (
      <div className="backend-banner backend-banner-error" role="alert">
        <strong>Erreur backend</strong>
        <span>{error}</span>
      </div>
    ) : null

  const devHint =
    mode === 'local' && !isSupabaseConfigured ? (
      <div className="backend-banner backend-banner-info" role="status">
        <strong>Mode local</strong>
        <span>
          Supabase non configuré. Définissez <code>VITE_SUPABASE_URL</code> et{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code> pour activer les
          vraies données.
        </span>
      </div>
    ) : null

  return (
    <div className="autars-app">
      {backendBanner}
      {devHint}
      <AnimatePresence mode="wait">
        {activeRoute === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingPage
              theme={theme}
              onToggleTheme={toggle}
              onLogin={() => navigate('login')}
              onStart={() => navigate(user ? (project ? 'dashboard' : 'onboarding') : 'signup')}
            />
          </motion.div>
        )}
        {activeRoute === 'login' && (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AuthScreen
              mode="login"
              theme={theme}
              onToggleTheme={toggle}
              onHome={() => navigate('landing')}
              onSwitch={() => navigate('signup')}
              onSubmit={signIn}
            />
          </motion.div>
        )}
        {activeRoute === 'signup' && (
          <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AuthScreen
              mode="signup"
              theme={theme}
              onToggleTheme={toggle}
              onHome={() => navigate('landing')}
              onSwitch={() => navigate('login')}
              onSubmit={startSignup}
            />
          </motion.div>
        )}
        {activeRoute === 'onboarding' && user && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OnboardingPage
              theme={theme}
              onToggleTheme={toggle}
              onLogout={logout}
              onComplete={completeOnboarding}
            />
          </motion.div>
        )}
        {activeRoute === 'dashboard' && user && project && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardPage
              userName={user.name}
              theme={theme}
              project={project}
              agents={agents.length ? agents : hydrateAgents(project.id)}
              missions={missions}
              activity={activity}
              backendMode={mode}
              wallet={wallet}
              plan={plan}
              creditError={creditError}
              onClearCreditError={backend.clearCreditError}
              onToggleTheme={toggle}
              onLogout={logout}
              onCreateMission={createMission}
              onRunMission={backend.runMission}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function hydrateAgents(projectId: string): Agent[] {
  return defaultAgents.map((agent) => ({
    ...agent,
    projectId,
    createdAt: new Date().toISOString(),
  }))
}

function LandingPage({
  theme,
  onToggleTheme,
  onLogin,
  onStart,
}: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onLogin: () => void
  onStart: () => void
}) {
  return (
    <>
      <LandingNav
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogin={onLogin}
        onStart={onStart}
      />
      <main>
        <section className="hero-section">
          <div className="hero-grid">
            <motion.div
              className="hero-copy"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="hero-badge">
                <Sparkles size={16} />
                Le QG IA pour lancer et piloter votre activité
              </div>
              <h1>Construisez votre entreprise avec une équipe d'agents IA</h1>
              <p>
                Autars transforme votre idée en un QG opérationnel : stratégie,
                marché, offre, acquisition et exécution, pilotés avec des agents IA
                spécialisés.
              </p>
              <div className="hero-actions">
                <button type="button" className="primary-cta" onClick={onStart}>
                  Créer mon QG
                  <ArrowRight size={18} />
                </button>
                <a className="secondary-cta" href="#fonctionnement">
                  <Play size={17} />
                  Voir comment ça marche
                </a>
              </div>
            </motion.div>
            <HeroCommandVisual />
          </div>
        </section>

        <ProblemSection />
        <SolutionSection />
        <AgentsSection />
        <ExperienceSection />
        <BenefitsSection />
        <FinalCta onStart={onStart} />
      </main>
      <Footer />
    </>
  )
}

function LandingNav({
  theme,
  onToggleTheme,
  onLogin,
  onStart,
}: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onLogin: () => void
  onStart: () => void
}) {
  return (
    <header className="site-nav">
      <a href="/" className="brand">
        <span className="brand-mark">A</span>
        <span>Autars</span>
      </a>
      <nav aria-label="Navigation principale">
        <a href="#fonctionnement">Fonctionnement</a>
        <a href="#agents">Agents</a>
        <a href="#produit">Produit</a>
        <a href="#vision">Vision</a>
      </nav>
      <div className="nav-actions">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button type="button" className="text-button" onClick={onLogin}>
          Se connecter
        </button>
        <button type="button" className="compact-cta" onClick={onStart}>
          Créer mon QG
        </button>
      </div>
    </header>
  )
}

function HeroCommandVisual() {
  return (
    <motion.div
      className="hero-visual"
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15, duration: 0.6 }}
    >
      <div className="visual-glow" aria-hidden />
      <div className="command-panel panel-main">
        <div className="panel-top">
          <div>
            <span className="panel-kicker">QG opérationnel</span>
            <strong>Atelier Nova</strong>
          </div>
          <span className="live-pill">
            <span />
            Actif
          </span>
        </div>
        <div className="mission-track">
          {['Idée', 'Marché', 'Offre', 'Clients'].map((step, index) => (
            <div className={`track-node ${index < 2 ? 'done' : index === 2 ? 'current' : ''}`} key={step}>
              <span>{index + 1}</span>
              <em>{step}</em>
            </div>
          ))}
        </div>
        <div className="hero-mission-card">
          <div className="mini-icon">
            <Target size={18} />
          </div>
          <div>
            <strong>Mission en cours</strong>
            <p>Construire l'offre testable</p>
          </div>
          <div className="ring-progress">64%</div>
        </div>
      </div>

      <motion.div className="floating-card agent-card-one" animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 5 }}>
        <div className="agent-orb strategist">
          <Compass size={18} />
        </div>
        <div>
          <strong>Stratège</strong>
          <span>Décision prête</span>
        </div>
      </motion.div>

      <motion.div className="floating-card agent-card-two" animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 6, delay: 0.4 }}>
        <div className="agent-orb growth">
          <LineChart size={18} />
        </div>
        <div>
          <strong>Growth Agent</strong>
          <span>3 canaux proposés</span>
        </div>
      </motion.div>

      <div className="command-panel side-panel">
        <span className="panel-kicker">Agents actifs</span>
        <div className="agent-stack">
          <span style={{ '--agent-color': '#6c6ce3' } as CSSProperties}>S</span>
          <span style={{ '--agent-color': '#1aa6a6' } as CSSProperties}>M</span>
          <span style={{ '--agent-color': '#f29d38' } as CSSProperties}>B</span>
          <span style={{ '--agent-color': '#40b77a' } as CSSProperties}>G</span>
        </div>
        <div className="side-progress">
          <span />
        </div>
      </div>
    </motion.div>
  )
}

function ProblemSection() {
  const items = [
    { icon: CircleDotDashed, title: 'Trop de fronts ouverts', text: 'Stratégie, produit, acquisition et opérations arrivent tous en même temps.' },
    { icon: Brain, title: 'Clarté fragile', text: "L'idée existe, mais les décisions clés restent dispersées ou implicites." },
    { icon: TimerReset, title: 'Exécution lente', text: 'Les prochaines actions ne sont pas toujours visibles, priorisées et suivies.' },
    { icon: Workflow, title: 'IA dispersée', text: 'Les outils aident ponctuellement, sans construire un système de travail durable.' },
  ]

  return (
    <AnimatedSection id="vision" className="content-section problem-section">
      <SectionIntro
        eyebrow="Le vrai blocage"
        title="Entre l'idée et l'exécution, il manque souvent un système."
        text="Autars remplace la page blanche par un espace qui organise les décisions, les missions et les livrables."
      />
      <div className="problem-grid">
        {items.map((item) => (
          <article className="soft-card" key={item.title}>
            <item.icon size={22} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </AnimatedSection>
  )
}

function SolutionSection() {
  const pillars = [
    { icon: PanelsTopLeft, title: 'Créez votre QG', text: 'Un espace unique pour votre projet, vos décisions et vos prochaines étapes.' },
    { icon: UsersRound, title: 'Activez vos agents', text: 'Chaque agent a un rôle clair, un statut et une mission utile.' },
    { icon: BadgeCheck, title: 'Validez les livrables', text: 'Les missions deviennent des sorties concrètes que vous pouvez relire, ajuster et utiliser.' },
  ]

  return (
    <AnimatedSection id="fonctionnement" className="content-section solution-section">
      <div className="split-layout">
        <SectionIntro
          eyebrow="La solution"
          title="Un QG d'entreprise IA, pas une simple conversation."
          text="Au lieu de discuter avec une IA isolée, vous construisez un espace de travail vivant où chaque agent a un rôle clair."
        />
        <div className="progress-rail">
          {pillars.map((pillar, index) => (
            <article className="rail-item" key={pillar.title}>
              <div className="rail-index">
                <pillar.icon size={20} />
              </div>
              <div>
                <span>0{index + 1}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </div>
              {index < pillars.length - 1 && <div className="rail-line" aria-hidden />}
            </article>
          ))}
        </div>
      </div>
    </AnimatedSection>
  )
}

function AgentsSection() {
  return (
    <AnimatedSection id="agents" className="content-section agents-section">
      <SectionIntro
        eyebrow="Équipe IA"
        title="Quatre agents pour transformer l'intention en mouvement."
        text="La V1 commence volontairement simple : une équipe lisible, des statuts visibles et des missions lancées en un clic."
      />
      <div className="agent-grid">
        {defaultAgents.map((agent, index) => {
          const Icon = agentIcons[agent.icon]
          return (
            <motion.article
              className="agent-profile-card"
              key={agent.id}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              <div className="agent-card-head">
                <span className="agent-avatar" style={{ '--accent': agent.accent } as CSSProperties}>
                  <Icon size={23} />
                </span>
                <span className={`agent-status status-${agent.status.replace(' ', '-')}`}>
                  {agent.status}
                </span>
              </div>
              <span className="agent-number">0{index + 1}</span>
              <h3>{agent.name}</h3>
              <p>{agent.role}</p>
              <div className="mission-preview">
                <KanbanSquare size={17} />
                <span>{agent.exampleMission}</span>
              </div>
            </motion.article>
          )
        })}
      </div>
    </AnimatedSection>
  )
}

function ExperienceSection() {
  return (
    <AnimatedSection id="produit" className="content-section experience-section">
      <div className="experience-copy">
        <SectionIntro
          eyebrow="Experience QG"
          title="Vous gardez les décisions importantes. Les agents vous aident à avancer."
          text="Le dashboard donne une lecture claire du projet : agents actifs, missions en cours, actions rapides et validations à traiter."
        />
      </div>
      <div className="dashboard-preview">
        <div className="preview-header">
          <div>
            <span className="panel-kicker">Projet utilisateur</span>
            <strong>Maison Pilote</strong>
          </div>
          <button type="button">
            <Plus size={16} />
            Nouvelle action
          </button>
        </div>
        <div className="preview-grid">
          <div className="preview-column">
            <MiniMetric icon={Gauge} label="Clarté" value="72%" />
            <MiniMetric icon={Zap} label="Actions" value="5" />
            <MiniMetric icon={WalletCards} label="Offre" value="Draft" />
          </div>
          <div className="preview-board">
            <PreviewMission title="Offre testable" agent="Builder" progress={64} />
            <PreviewMission title="Analyse concurrents" agent="Analyste Marché" progress={42} />
            <PreviewMission title="Canaux acquisition" agent="Growth Agent" progress={28} />
          </div>
          <div className="decision-panel">
            <span className="panel-kicker">À valider</span>
            <strong>Choisir la cible prioritaire</strong>
            <p>3 options proposées par le Stratège.</p>
            <button type="button">Examiner</button>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}

function BenefitsSection() {
  const benefits = [
    { icon: Eye, title: 'Clarifier son idée plus vite', text: "Passez d'une intuition floue à une direction exploitable." },
    { icon: BriefcaseBusiness, title: 'Structurer son offre', text: 'Rendez la promesse, le prix et les livrables plus nets.' },
    { icon: Rocket, title: "Passer à l'action", text: 'Transformez les décisions en missions visibles.' },
    { icon: ShieldCheck, title: 'Garder une vision claire', text: "Suivez l'avancement sans perdre le contrôle du business." },
  ]

  return (
    <AnimatedSection className="content-section benefits-section">
      <div className="benefit-grid">
        {benefits.map((benefit) => (
          <article className="benefit-card" key={benefit.title}>
            <benefit.icon size={22} />
            <h3>{benefit.title}</h3>
            <p>{benefit.text}</p>
          </article>
        ))}
      </div>
    </AnimatedSection>
  )
}

function FinalCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="final-cta">
      <div className="final-cta-inner">
        <Sparkles size={22} />
        <h2>Prêt à créer votre QG d'entreprise IA ?</h2>
        <p>
          Lancez votre espace, activez vos premiers agents et transformez votre idée
          en plan d'action.
        </p>
        <button type="button" className="primary-cta" onClick={onStart}>
          Créer mon QG
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="brand">
        <span className="brand-mark">A</span>
        <span>Autars</span>
      </div>
      <p>Le QG IA pour transformer une idée en actions concrètes.</p>
      <nav aria-label="Liens de pied de page">
        <a href="#fonctionnement">Fonctionnement</a>
        <a href="#agents">Agents</a>
        <a href="#produit">Produit</a>
      </nav>
    </footer>
  )
}

function AuthScreen({
  mode,
  theme,
  onToggleTheme,
  onHome,
  onSwitch,
  onSubmit,
}: {
  mode: 'login' | 'signup'
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onHome: () => void
  onSwitch: () => void
  onSubmit: (email: string, password: string) => void | Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const isSignup = mode === 'signup'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.includes('@') || password.length < 6) {
      setError('Utilisez un email valide et un mot de passe de 6 caractères minimum.')
      return
    }
    setError('')
    void onSubmit(email.trim().toLowerCase(), password)
  }

  return (
    <main className="auth-page">
      <header className="auth-nav">
        <button type="button" className="brand brand-button" onClick={onHome}>
          <span className="brand-mark">A</span>
          <span>Autars</span>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <section className="auth-grid">
        <div className="auth-panel">
          <div className="auth-icon">
            {isSignup ? <UserPlus size={22} /> : <LogIn size={22} />}
          </div>
          <h1>{isSignup ? 'Créer votre compte' : 'Se connecter'}</h1>
          <p>
            {isSignup
              ? 'Initialisez votre espace Autars et creez votre premier QG.'
              : 'Reprenez votre QG et vos missions en cours.'}
          </p>
          <form onSubmit={submit} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vous@entreprise.com"
                autoComplete="email"
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 caractères"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="primary-cta auth-submit">
              {isSignup ? 'Créer un compte' : 'Se connecter'}
              <ChevronRight size={18} />
            </button>
          </form>
          <button type="button" className="auth-switch" onClick={onSwitch}>
            {isSignup ? 'J ai dejà un compte' : 'Créer un compte'}
          </button>
        </div>
        <AuthVisual />
      </section>
    </main>
  )
}

function AuthVisual() {
  return (
    <aside className="auth-visual">
      <div className="auth-visual-card">
        <div className="panel-top">
          <div>
            <span className="panel-kicker">QG prive</span>
            <strong>Nouvelle entreprise</strong>
          </div>
          <LockKeyhole size={18} />
        </div>
        <div className="auth-agent-row">
          <span><Compass size={18} /></span>
          <span><Search size={18} /></span>
          <span><Layers3 size={18} /></span>
          <span><LineChart size={18} /></span>
        </div>
        <div className="auth-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
    </aside>
  )
}

function OnboardingPage({
  theme,
  onToggleTheme,
  onLogout,
  onComplete,
}: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onLogout: () => void
  onComplete: (payload: {
    name: string
    description: string
    projectType: ProjectType
    mainGoal: MainGoal
  }) => void
}) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('Startup')
  const [mainGoal, setMainGoal] = useState<MainGoal>('Clarifier mon idée')
  const canContinue = step !== 1 || name.trim().length > 1

  const next = () => {
    if (step < 4) setStep((current) => current + 1)
    else {
      onComplete({
        name: name.trim() || 'Mon QG Autars',
        description: description.trim() || 'Projet en cours de structuration avec Autars.',
        projectType,
        mainGoal,
      })
    }
  }

  return (
    <main className="onboarding-page">
      <header className="dashboard-top onboarding-top">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>Autars</span>
        </div>
        <div className="dashboard-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="icon-text-button" onClick={onLogout}>
            <LogOut size={17} />
            Sortir
          </button>
        </div>
      </header>
      <section className="onboarding-shell">
        <aside className="onboarding-aside">
          <span className="panel-kicker">Creation du QG</span>
          <h1>Configurez votre premier espace de pilotage.</h1>
          <div className="onboarding-progress">
            {[1, 2, 3, 4].map((item) => (
              <span key={item} className={item <= step ? 'active' : ''} />
            ))}
          </div>
          <p>Une base simple : projet, type, objectif et première équipe d'agents.</p>
        </aside>
        <div className="onboarding-card">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step-1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <StepTitle icon={Building2} label="Étape 1" title="Nom du projet" />
                <div className="form-stack">
                  <label>
                    Nom de l'entreprise ou du projet
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Maison Pilote" />
                  </label>
                  <label>
                    Description courte
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ce que vous voulez construire, pour qui, et pourquoi maintenant." />
                  </label>
                </div>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="step-2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <StepTitle icon={Flag} label="Étape 2" title="Type de projet" />
                <ChoiceGrid>
                  {projectTypes.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      selected={projectType === option.value}
                      title={option.value}
                      text={option.description}
                      onClick={() => setProjectType(option.value)}
                    />
                  ))}
                </ChoiceGrid>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="step-3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <StepTitle icon={Target} label="Étape 3" title="Objectif principal" />
                <ChoiceGrid>
                  {mainGoals.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      selected={mainGoal === option.value}
                      title={option.value}
                      text={option.description}
                      onClick={() => setMainGoal(option.value)}
                    />
                  ))}
                </ChoiceGrid>
              </motion.div>
            )}
            {step === 4 && (
              <motion.div key="step-4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <StepTitle icon={Cpu} label="Étape 4" title="Génération du QG" />
                <div className="generation-summary">
                  <div>
                    <span>Projet</span>
                    <strong>{name || 'Mon QG Autars'}</strong>
                  </div>
                  <div>
                    <span>Type</span>
                    <strong>{projectType}</strong>
                  </div>
                  <div>
                    <span>Objectif</span>
                    <strong>{mainGoal}</strong>
                  </div>
                </div>
                <div className="mini-agent-team">
                  {defaultAgents.map((agent) => {
                    const Icon = agentIcons[agent.icon]
                    return (
                      <span key={agent.id} style={{ '--accent': agent.accent } as CSSProperties}>
                        <Icon size={18} />
                        {agent.name}
                      </span>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <footer className="onboarding-footer">
            <button type="button" className="secondary-cta" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>
              Retour
            </button>
            <button type="button" className="primary-cta" disabled={!canContinue} onClick={next}>
              {step === 4 ? 'Créer mon QG' : 'Continuer'}
              <ArrowRight size={18} />
            </button>
          </footer>
        </div>
      </section>
    </main>
  )
}

function DashboardPage({
  userName,
  theme,
  project,
  agents,
  missions,
  activity,
  backendMode,
  wallet,
  plan,
  creditError,
  onClearCreditError,
  onToggleTheme,
  onLogout,
  onCreateMission,
  onRunMission,
}: {
  userName: string
  theme: 'light' | 'dark'
  project: Project
  agents: Agent[]
  missions: Mission[]
  activity: ActivityEvent[]
  backendMode: 'supabase' | 'local'
  wallet: { balance: number; monthlyAllowance: number } | null
  plan: { id: string; name: string; monthlyCredits: number } | null
  creditError: string | null
  onClearCreditError: () => void
  onToggleTheme: () => void
  onLogout: () => void
  onCreateMission: (payload: { agentId: string; title: string; description: string }) => void
  onRunMission: (missionId: string) => Promise<void>
}) {
  const [modal, setModal] = useState<{
    title: string
    description: string
    agentId: string
    selectedAgentId: string
    missionDescription: string
  } | null>(null)

  const [resultModalMissionId, setResultModalMissionId] = useState<string | null>(null)
  const insufficientBalance = Boolean(wallet && wallet.balance <= 0)

  const monitorRef = useRef<HTMLDivElement>(null)
  const lastDeliveredRef = useRef(0)

  const gamification = useGamification(project.id)

  const liveAgents = useMemo(
    () =>
      agents.map((agent) => {
        const hasMission = missions.some(
          (mission) => mission.agentId === agent.id && mission.status === 'en cours',
        )
        return hasMission ? { ...agent, status: 'travaille' as const } : agent
      }),
    [agents, missions],
  )

  useDashboardAgentsInQG(project, liveAgents, missions)

  const qgStats = useMemo(() => {
    const working = liveAgents.filter((agent) => agent.status === 'travaille').length
    const delivered = missions.filter((mission) => mission.status === 'terminee').length
    const averageProgress =
      missions.length === 0
        ? 0
        : Math.round(missions.reduce((total, mission) => total + mission.progress, 0) / missions.length)

    return {
      working,
      delivered,
      averageProgress,
      total: liveAgents.length,
    }
  }, [liveAgents, missions])

  useEffect(() => {
    const prev = lastDeliveredRef.current
    lastDeliveredRef.current = qgStats.delivered
    if (qgStats.delivered <= prev) return
    const host = monitorRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const originX = (rect.left + rect.width / 2) / window.innerWidth
    const originY = (rect.top + rect.height * 0.5) / window.innerHeight
    const colors = ['#6c6ce3', '#22d3ee', '#34d399', '#c084fc']
    confetti({
      particleCount: 70,
      spread: 70,
      startVelocity: 32,
      gravity: 0.9,
      origin: { x: originX, y: Math.min(0.92, originY) },
      colors,
      scalar: 0.85,
      disableForReducedMotion: true,
    })
    confetti({
      particleCount: 30,
      angle: 60,
      spread: 55,
      origin: { x: Math.max(0.02, originX - 0.18), y: originY },
      colors,
      disableForReducedMotion: true,
    })
    confetti({
      particleCount: 30,
      angle: 120,
      spread: 55,
      origin: { x: Math.min(0.98, originX + 0.18), y: originY },
      colors,
      disableForReducedMotion: true,
    })
  }, [qgStats.delivered])

  const openMissionModal = (payload: { title: string; description: string; agentId: string }) => {
    setModal({
      ...payload,
      selectedAgentId: payload.agentId,
      missionDescription: payload.description,
    })
  }

  const launchMission = () => {
    if (!modal || !modal.selectedAgentId) return
    onCreateMission({
      agentId: modal.selectedAgentId,
      title: modal.title,
      description: modal.missionDescription.trim() || modal.description,
    })
    setModal(null)
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-top">
        <div>
          <span className="panel-kicker">QG d'entreprise IA</span>
          <h1>{project.name}</h1>
        </div>
        <div className="dashboard-actions">
          {wallet ? (
            <div
              className="credits-chip"
              title={plan ? `Plan ${plan.name} · ${plan.monthlyCredits} crédits/mois` : 'Crédits restants'}
            >
              <WalletCards size={15} />
              <span className="credits-chip-balance">{wallet.balance}</span>
              <span className="credits-chip-unit">crédit{wallet.balance > 1 ? 's' : ''}</span>
              {plan ? <span className="credits-chip-plan">· {plan.name}</span> : null}
            </div>
          ) : null}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="icon-text-button"
            onClick={() => openMissionModal(quickActions[0])}
            disabled={Boolean(wallet && wallet.balance <= 0)}
            title={
              wallet && wallet.balance <= 0
                ? 'Crédits insuffisants pour lancer une nouvelle action.'
                : undefined
            }
          >
            <Plus size={17} />
            Nouvelle action
          </button>
          <button type="button" className="profile-button" onClick={onLogout}>
            <span>{initials(userName)}</span>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {creditError ? (
        <div className="backend-banner backend-banner-error credits-banner" role="alert">
          <strong>Crédits insuffisants</strong>
          <span>{creditError}</span>
          <button
            type="button"
            className="banner-dismiss"
            onClick={onClearCreditError}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="dashboard-hero">
        <div className="project-brief">
          <span className="live-pill">
            <span />
            Projet actif
          </span>
          <h2>{project.description}</h2>
          <div className="project-meta">
            <span><Building2 size={16} />{project.projectType}</span>
            <span><Target size={16} />{project.mainGoal}</span>
            <span><Clock3 size={16} />Créé le {formatDate(project.createdAt)}</span>
          </div>
        </div>
        <div className="hq-score-card">
          <Gauge size={22} />
          <span>Progression QG</span>
          <strong>{Math.min(86, 34 + missions.length * 8)}%</strong>
          <div className="progress-line">
            <span style={{ width: `${Math.min(86, 34 + missions.length * 8)}%` }} />
          </div>
        </div>
      </section>

      <HQProgressHeader api={gamification} projectName={project.name} />

      <section
        ref={monitorRef}
        className="live-qg-monitor"
        aria-label="Moniteur live du QG"
        data-attention={qgStats.delivered > 0 ? 'true' : 'false'}
        data-active={qgStats.working > 0 ? 'true' : 'false'}
      >
        <div className="live-qg-bezel">
          <div className="live-qg-bezel-left">
            <span className="live-qg-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <strong>autars://{project.name.replace(/\s+/g, '-').toLowerCase()}/qg-live</strong>
          </div>
          <div className="live-qg-bezel-center" aria-hidden>
            <span className="live-qg-rec">
              <i />
              LIVE
            </span>
          </div>
          <div className="live-qg-metrics" aria-label="État des agents">
            <span>{qgStats.working}/{qgStats.total} agents actifs</span>
            <span>{qgStats.averageProgress}% progression moyenne</span>
            {qgStats.delivered > 0 && <strong>{qgStats.delivered} livrable{qgStats.delivered > 1 ? 's' : ''}</strong>}
          </div>
        </div>
        <div className="live-qg-screen">
          <Suspense fallback={<div className="live-qg-loading">Initialisation QG live</div>}>
            <PixiCanvas className="v1-qg-canvas" />
          </Suspense>
          <div className="live-qg-grid" aria-hidden />
          <div className="live-qg-scan" aria-hidden />
          <div className="live-qg-glow" aria-hidden />
          <div className="live-qg-corners" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="live-qg-floating-status" aria-hidden>
            <span className={qgStats.delivered > 0 ? 'is-attention' : qgStats.working > 0 ? 'is-active' : ''}>
              <i />
              {qgStats.delivered > 0 ? 'Validation requise' : qgStats.working > 0 ? 'Flux actifs' : 'Veille active'}
            </span>
          </div>
          <div className="live-qg-legend" aria-hidden>
            <span><i className="dot dot-working" />En mission</span>
            <span><i className="dot dot-delivered" />Livrable</span>
            <span><i className="dot dot-core" />Autars Core</span>
          </div>
        </div>
      </section>

      <section className="dashboard-layout">
        <div className="dashboard-main-column">
          <NextBestMission
            mission={gamification.nextBestMission}
            onStart={gamification.startMission}
          />

          <MissionsRoadmap
            missions={gamification.missions}
            agents={gamification.agents}
            onStart={gamification.startMission}
            onComplete={gamification.completeMission}
            onValidate={gamification.validateMission}
          />

          <DashboardSection
            title="Agents IA"
            subtitle="Votre première équipe opérationnelle."
            action={<span>{liveAgents.length} agents</span>}
          >
            <div className="dashboard-agent-grid">
              {liveAgents.map((agent) => {
                const Icon = agentIcons[agent.icon]
                return (
                  <article className="dashboard-agent-card" key={agent.id}>
                    <div className="agent-card-head">
                      <span className="agent-avatar" style={{ '--accent': agent.accent } as CSSProperties}>
                        <Icon size={22} />
                      </span>
                      <span className={`agent-status status-${agent.status.replace(' ', '-')}`}>
                        {agent.status}
                      </span>
                    </div>
                    <h3>{agent.name}</h3>
                    <p>{agent.role}</p>
                    <button
                      type="button"
                      className="mission-button"
                      onClick={() =>
                        openMissionModal({
                          title: agent.exampleMission,
                          description: agent.exampleMission,
                          agentId: agent.id,
                        })
                      }
                    >
                      Lancer une mission
                      <ChevronRight size={16} />
                    </button>
                  </article>
                )
              })}
            </div>
          </DashboardSection>

          <DashboardSection title="Missions en cours" subtitle="Les agents exécutent, vous gardez la validation.">
            <div className="mission-list">
              {[...missions]
                .sort((a, b) => {
                  const oa = a.orderIndex ?? 9999
                  const ob = b.orderIndex ?? 9999
                  if (oa !== ob) return oa - ob
                  return a.createdAt.localeCompare(b.createdAt)
                })
                .map((mission) => {
                  const agent = liveAgents.find((item) => item.id === mission.agentId)
                  const cost = mission.costCredits ?? 1
                  const isTodo = mission.status === 'en attente'
                  const isDoing = mission.status === 'en cours'
                  const isDone = mission.status === 'terminee'
                  const cantLaunch = isTodo && wallet !== null && wallet.balance < cost
                  return (
                    <article className="mission-row" key={mission.id}>
                      <div className="mission-row-main">
                        <div className="mini-icon">
                          <KanbanSquare size={18} />
                        </div>
                        <div>
                          <h3>{mission.title}</h3>
                          <p>
                            {agent?.name ?? 'Agent'} · {mission.status} ·{' '}
                            {formatDate(mission.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="mission-progress">
                        <span>{mission.progress}%</span>
                        <div className="progress-line">
                          <span style={{ width: `${mission.progress}%` }} />
                        </div>
                      </div>
                      <div className="mission-row-footer">
                        <span className="mission-cost-chip" title="Coût en crédits">
                          <WalletCards size={12} />
                          {cost} crédit{cost > 1 ? 's' : ''}
                        </span>
                        {isTodo && (
                          <button
                            type="button"
                            className="mission-action-btn mission-action-launch"
                            disabled={cantLaunch}
                            onClick={() => void onRunMission(mission.id)}
                            title={
                              cantLaunch
                                ? 'Crédits insuffisants.'
                                : "Faire travailler l'agent"
                            }
                          >
                            <Play size={13} />
                            Lancer
                          </button>
                        )}
                        {isDoing && (
                          <span className="mission-action-badge">
                            <CircleDotDashed size={12} />
                            En cours
                          </span>
                        )}
                        {isDone && (
                          <button
                            type="button"
                            className="mission-action-btn mission-action-result"
                            onClick={() => setResultModalMissionId(mission.id)}
                            disabled={!mission.result}
                            title={mission.result ? 'Voir le résultat' : 'Résultat indisponible'}
                          >
                            <Check size={13} />
                            Voir le résultat
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
            </div>
          </DashboardSection>

          <AgentsGamificationGrid
            agents={gamification.agents}
            skins={gamification.skins}
            onSelectSkin={gamification.selectAgentSkin}
          />

          <NetworkConsoleSection />
        </div>

        <aside className="dashboard-side-column">
          <BusinessScoreCard scores={gamification.dimensionScores} />
          <DashboardSection title="Actions rapides" subtitle="Lancez une mission simple.">
            <div className="quick-action-list">
              {quickActions.map((action) => (
                <button type="button" key={action.id} onClick={() => openMissionModal(action)}>
                  <span>{action.title}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </DashboardSection>
          {backendMode === 'supabase' && (
            <ActivityFeedSection events={activity} />
          )}
          <InfrastructureSection />
          <BusinessBadges badges={gamification.badges} />
          <DashboardSection title="Décisions à valider" subtitle="Contrôle fondateur.">
            <div className="decision-list">
              <div>
                <Check size={16} />
                Cible prioritaire proposée
              </div>
              <div>
                <Check size={16} />
                Offre de départ à relire
              </div>
              <div>
                <Check size={16} />
                3 canaux à choisir
              </div>
            </div>
          </DashboardSection>
        </aside>
      </section>

      <SkinsPanel
        skins={gamification.skins}
        agents={gamification.agents}
        activeHQSkinId={gamification.activeHQSkinId}
        hqLevel={gamification.hqLevel}
        onSelectHQSkin={gamification.selectHQSkin}
      />

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="mission-modal" role="dialog" aria-modal="true" aria-label="Lancer une mission" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="panel-kicker">Nouvelle mission</span>
                <h2>{modal.title}</h2>
              </div>
              <button type="button" onClick={() => setModal(null)}>Fermer</button>
            </div>
            <label>
              Agent
              <select
                value={modal.selectedAgentId}
                onChange={(event) =>
                  setModal((current) =>
                    current ? { ...current, selectedAgentId: event.target.value } : current,
                  )
                }
              >
                {liveAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </label>
            <label>
              Description de la mission
              <textarea
                value={modal.missionDescription}
                onChange={(event) =>
                  setModal((current) =>
                    current ? { ...current, missionDescription: event.target.value } : current,
                  )
                }
              />
            </label>
            <button
              type="button"
              className="primary-cta auth-submit"
              onClick={launchMission}
              disabled={insufficientBalance}
              title={insufficientBalance ? 'Crédits insuffisants.' : undefined}
            >
              <Send size={17} />
              Lancer la mission
            </button>
          </div>
        </div>
      )}

      {resultModalMissionId &&
        (() => {
          const mission = missions.find((m) => m.id === resultModalMissionId)
          if (!mission) return null
          const agent = liveAgents.find((a) => a.id === mission.agentId)
          const result = mission.result
          return (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => setResultModalMissionId(null)}
            >
              <div
                className="mission-modal mission-result-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Résultat de mission"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="modal-head">
                  <div>
                    <span className="panel-kicker">Livrable agent</span>
                    <h2>{mission.title}</h2>
                  </div>
                  <button type="button" onClick={() => setResultModalMissionId(null)}>
                    Fermer
                  </button>
                </div>
                <p className="mission-result-meta">
                  {agent?.name ?? 'Agent'} · Statut : {mission.status}
                </p>
                {result?.summary ? (
                  <section className="mission-result-section">
                    <h3>Résumé</h3>
                    <p>{result.summary}</p>
                  </section>
                ) : null}
                {Array.isArray(result?.next_steps) && result!.next_steps!.length ? (
                  <section className="mission-result-section">
                    <h3>Prochaines étapes</h3>
                    <ol>
                      {result!.next_steps!.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {result?.simulated ? (
                  <p className="mission-result-note">
                    Résultat généré par simulation. Sera remplacé par un vrai agent IA.
                  </p>
                ) : null}
              </div>
            </div>
          )
        })()}
    </main>
  )
}

function useDashboardAgentsInQG(project: Project, agents: Agent[], missions: Mission[]) {
  useEffect(() => {
    const missionByAgent = new Map<string, Mission>()
    for (const mission of missions) {
      const current = missionByAgent.get(mission.agentId)
      if (!current || new Date(mission.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        missionByAgent.set(mission.agentId, mission)
      }
    }

    useGame.setState((state) => {
      const nextAgents = { ...state.agents }
      const activeGameIds = new Set<string>()

      for (const agent of agents) {
        const gameId = dashboardAgentToGameAgent(agent.id)
        const gameAgent = nextAgents[gameId]
        if (!gameAgent) continue

        activeGameIds.add(gameId)
        const mission = missionByAgent.get(agent.id)
        const lifeState = dashboardStatusToLifeState(agent.status, mission)
        const progress =
          mission?.status === 'en cours'
            ? Math.max(0.04, Math.min(0.98, mission.progress / 100))
            : lifeState === 'working'
              ? 0.42
              : lifeState === 'delivered'
                ? 1
                : 0

        nextAgents[gameId] = {
          ...gameAgent,
          name: agent.name,
          className: agent.role,
          description: agent.role,
          themeColor: agent.accent,
          state: lifeState,
          workspaceId: workspaceForDashboardAgent(gameId, lifeState),
          progress,
          emote: lifeState === 'delivered' ? '!' : null,
          reliability: lifeState === 'working' ? 78 : 70,
          impactLabel: lifeState === 'working' ? 'Mission en cours' : 'Disponible',
        }
      }

      for (const id of state.agentOrder) {
        if (activeGameIds.has(id)) continue
        const gameAgent = nextAgents[id]
        if (!gameAgent) continue
        nextAgents[id] = {
          ...gameAgent,
          state: 'locked',
          workspaceId: null,
          progress: 0,
          emote: null,
        }
      }

      /* Mirror v1 missions into the game store as ActiveProducts so the
         passive-sale engine, infra system-log stream, and inbound-traffic
         particle effects all fire automatically without a duplicate driver. */
      const activeProducts: ActiveProduct[] = missions.map((mission) => {
        const dashAgent = agents.find((item) => item.id === mission.agentId)
        const gameId = dashboardAgentToGameAgent(mission.agentId)
        return {
          id: `v1-product-${mission.id}`,
          ventureId: project.id,
          deliverableId: null,
          agentId: gameId,
          agentName: dashAgent?.name ?? 'Agent',
          title: mission.title,
          price: 120,
          basePrice: 120,
          synergyBonus: false,
          createdAt: new Date(mission.createdAt).getTime(),
          status: 'active' as const,
        }
      })

      return {
        activeVentureId: project.id,
        ventureName: project.name,
        ventureSubtitle: project.description,
        agents: nextAgents,
        missions: {},
        latestDeliverableByAgent: {},
        activeProducts,
      }
    })
  }, [agents, missions, project.description, project.id, project.name])
}

function dashboardAgentToGameAgent(agentId: string) {
  switch (agentId) {
    case 'market-analyst':
      return 'analyst'
    case 'builder':
      return 'offerArchitect'
    case 'growth':
      return 'growthOperator'
    default:
      return 'strategist'
  }
}

function dashboardStatusToLifeState(status: Agent['status'], mission?: Mission): AgentLifeState {
  if (mission?.status === 'terminee') return 'delivered'
  if (mission?.status === 'en cours' || status === 'travaille') return 'working'
  return 'idle'
}

function workspaceForDashboardAgent(agentId: string, state: AgentLifeState) {
  if (state === 'idle') {
    if (agentId === 'analyst') return 'desk-analyst'
    if (agentId === 'offerArchitect') return 'desk-offer'
    if (agentId === 'growthOperator') return 'desk-growth'
    return 'desk-strategist'
  }

  if (agentId === 'analyst') return 'whiteboard'
  if (agentId === 'offerArchitect') return 'computer-2'
  if (agentId === 'growthOperator') return 'brainstorm'
  return 'computer-1'
}

function AnimatedSection({
  id,
  className,
  children,
}: {
  id?: string
  className: string
  children: ReactNode
}) {
  return (
    <motion.section
      id={id}
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.04 }}
      transition={{ duration: 0.45 }}
    >
      {children}
    </motion.section>
  )
}

function SectionIntro({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string
  title: string
  text: string
}) {
  return (
    <div className="section-intro">
      <span className="section-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function MiniMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="mini-metric">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PreviewMission({ title, agent, progress }: { title: string; agent: string; progress: number }) {
  return (
    <div className="preview-mission">
      <div>
        <strong>{title}</strong>
        <span>{agent}</span>
      </div>
      <div className="progress-line">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label="Changer de theme">
      {theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

function StepTitle({ icon: Icon, label, title }: { icon: LucideIcon; label: string; title: string }) {
  return (
    <div className="step-title">
      <span><Icon size={20} /></span>
      <div>
        <p>{label}</p>
        <h2>{title}</h2>
      </div>
    </div>
  )
}

function ChoiceGrid({ children }: { children: ReactNode }) {
  return <div className="choice-grid">{children}</div>
}

function ChoiceCard({
  selected,
  title,
  text,
  onClick,
}: {
  selected: boolean
  title: string
  text: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`choice-card ${selected ? 'is-selected' : ''}`} onClick={onClick}>
      <span>{selected ? <Check size={16} /> : <Orbit size={16} />}</span>
      <strong>{title}</strong>
      <em>{text}</em>
    </button>
  )
}

function InfrastructureSection() {
  const hqLevel = useGame((s) => s.hqLevel)
  const activeVentureId = useGame((s) => s.activeVentureId)
  const ventureName = useGame((s) => s.ventureName)
  const realRevenue = useGame((s) => s.realRevenue)
  const products = useGame(
    useShallow((s) =>
      s.activeProducts.filter((p) => p.ventureId === activeVentureId),
    ),
  )
  const workingAgents = useGame(
    (s) =>
      Object.values(s.agents).filter(
        (a) => a.state === 'working' || a.state === 'walking',
      ).length,
  )

  const webInstances = Math.min(8, 2 + Math.max(0, hqLevel - 1))
  const dbUptime = (99.9 - (workingAgents > 4 ? 0.1 : 0)).toFixed(1)
  const cpuLoad = Math.min(94, 18 + workingAgents * 14 + products.length * 6)

  return (
    <section className="dashboard-section infra-section">
      <header>
        <div>
          <h2>Infrastructure</h2>
          <p>{ventureName} · stack temps réel</p>
        </div>
        <span>Niv. {hqLevel}</span>
      </header>

      <ul className="infra-list">
        <InfraRow label="Load Balancer" status="Active" tone="ok" right="haproxy/2.8" />
        <InfraRow
          label="Web Servers"
          status={`${webInstances} / ${webInstances} en ligne`}
          tone="ok"
          right="nginx · :443"
        />
        <InfraRow
          label="Database (Postgres IA)"
          status={`Synchro ${dbUptime}% uptime`}
          tone="ok"
          right="pgvector"
        />
        <InfraRow
          label="LLM Gateway"
          status={workingAgents > 0 ? 'Streaming' : 'Idle'}
          tone={workingAgents > 0 ? 'pulse' : 'muted'}
          right={`load ${cpuLoad}%`}
        />
      </ul>

      <div className="infra-block">
        <p className="infra-block-label">Containers actifs</p>
        {products.length === 0 ? (
          <p className="infra-empty">Aucun service déployé. Lancez une mission pour pousser un container en production.</p>
        ) : (
          <ul className="infra-container-list">
            {products.slice(0, 5).map((p) => (
              <ContainerRow key={p.id} product={p} />
            ))}
            {products.length > 5 && (
              <li className="infra-container-more">+ {products.length - 5} containers supplémentaires</li>
            )}
          </ul>
        )}
      </div>

      <footer className="infra-foot">
        <div>
          <span>Revenu cumulé</span>
          <strong>{realRevenue}€</strong>
        </div>
        <div>
          <span>Containers</span>
          <strong>{products.length}</strong>
        </div>
      </footer>
    </section>
  )
}

function InfraRow({
  label,
  status,
  tone,
  right,
}: {
  label: string
  status: string
  tone: 'ok' | 'pulse' | 'muted'
  right: string
}) {
  return (
    <li className={`infra-row infra-row-${tone}`}>
      <span className="infra-dot" aria-hidden />
      <div className="infra-row-text">
        <span className="infra-row-label">{label}</span>
        <strong className="infra-row-status">{status}</strong>
      </div>
      <em className="infra-row-meta">{right}</em>
    </li>
  )
}

function ContainerRow({ product }: { product: ActiveProduct }) {
  const containerId = `ox-${product.id.slice(-4)}`
  return (
    <li className="infra-container">
      <span className="infra-container-id">[Container id: {containerId}]</span>
      <span className="infra-container-title">{product.title}</span>
      <span className="infra-container-running">Running</span>
    </li>
  )
}

function NetworkConsoleSection() {
  const logs = useGame(useShallow((s) => s.logs.slice(0, 14)))
  return (
    <section className="dashboard-section network-console">
      <header>
        <div>
          <h2>Console réseau</h2>
          <p>Flux temps réel : agents, routeur, base de données.</p>
        </div>
        <span>{logs.length} évènements</span>
      </header>
      {logs.length === 0 ? (
        <p className="network-empty">Aucun trafic. Lancez une mission pour activer le réseau.</p>
      ) : (
        <ul className="network-log-list">
          {logs.map((log) => (
            <li key={log.id} className={`network-log network-log-${channelTone(log.agentName)}`}>
              <time>{formatLogTime(log.ts)}</time>
              <span className="network-log-channel">[{log.agentName}]</span>
              <span className="network-log-msg">{log.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function channelTone(channel: string): 'sys' | 'router' | 'db' | 'agent' {
  if (channel === 'SYSTEM') return 'sys'
  if (channel === 'ROUTER') return 'router'
  if (channel === 'DATABASE') return 'db'
  return 'agent'
}

function formatLogTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ActivityFeedSection({ events }: { events: ActivityEvent[] }) {
  return (
    <DashboardSection
      title="Activité live"
      subtitle="Évènements remontés depuis Supabase."
      action={<span>{events.length} évènement{events.length > 1 ? 's' : ''}</span>}
    >
      {events.length === 0 ? (
        <p className="activity-empty">
          Aucun évènement pour le moment. Lancez une mission pour voir le feed se remplir.
        </p>
      ) : (
        <ul className="activity-feed">
          {events.slice(0, 12).map((event) => (
            <li key={event.id} className={`activity-item activity-${event.type}`}>
              <time>{formatActivityTime(event.createdAt)}</time>
              <div>
                <strong>{event.title}</strong>
                {event.description && <p>{event.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  )
}

function formatActivityTime(value: string) {
  const d = new Date(value)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function DashboardSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="dashboard-section">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(
    new Date(value),
  )
}
