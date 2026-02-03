import { AppProvider } from '@shopify/polaris';
import translations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';
import SyncDashboard from './components/SyncDashboard'

function App() {
  return (
    <AppProvider i18n={translations}>
      <SyncDashboard />
    </AppProvider>
  )
}

export default App
