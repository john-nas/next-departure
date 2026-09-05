import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'leaflet/dist/leaflet.css'
import './styles/tokens.css'
import './styles/globals.css'
import './styles/utilities.css'
import './styles/app.css'
import App from './app/App'
import { DepartureFeedProvider } from './features/feed/DepartureFeedProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <DepartureFeedProvider>
          <App />
        </DepartureFeedProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
