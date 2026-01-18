/**
 * Sync Manager Service
 * Handles fetching products from inFlow and syncing to Shopify
 */

const axios = require('axios');

// Configuration from environment variables
// inFlow API
const INFLOW_API_TOKEN = process.env.INFLOW_API_TOKEN;
const INFLOW_API_BASE_URL = process.env.NFLOW_API_BASE_URL || process.env.INFLOW_API_BASE_URL || 'https://cloudapi.inflowinventory.com';
const INFLOW_COMPANY_ID = process.env.INFLOW_COMPANY_ID;

// Shopify API
const SHOPIFY_ACCESS_TOKEN = process.env.PRIVATE_STOREFRONT_API_TOKEN;
const SHOP_DOMAIN = process.env.PUBLIC_STORE_DOMAIN;

// Shopify GraphQL endpoint
const SHOPIFY_API_URL = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
const SHOPIFY_REST_URL = `https://${SHOP_DOMAIN}/admin/api/2024-01`;

// Cache for Shopify location ID
let primaryLocationId = null;

// Global log helper
const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
};

/**
 * Fetches all products from inFlow Inventory API
 * @returns {Promise<Array>} Array of products with Name, SKU, Price, Stock
 */
async function fetchInflowProducts() {
    try {
        // inFlow Cloud API productlistings endpoint
        const apiVersion = '2025-10-02';
        const url = `${INFLOW_API_BASE_URL}/${INFLOW_COMPANY_ID}/productlistings`;
        console.log('[inFlow] Fetching from:', url);
        console.log('[inFlow] Using API Token:', INFLOW_API_TOKEN ? `${INFLOW_API_TOKEN.substring(0, 10)}...` : 'NOT SET');
        console.log('[inFlow] Company ID:', INFLOW_COMPANY_ID);
        console.log('[inFlow] API Version:', apiVersion);

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${INFLOW_API_TOKEN}`,
                'Accept': `application/vnd.api+json; version=${apiVersion}`,
                'referer': 'https://app.inflowinventory.com/',
                'origin': 'https://app.inflowinventory.com',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site'
            },
            params: {
                'includeCount': true,
                'filter[isActive]': true,
                'count': 100
            }
        });

        // Map inFlow JSON:API response to standardized format
        const products = response.data.data || [];
        console.log(`[inFlow] Received ${products.length} products`);
        return products;
    } catch (error) {
        // Log detailed error info
        console.error('[inFlow] API Error:', error.response?.status, error.response?.statusText);
        console.error('[inFlow] Error Data:', JSON.stringify(error.response?.data || error.message));
        console.error('[inFlow] Request URL:', error.config?.url);
        console.error('[inFlow] Request Headers:', JSON.stringify(error.config?.headers));
        throw new Error(`Failed to fetch inFlow products: ${error.response?.data?.message || error.message}`);
    }
}

/**
 * Search for a product in Shopify by SKU
 * @param {string} sku - The product SKU to search for
 * @returns {Promise<Object|null>} Shopify product or null if not found
 */
async function searchShopifyBySku(sku) {
    try {
        // Use GraphQL to search for product by SKU
        const query = `
      {
        productVariants(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              inventoryItem {
                id
                inventoryLevels(first: 1) {
                  edges {
                    node {
                      location {
                        id
                      }
                    }
                  }
                }
              }
              product {
                id
                title
              }
            }
          }
        }
      }
    `;

        const response = await axios.post(
            SHOPIFY_API_URL,
            { query },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        const variants = response.data?.data?.productVariants?.edges;
        if (variants && variants.length > 0) {
            const v = variants[0].node;
            return {
                id: v.id,
                sku: v.sku,
                price: v.price,
                inventoryQuantity: v.inventoryQuantity,
                inventoryItemId: v.inventoryItem?.id,
                locationId: v.inventoryItem?.inventoryLevels?.edges[0]?.node?.location?.id,
                product: v.product
            };
        }
        return null;
    } catch (error) {
        throw new Error(`Shopify search failed for SKU ${sku}: ${error.message}`);
    }
}

/**
 * Create a new product in Shopify
 * @param {Object} product - Product data from inFlow
 * @returns {Promise<Object>} Created product response
 */
async function createShopifyProduct(product) {
    try {
        const response = await axios.post(
            `${SHOPIFY_REST_URL}/products.json`,
            {
                product: {
                    title: product.Name || product.name,
                    body_html: product.Description || product.description || '',
                    vendor: product.Vendor || product.vendor || '',
                    product_type: product.Category || product.category || '',
                    images: product.defaultImage?.originalUrl ? [{ src: product.defaultImage.originalUrl }] :
                        (product.images && product.images.length > 0 ? product.images.map(img => ({ src: img.originalUrl || img.url })) : []),
                    variants: [
                        {
                            sku: product.SKU || product.sku,
                            price: product.defaultPrice?.unitPrice || product.Price || product.price || '0.00',
                            inventory_quantity: Math.floor(parseFloat(product.totalQuantityOnHand || (product.inventoryLines && Array.isArray(product.inventoryLines) ? product.inventoryLines.reduce((sum, line) => sum + (parseFloat(line.quantityOnHand || line.quantity) || 0), 0) : 0)) || 0),
                            inventory_management: 'shopify'
                        }
                    ]
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.product;
    } catch (error) {
        throw new Error(`Failed to create Shopify product: ${error.message}`);
    }
}

/**
 * Update an existing product variant in Shopify
 * @param {string} variantId - Shopify variant ID
 * @param {Object} product - Product data from inFlow
 * @param {Object} existingVariant - Existing Shopify variant object (containing inventoryItem ID)
 * @returns {Promise<Object>} Updated variant response
 */
async function updateShopifyVariant(variantId, product, existingVariant) {
    try {
        // Extract numeric ID from GraphQL ID
        const numericId = variantId.replace('gid://shopify/ProductVariant/', '');

        // Update stock via InventoryLevel API
        if (existingVariant.inventoryItemId && existingVariant.locationId) {
            const inventoryItemId = existingVariant.inventoryItemId.replace('gid://shopify/InventoryItem/', '');
            const locationId = existingVariant.locationId.replace('gid://shopify/Location/', '');
            const stockValue = product.totalQuantityOnHand || (product.inventoryLines && Array.isArray(product.inventoryLines) ? product.inventoryLines.reduce((sum, line) => sum + (parseFloat(line.quantityOnHand || line.quantity) || 0), 0) : 0);
            const stock = Math.floor(parseFloat(stockValue) || 0);

            await updateShopifyStock(inventoryItemId, locationId, stock);
        }

        const response = await axios.put(
            `${SHOPIFY_REST_URL}/variants/${numericId}.json`,
            {
                variant: {
                    id: numericId,
                    price: product.defaultPrice?.unitPrice || product.Price || product.price || '0.00'
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.variant;
    } catch (error) {
        throw new Error(`Failed to update Shopify variant: ${error.message}`);
    }
}

/**
 * Update an existing product in Shopify (for images and metadata)
 * @param {string} productId - Shopify product ID (numeric)
 * @param {Object} product - Product data from inFlow
 * @returns {Promise<Object>} Updated product response
 */
async function updateShopifyProduct(productId, product) {
    try {
        const images = product.defaultImage?.originalUrl ? [{ src: product.defaultImage.originalUrl }] :
            (product.images && product.images.length > 0 ? product.images.map(img => ({ src: img.originalUrl || img.url })) : []);

        log(`  📸 Syncing ${images.length} images for product ${productId}...`);

        const response = await axios.put(
            `${SHOPIFY_REST_URL}/products/${productId}.json`,
            {
                product: {
                    id: productId,
                    body_html: product.description || product.Description || '',
                    vendor: product.vendor || product.Vendor || '',
                    product_type: product.category || product.Category || '',
                    images: product.defaultImage?.originalUrl ? [{ src: product.defaultImage.originalUrl }] :
                        (product.images && product.images.length > 0 ? product.images.map(img => ({ src: img.originalUrl || img.url })) : [])
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.product;
    } catch (error) {
        // Don't throw if image update fails, just log it
        console.error(`[Shopify] Image update failed for product ${productId}:`, error.message);
        return null;
    }
}

/**
 * Main sync function - orchestrates the entire sync process
 * @param {Array|null} channelIds - Optional array of Shopify publication IDs to publish products to
 * @returns {Promise<Object>} Result with logs and summary
 */
async function startSync(channelIds = null) {
    const logs = [];
    const summary = { total: 0, created: 0, updated: 0, failed: 0, published: 0 };

    const log = (message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        logs.push(logEntry);
        console.log(logEntry);
    };

    try {
        // Validate configuration
        if (!INFLOW_API_TOKEN) {
            throw new Error('INFLOW_API_TOKEN is not configured');
        }
        if (!SHOPIFY_ACCESS_TOKEN || !SHOP_DOMAIN) {
            throw new Error('Shopify credentials are not configured (PRIVATE_STOREFRONT_API_TOKEN, PUBLIC_STORE_DOMAIN)');
        }

        log('🚀 Starting inFlow to Shopify sync...');
        if (channelIds && channelIds.length > 0) {
            log(`📺 Target channels: ${channelIds.length} selected`);
        }
        log('📥 Fetching products from inFlow Inventory...');

        // Step A: Fetch products from inFlow
        const inflowProducts = await fetchInflowProducts();
        summary.total = inflowProducts.length;

        log(`✅ Fetched ${inflowProducts.length} products from inFlow`);

        if (inflowProducts.length === 0) {
            log('⚠️ No products found in inFlow. Sync complete.');
            return { success: true, logs, summary };
        }

        // Step B: Sync each product to Shopify
        log('🔄 Starting Shopify sync...');

        // Debug: Find product with images
        const withImages = inflowProducts.find(p => p.attributes?.imageUrl);
        if (withImages) {
            log(`📸 Found product with images: ${withImages.attributes.name} - ${withImages.attributes.imageUrl}`);
        } else {
            log('⚠️ No products found with images in this batch.');
        }

        // Debug: Find product with non-zero stock
        const withStock = inflowProducts.find(p => parseFloat(p.attributes?.totalQuantityOnHand) > 0);
        if (withStock) {
            log(`🔢 Found product with stock: ${withStock.attributes.name} - Stock: ${withStock.attributes.totalQuantityOnHand}`);
        }

        // Debug: Log first product's category-related fields to identify correct field name
        if (inflowProducts.length > 0) {
            const firstAttr = inflowProducts[0].attributes || {};
            log(`📂 Category debug - First product: ${firstAttr.name}`);
            log(`   categoryName: ${firstAttr.categoryName || 'undefined'}`);
            log(`   category: ${firstAttr.category || 'undefined'}`);
            log(`   productType: ${firstAttr.productType || 'undefined'}`);
            log(`   type: ${firstAttr.type || 'undefined'}`);
        }

        // Batch processing configuration
        const BATCH_SIZE = 5; // Process 5 products concurrently
        log(`🚀 Starting batch sync (${BATCH_SIZE} products at a time)...`);

        // Helper function to strip width/height query parameters from image URLs
        // This ensures Shopify receives full-resolution images instead of resized versions
        const stripImageResizeParams = (url) => {
            if (!url) return url;
            try {
                const urlObj = new URL(url);
                // Remove resize-related parameters while keeping security tokens
                ['width', 'height', 'w', 'h'].forEach(param => {
                    urlObj.searchParams.delete(param);
                });
                return urlObj.toString();
            } catch (e) {
                // If URL parsing fails, fallback to regex removal
                return url
                    .replace(/[?&](width|height|w|h)=[^&]*/gi, '')
                    .replace(/\?&/, '?')
                    .replace(/&&/g, '&')
                    .replace(/\?$/, '');
            }
        };

        // Prepare all products for processing
        const productsToSync = inflowProducts
            .map(item => {
                const attr = item.attributes || {};
                // Clean image URLs to get full-resolution versions
                const cleanImageUrl = stripImageResizeParams(attr.imageUrl);
                const cleanMediumUrl = stripImageResizeParams(attr.imageMediumUrl);
                const cleanThumbUrl = stripImageResizeParams(attr.imageThumbUrl);

                return {
                    sku: attr.sku,
                    name: attr.name,
                    description: attr.description,
                    price: attr.unitPrice || '0.00',
                    totalQuantityOnHand: attr.totalQuantityOnHand || 0,
                    category: attr.categoryName || '',
                    vendor: attr.lastVendorName || '',
                    defaultImage: {
                        originalUrl: cleanImageUrl,
                        mediumUrl: cleanMediumUrl,
                        thumbUrl: cleanThumbUrl
                    },
                    images: cleanImageUrl ? [{ originalUrl: cleanImageUrl }] : []
                };
            })
            .filter(p => p.sku); // Skip products without SKU

        const skippedCount = inflowProducts.length - productsToSync.length;
        if (skippedCount > 0) {
            log(`⚠️ Skipping ${skippedCount} products without SKU`);
        }

        // Process products in batches
        for (let i = 0; i < productsToSync.length; i += BATCH_SIZE) {
            const batch = productsToSync.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(productsToSync.length / BATCH_SIZE);

            log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

            // Process batch in parallel
            const results = await Promise.allSettled(
                batch.map(async (product) => {
                    const sku = product.sku;
                    const name = product.name;
                    const price = product.price;
                    const stock = Math.floor(parseFloat(product.totalQuantityOnHand) || 0);

                    try {
                        // Search for existing product in Shopify
                        const existingVariant = await searchShopifyBySku(sku);
                        let productId = null;

                        if (existingVariant) {
                            // Product exists - UPDATE
                            await updateShopifyVariant(existingVariant.id, product, existingVariant);

                            // Update product-level info (images)
                            productId = existingVariant.product?.id;
                            if (productId) {
                                const numericProductId = productId.replace('gid://shopify/Product/', '');
                                await updateShopifyProduct(numericProductId, product);
                            }

                            // Publish to selected channels (if any)
                            let publishedCount = 0;
                            if (channelIds && channelIds.length > 0 && productId) {
                                for (const channelId of channelIds) {
                                    const published = await publishProductToChannel(productId, channelId);
                                    if (published) publishedCount++;
                                }
                            }

                            return { status: 'updated', sku, price, stock, publishedCount };
                        } else {
                            // Product doesn't exist - CREATE
                            const createdProduct = await createShopifyProduct(product);
                            productId = `gid://shopify/Product/${createdProduct.id}`;

                            // Publish to selected channels (if any)
                            let publishedCount = 0;
                            if (channelIds && channelIds.length > 0) {
                                for (const channelId of channelIds) {
                                    const published = await publishProductToChannel(productId, channelId);
                                    if (published) publishedCount++;
                                }
                            }

                            return { status: 'created', sku, productId, publishedCount };
                        }
                    } catch (error) {
                        return { status: 'failed', sku, error: error.message };
                    }
                })
            );

            // Process results
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    if (data.status === 'updated') {
                        summary.updated++;
                        summary.published += data.publishedCount || 0;
                        const publishNote = data.publishedCount > 0 ? `, Published to ${data.publishedCount} channel(s)` : '';
                        log(`  ✅ ${data.sku}: Updated (Price: $${data.price}, Stock: ${data.stock}${publishNote})`);
                    } else if (data.status === 'created') {
                        summary.created++;
                        summary.published += data.publishedCount || 0;
                        const publishNote = data.publishedCount > 0 ? ` → Published to ${data.publishedCount} channel(s)` : '';
                        log(`  ✅ ${data.sku}: Created${publishNote}`);
                    } else if (data.status === 'failed') {
                        summary.failed++;
                        log(`  ❌ ${data.sku}: ${data.error}`);
                    }
                } else {
                    summary.failed++;
                    log(`  ❌ Batch error: ${result.reason}`);
                }
            }

            // Small delay between batches to respect rate limits
            if (i + BATCH_SIZE < productsToSync.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Final summary
        log('─'.repeat(50));
        log(`📊 Sync Complete!`);
        log(`   Total Products: ${summary.total}`);
        log(`   Created: ${summary.created}`);
        log(`   Updated: ${summary.updated}`);
        log(`   Published: ${summary.published}`);
        log(`   Failed: ${summary.failed}`);

        return {
            success: summary.failed === 0,
            logs,
            summary
        };

    } catch (error) {
        log(`❌ Sync failed: ${error.message}`);
        return { success: false, logs, summary };
    }
}

