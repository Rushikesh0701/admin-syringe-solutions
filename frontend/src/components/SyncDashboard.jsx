import { useState, useEffect } from 'react'
import './SyncDashboard.css'

// API Base URL - reads from environment variable, empty string uses Vite proxy in dev
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

function SyncDashboard() {
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [channels, setChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(true)

  useEffect(() => {
    fetchChannels()
  }, [])

  const fetchChannels = async () => {
    setChannelsLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/channels`)
      const data = await response.json()
      if (data.success && data.channels) {
        setChannels(data.channels)
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    } finally {
      setChannelsLoading(false)
    }
  }

  const handleSyncAll = async () => {
    setIsLoading(true)
    setSummary(null)

    const allChannelIds = channels.map(c => c.id)

    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds: allChannelIds.length > 0 ? allChannelIds : null
        })
      })

      const data = await response.json()
      setSummary(data.summary)
    } catch (error) {
      setSummary({ total: 0, created: 0, updated: 0, failed: 1, error: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="sync-page">
      <div className="sync-card">
        {/* Header */}
        <div className="header">
          <div className="badge">Inventory Manager</div>
          <h1 className="title">
            Sync Products from<br />
            <span className="highlight">inFlow to Shopify</span>
          </h1>
        </div>

        {/* Controls */}
        <div className="controls center">
          <button
            className="sync-btn primary-large"
            onClick={handleSyncAll}
            disabled={isLoading || channelsLoading}
          >
            {isLoading || channelsLoading ? (
              <>
                <span className="spinner"></span>
                {isLoading ? 'Syncing Products...' : 'Loading...'}
              </>
            ) : (
              'Sync Products'
            )}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
            </div>
            <span className="stat-label">Total Products</span>
            <span className="stat-value">{summary?.total ?? '-'}</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon created">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14m-7-7h14"/>
              </svg>
            </div>
            <span className="stat-label">Created</span>
            <span className="stat-value created">{summary?.created ?? '-'}</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon updated">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
            <span className="stat-label">Updated</span>
            <span className="stat-value updated">{summary?.updated ?? '-'}</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon failed">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <span className="stat-label">Failed</span>
            <span className="stat-value failed">{summary?.failed ?? '-'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SyncDashboard