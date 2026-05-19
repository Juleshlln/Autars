import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GameScreen } from './GameScreen'
import { HubScreen } from './HubScreen'
import { ErrorBoundary } from './ErrorBoundary'

type Route = 'hub' | 'hq'

export function AppRoot() {
  const [route, setRoute] = useState<Route>('hub')

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
            <HubScreen onEnterHQ={() => setRoute('hq')} />
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
    </ErrorBoundary>
  )
}