/**
 * Fetches available sales channels (publications) from Shopify
 * @returns {Promise<Array>} Array of channels with id and name
 */
async function fetchShopifyChannels() {
    try {
        const query = `
        {
            publications(first: 20) {
                edges {
                    node {
                        id
                        name
                        supportsFuturePublishing
                        app {
                            title
                        }
                    }
                }
            }
        }
        `;

        const response = await axios.post(
            SHOPIFY_API_URL,
            { query },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.errors) {
            console.error('[Shopify] GraphQL errors:', response.data.errors);
            throw new Error(response.data.errors[0]?.message || 'Failed to fetch channels');
        }

        const publications = response.data?.data?.publications?.edges || [];
        return publications.map(edge => ({
            id: edge.node.id,
            name: edge.node.name || edge.node.app?.title || 'Unnamed Channel',
            supportsFuturePublishing: edge.node.supportsFuturePublishing
        }));
    } catch (error) {
        console.error('[Shopify] Failed to fetch channels:', error.message);
        throw new Error(`Failed to fetch Shopify channels: ${error.message}`);
    }
}

/**
 * Publishes a product to a specific sales channel
 * @param {string} productId - Shopify product GID
 * @param {string} publicationId - Shopify publication GID
 * @returns {Promise<boolean>} Success status
 */
