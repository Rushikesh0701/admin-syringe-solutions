require('dotenv').config();
const syncManager = require('./services/syncManager');

async function testChannels() {
    console.log('Testing Shopify Channels Fetch...');
    console.log('Shopify Domain:', process.env.PUBLIC_STORE_DOMAIN);
    console.log('Access Token Length:', process.env.PRIVATE_STOREFRONT_API_TOKEN ? process.env.PRIVATE_STOREFRONT_API_TOKEN.length : 'MISSING');

    try {
        const channels = await syncManager.fetchShopifyChannels();
        console.log('SUCCESS: Fetched Channels:', JSON.stringify(channels, null, 2));
    } catch (error) {
        console.error('FAILURE: Error fetching channels:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

testChannels();
