import { useState, useEffect } from 'react'
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Grid,
  Icon
} from '@shopify/polaris';
import {
  ImportIcon,
  PlusIcon,
  RefreshIcon,
  AlertBubbleIcon,
  InventoryIcon
} from '@shopify/polaris-icons';

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
      
      // Show alert if there were failures
      if (data.summary?.failed > 0) {
        alert(`Sync completed with ${data.summary.failed} error(s). Check the logs for details.`)
      }
    } catch (error) {
      setSummary({ total: 0, created: 0, updated: 0, failed: 1, error: error.message })
      alert(`Sync failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const SummaryBox = ({ icon, label, value, color }) => (
    <Box
      padding="300"
      background="bg-surface"
      borderColor="border"
      borderWidth="025"
      borderRadius="200"
      minHeight="110px"
      width="100%"
    >
      <BlockStack gap="200" align="center">
        <Icon source={icon} tone={color === 'base' ? undefined : color} />
        <Text variant="bodySm" as="p" tone="subdued" alignment="center">
          {label}
        </Text>
        <Text variant="headingMd" as="span" alignment="center" tone={color === 'base' ? undefined : color}>
          {value ?? '-'}
        </Text>
      </BlockStack>
    </Box>
  );

  return (
    <Page>
      {/* Polaris Web Component: ui-title-bar */}
      <ui-title-bar title="InFlow Sync" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 120px)', // Account for title bar and padding
        padding: '20px'
      }}>
        <div style={{ width: '100%', maxWidth: '750px' }}>
          <Card padding="600">
            <BlockStack gap="600" align="center">
              {/* Heading */}
              <Text variant="headingXl" as="h1" alignment="center">
                Sync Products from InFlow
              </Text>

              {/* Primary Action */}
              <InlineStack align="center">
                <div style={{ height: '60px', width: '250px' }}>
                  <Button
                    fullWidth
                    size="large"
                    variant="primary"
                    onClick={handleSyncAll}
                    loading={isLoading}
                    disabled={channelsLoading}
                  >
                    <span style={{ fontSize: '18px' }}>
                      {channelsLoading ? 'Loading...' : 'Sync Products'}
                    </span>
                  </Button>
                </div>
              </InlineStack>

              {/* Results Grid */}
              <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4 }} gap="300">
                <Grid.Cell>
                  <SummaryBox
                    icon={InventoryIcon}
                    label="Total Products"
                    value={summary?.total}
                    color="base"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <SummaryBox
                    icon={PlusIcon}
                    label="Created"
                    value={summary?.created}
                    color="success"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <SummaryBox
                    icon={RefreshIcon}
                    label="Updated"
                    value={summary?.updated}
                    color="info"
                  />
                </Grid.Cell>
                <Grid.Cell>
                  <SummaryBox
                    icon={AlertBubbleIcon}
                    label="Failed"
                    value={summary?.failed}
                    color="critical"
                  />
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </div>
      </div>
    </Page>
  )
}

export default SyncDashboard