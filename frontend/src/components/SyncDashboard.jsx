import { useState, useRef, useEffect } from 'react'

function SyncDashboard() {
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [channels, setChannels] = useState([])
  const [selectedChannels, setSelectedChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [showChannelDropdown, setShowChannelDropdown] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchChannels()
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowChannelDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchChannels = async () => {
    setChannelsLoading(true)
    try {
      const response = await fetch('/api/channels')
      const data = await response.json()
      if (data.success && data.channels) {
        setChannels(data.channels)
        setSelectedChannels([])
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    } finally {
      setChannelsLoading(false)
    }
  }

  const toggleChannel = (channelId) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId) 
        : [...prev, channelId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedChannels.length === channels.length) {
      setSelectedChannels([])
    } else {
      setSelectedChannels(channels.map(c => c.id))
    }
  }

  const handleStartSync = async () => {
    setIsLoading(true)
    setSummary(null)

    try {
      const response = await fetch('/api/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds: selectedChannels.length > 0 ? selectedChannels : null
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
          <p className="subtitle">
            Automatically sync your inventory, prices, and images between platforms.
          </p>
        </div>

        {/* Controls */}
        <div className="controls">
          {/* Channel Selector */}
          <div className="dropdown-wrapper" ref={dropdownRef}>
            <button
              className="dropdown-btn"
              onClick={() => setShowChannelDropdown(!showChannelDropdown)}
              disabled={channelsLoading || isLoading}
            >
              <span>
                {selectedChannels.length === 0 
                  ? 'Select Channels' 
                  : selectedChannels.length === channels.length 
                    ? 'All Channels' 
                    : `${selectedChannels.length} Channel(s)`}
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {showChannelDropdown && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={toggleSelectAll}>
                  <input 
                    type="checkbox" 
                    checked={selectedChannels.length === channels.length && channels.length > 0}
                    readOnly
                  />
                  <span>Select All</span>
                </div>
                {channelsLoading ? (
                  <div className="dropdown-item loading">Loading...</div>
                ) : channels.length === 0 ? (
                  <div className="dropdown-item loading">No channels found</div>
                ) : (
                  channels.map(channel => (
                    <div 
                      key={channel.id}
                      className="dropdown-item"
                      onClick={() => toggleChannel(channel.id)}
                    >
                      <input 
                        type="checkbox" 
                        checked={selectedChannels.includes(channel.id)}
                        readOnly
                      />
                      <span>{channel.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sync Button */}
          <button
            className="sync-btn"
            onClick={handleStartSync}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Syncing...
              </>
            ) : (
              'Start Sync'
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

      <style>{`
        * {
          box-sizing: border-box;
        }

        .sync-page {
          min-height: 100vh;
          background: #eef2ff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .sync-card {
          width: 100%;
          max-width: 700px;
          background: white;
          border-radius: 20px;
          padding: 48px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .header {
          text-align: center;
          margin-bottom: 40px;
        }

        .badge {
          display: inline-block;
          background: #f97316;
          color: white;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 18px;
          border-radius: 50px;
          margin-bottom: 20px;
        }

        .title {
          font-size: 32px;
          font-weight: 800;
          color: #1e293b;
          line-height: 1.3;
          margin: 0 0 16px 0;
        }

        .highlight {
          color: #3b82f6;
        }

        .subtitle {
          color: #64748b;
          font-size: 15px;
          margin: 0;
          line-height: 1.6;
        }

        .controls {
          display: flex;
          gap: 12px;
          margin-bottom: 40px;
        }

        .dropdown-wrapper {
          position: relative;
          flex: 1;
        }

        .dropdown-btn {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          background: white;
          font-size: 15px;
          color: #475569;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-btn:hover {
          border-color: #3b82f6;
        }

        .dropdown-btn:disabled {
          background: #f8fafc;
          cursor: not-allowed;
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 8px;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.12);
          z-index: 50;
          max-height: 240px;
          overflow-y: auto;
        }

        .dropdown-item {
          padding: 14px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          font-size: 14px;
          color: #334155;
          transition: background 0.15s;
        }

        .dropdown-item:hover {
          background: #f1f5f9;
        }

        .dropdown-item.loading {
          color: #94a3b8;
          justify-content: center;
        }

        .dropdown-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #3b82f6;
        }

        .sync-btn {
          padding: 16px 36px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .sync-btn:hover:not(:disabled) {
          background: #ea580c;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }

        .sync-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .sync-btn:disabled {
          background: #fdba74;
          cursor: not-allowed;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid white;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .stat-card {
          background: white;
          border: 2px solid #f1f5f9;
          border-radius: 16px;
          padding: 24px 16px;
          text-align: center;
          transition: all 0.2s;
        }

        .stat-card:hover {
          border-color: #e2e8f0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.04);
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px auto;
        }

        .stat-icon.total {
          background: #f1f5f9;
          color: #475569;
        }

        .stat-icon.created {
          background: #dcfce7;
          color: #16a34a;
        }

        .stat-icon.updated {
          background: #dbeafe;
          color: #2563eb;
        }

        .stat-icon.failed {
          background: #fee2e2;
          color: #dc2626;
        }

        .stat-label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .stat-value {
          display: block;
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
        }

        .stat-value.created { color: #16a34a; }
        .stat-value.updated { color: #2563eb; }
        .stat-value.failed { color: #dc2626; }

        @media (max-width: 700px) {
          .sync-card {
            padding: 32px 24px;
          }
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .controls {
            flex-direction: column;
          }
          .title {
            font-size: 26px;
          }
        }
      `}</style>
    </div>
  )
}

export default SyncDashboard
