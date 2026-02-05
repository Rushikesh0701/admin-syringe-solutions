/**
 * inFlow to Shopify Sync Backend Server
 * Express API running on port 8080
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const syncManager = require('./services/syncManager');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/shopify/auth
 * Redirects to Shopify OAuth page
 */
app.get('/api/shopify/auth', (req, res) => {
  const authUrl = syncManager.getAuthUrl();
  console.log('[AUTH] Redirecting to:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /api/shopify/callback
 * Handles Shopify OAuth callback
 */
app.get('/api/shopify/callback', async (req, res) => {
  const { code, shop } = req.query;
  console.log('[AUTH] Callback received for shop:', shop);

  if (!code) {
    return res.status(400).send('Missing code');
  }

  try {
    const tokenData = await syncManager.exchangeCodeForToken(code);
    console.log('[AUTH] Token successfully generated!');

    // Output the token so the user can copy it easily
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1 style="color: #2c3e50;">Bhai, Success! 🎉</h1>
        <p>Your new authorized Shopify token is:</p>
        <code style="display: block; padding: 20px; background: #f4f4f4; border-radius: 8px; font-weight: bold; margin: 20px 0; word-break: break-all;">
          ${tokenData.access_token}
        </code>
        <p>Please copy this and paste it into your <b>backend/.env</b> file for <b>PRIVATE_STOREFRONT_API_TOKEN</b>.</p>
        <p style="color: #7f8c8d; font-size: 0.9em;">(After updating, restart the backend and your channels will work!)</p>
      </div>
    `);
  } catch (error) {
    console.error('[AUTH] Callback error:', error.message);
    res.status(500).send('Failed to generate token. Please check backend logs.');
  }
});

/**
 * GET /api/channels
 * Fetches available Shopify sales channels (publications)
 */
app.get('/api/channels', async (req, res) => {
  console.log('[CHANNELS] Fetching Shopify channels...');

  try {
    const channels = await syncManager.fetchShopifyChannels();
    console.log(`[CHANNELS] Found ${channels.length} channels`);
    res.json({ success: true, channels });
  } catch (error) {
    console.error('[CHANNELS] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      channels: []
    });
  }
});

/**
 * POST /api/sync/start
 * Initiates the sync process from inFlow to Shopify
 * @param {Array} channelIds - Optional: Array of Shopify publication IDs to publish products to
 * Returns an array of log messages showing sync progress
 */
app.post('/api/sync/start', async (req, res) => {
  const { channelIds } = req.body;
  console.log('[SYNC] Starting sync process...');
  if (channelIds && channelIds.length > 0) {
    console.log('[SYNC] Target channels count:', channelIds.length);
  }

  try {
    // Execute the sync and collect logs
    const result = await syncManager.startSync(channelIds);

    const response = {
      success: result.success,
      logs: result.logs,
      summary: {
        total: result.summary.total,
        created: result.summary.created,
        updated: result.summary.updated,
        unchanged: result.summary.skipped,
        failed: result.summary.failed
      }
    };

    // Return appropriate HTTP status
    if (result.summary.failed > 0 && result.summary.failed === result.summary.total) {
      // All products failed
      res.status(500).json(response);
    } else if (result.summary.failed > 0) {
      // Partial success
      res.status(207).json(response);
    } else {
      // Full success
      res.json(response);
    }
  } catch (error) {
    console.error('[SYNC] Fatal error:', error.message);
    res.status(500).json({
      success: false,
      logs: [`Fatal Error: ${error.message}`],
      summary: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0 }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 inFlow to Shopify Sync API ready`);
});