async function publishProductToChannel(productId, publicationId) {
    try {
        const mutation = `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
                publishable {
                    availablePublicationsCount {
                        count
                    }
                }
                userErrors {
                    field
                    message
                }
            }
        }
        `;

        const response = await axios.post(
            SHOPIFY_API_URL,
            {
                query: mutation,
                variables: {
                    id: productId,
                    input: [{ publicationId }]
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        const userErrors = response.data?.data?.publishablePublish?.userErrors || [];
        if (userErrors.length > 0) {
            console.error('[Shopify] Publish errors:', userErrors);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Shopify] Failed to publish to channel:', error.message);
        return false;
    }
}

/**
 * Fetches available locations from Shopify
 * @returns {Promise<string>} Primary location ID
 */
async function fetchShopifyLocations() {
    if (primaryLocationId) return primaryLocationId;

    try {
        const response = await axios.get(`${SHOPIFY_REST_URL}/locations.json`, {
            headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
            }
        });

        const locations = response.data.locations || [];
        if (locations.length === 0) throw new Error('No locations found in Shopify');

        // Prefer active, fulfillment-oriented locations
        const primary = locations.find(loc => loc.active) || locations[0];
        primaryLocationId = primary.id;
        console.log(`[Shopify] Using primary location: ${primary.name} (${primaryLocationId})`);
        return primaryLocationId;
    } catch (error) {
        throw new Error(`Failed to fetch Shopify locations: ${error.message}`);
    }
}

/**
 * Update stock level in Shopify using InventoryLevel API
 * @param {string} inventoryItemId - Shopify inventory item ID
 * @param {string} locationId - Shopify location ID
 * @param {number} available - New quantity available
 * @returns {Promise<Object>} Updated inventory level
 */
async function updateShopifyStock(inventoryItemId, locationId, available) {
    try {
        const response = await axios.post(
            `${SHOPIFY_REST_URL}/inventory_levels/set.json`,
            {
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: available
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.inventory_level;
    } catch (error) {
        throw new Error(`Failed to update Shopify stock: ${error.message}`);
    }
}

module.exports = {
    startSync,
    fetchInflowProducts,
    searchShopifyBySku,
    createShopifyProduct,
    updateShopifyProduct,
    updateShopifyVariant,
    updateShopifyStock,
    fetchShopifyChannels,
    publishProductToChannel,
    fetchShopifyLocations
};
