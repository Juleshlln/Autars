import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GameScreen } from './GameScreen'
import { HubScreen } from './HubScreen'
import { ErrorBoundary } from './ErrorBoundary'
import { NewVentureModal } from './NewVentureModal'
import { BriefChatModal } from './BriefChatModal'
import { BriefingModal } from './BriefingModal'
import { useGame } from './store'

type Route = 'hub' | 'hq'

export function AppRoot() {
  const [route, setRoute] = useState<Route>('hub')
  const setActiveVenture = useGame((s) => s.setActiveVenture)

  const enterHQ = (ventureId: string) => {
    setActiveVenture(ventureId)
    setRoute('hq')
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {route === 'hub' ? (
          <motion.div
            key="hub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <HubScreen onEnterHQ={enterHQ} />
          </motion.div>
        ) : (
          <motion.div
            key="hq"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <GameScreen onBackToHub={() => setRoute('hub')} />
          </motion.div>
        )}
      </AnimatePresence>

      <NewVentureModal onComplete={enterHQ} />
      <BriefChatModal />
      <BriefingModal />
    </ErrorBoundary>
  )
}
