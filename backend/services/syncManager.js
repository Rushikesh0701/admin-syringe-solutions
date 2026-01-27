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

// Cache for Shopify location ID
let primaryLocationId = null;

/**
 * Gets the base Shopify API URL
 */
function getApiUrl() {
    const shopDomain = process.env.PUBLIC_STORE_DOMAIN;
    return `https://${shopDomain}/admin/api/2024-01/graphql.json`;
}

/**
 * Gets the REST API URL
 */
function getRestUrl() {
    const shopDomain = process.env.PUBLIC_STORE_DOMAIN;
    return `https://${shopDomain}/admin/api/2024-01`;
}

/**
 * Gets the Admin access token
 */
function getAccessToken() {
    return process.env.PRIVATE_STOREFRONT_API_TOKEN;
}

/**
 * Returns the Shopify OAuth URL to start the authentication process
 */
function getAuthUrl() {
    const shopDomain = process.env.PUBLIC_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_API_KEY;
    const scopes = 'read_inventory,read_products,read_publications,write_inventory,write_products,write_publications';
    const redirectUri = `http://localhost:8080/api/shopify/callback`;

    console.log('[AUTH] Generating URL for Client ID:', clientId);

    if (!clientId) {
        throw new Error('SHOPIFY_API_KEY is not defined in backend/.env');
    }

    return `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
}

/**
 * Exchanges the OAuth code for a permanent access token
 */
async function exchangeCodeForToken(code) {
    const shopDomain = process.env.PUBLIC_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    try {
        const url = `https://${shopDomain}/admin/oauth/access_token`;
        const response = await axios.post(url, {
            client_id: clientId,
            client_secret: clientSecret,
            code: code
        });
        return response.data;
    } catch (error) {
        console.error('[Shopify] Failed to exchange code for token:', error.response?.data || error.message);
        throw error;
    }
}

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
        // inFlow Cloud API products endpoint with images included for full-resolution URLs
        const apiVersion = '2025-10-02';
        const url = `${INFLOW_API_BASE_URL}/${INFLOW_COMPANY_ID}/products`;
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
                'include': 'images,defaultImage,defaultPrice,category,inventoryLines',  // Include all necessary data
                'count': 100
            }
        });

        // Parse JSON:API response with included relationships
        const products = response.data.data || [];
        const included = response.data.included || [];

        console.log(`[inFlow] Received ${products.length} products`);
        console.log(`[inFlow] Included ${included.length} related resources (images, etc.)`);

        // Map included resources by type and id for easy lookup
        const includedMap = {};
        included.forEach(item => {
            const key = `${item.type}:${item.id}`;
            includedMap[key] = item;
        });

        // Attach included images and defaultImage to products
        products.forEach(product => {
            // Handle images relationship
            if (product.relationships?.images?.data) {
                product.images = product.relationships.images.data.map(ref => {
                    const key = `${ref.type}:${ref.id}`;
                    return includedMap[key]?.attributes || null;
                }).filter(Boolean);
            }

            // Handle defaultImage relationship
            if (product.relationships?.defaultImage?.data) {
                const ref = product.relationships.defaultImage.data;
                const key = `${ref.type}:${ref.id}`;
                product.defaultImage = includedMap[key]?.attributes || null;
            }

            // Handle defaultPrice relationship
            if (product.relationships?.defaultPrice?.data) {
                const ref = product.relationships.defaultPrice.data;
                const key = `${ref.type}:${ref.id}`;
                product.defaultPrice = includedMap[key]?.attributes || null;
            }

            // Handle category relationship
            if (product.relationships?.category?.data) {
                const ref = product.relationships.category.data;
                const key = `${ref.type}:${ref.id}`;
                product.category = includedMap[key]?.attributes || null;
            }

            // Handle inventoryLines relationship (array)
            if (product.relationships?.inventoryLines?.data) {
                product.inventoryLines = product.relationships.inventoryLines.data.map(ref => {
                    const key = `${ref.type}:${ref.id}`;
                    return includedMap[key]?.attributes || null;
                }).filter(Boolean);
            }
        });

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
            getApiUrl(),
            { query },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
            `${getRestUrl()}/products.json`,
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
                    'X-Shopify-Access-Token': getAccessToken(),
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
            `${getRestUrl()}/variants/${numericId}.json`,
            {
                variant: {
                    id: numericId,
                    price: product.defaultPrice?.unitPrice || product.Price || product.price || '0.00',
                    sku: product.sku || product.SKU,
                    barcode: product.barcode || product.Barcode || ''
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
            `${getRestUrl()}/products/${productId}.json`,
            {
                product: {
                    id: productId,
                    title: product.name || product.Name || '',
                    body_html: product.description || product.Description || '',
                    vendor: product.vendor || product.Vendor || '',
                    product_type: product.category || product.Category || '',
                    images: product.defaultImage?.originalUrl ? [{ src: product.defaultImage.originalUrl }] :
                        (product.images && product.images.length > 0 ? product.images.map(img => ({ src: img.originalUrl || img.url })) : [])
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
        if (!getAccessToken() || !process.env.PUBLIC_STORE_DOMAIN) {
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
        const withImages = inflowProducts.find(p => p.images?.length > 0 || p.defaultImage || p.attributes?.imageUrl);
        if (withImages) {
            const imgUrl = withImages.images?.[0]?.originalUrl || withImages.defaultImage?.originalUrl || withImages.attributes?.imageUrl;
            log(`📸 Found product with images: ${withImages.attributes.name} - ${imgUrl}`);
        } else {
            log('⚠️ No products found with images in this batch.');
        }

        // Debug: Find product with non-zero stock
        const withStock = inflowProducts.find(p => {
            const invLines = p.inventoryLines || [];
            const total = invLines.reduce((sum, line) => sum + (parseFloat(line.quantityOnHand || line.quantity) || 0), 0);
            return total > 0 || parseFloat(p.attributes?.totalQuantityOnHand) > 0;
        });
        if (withStock) {
            const invLines = withStock.inventoryLines || [];
            const total = invLines.reduce((sum, line) => sum + (parseFloat(line.quantityOnHand || line.quantity) || 0), 0);
            log(`🔢 Found product with stock: ${withStock.attributes.name} - Stock: ${total || withStock.attributes.totalQuantityOnHand}`);
        }

        // Batch processing configuration
        const BATCH_SIZE = 5; // Process 5 products concurrently
        log(`🚀 Starting batch sync (${BATCH_SIZE} products at a time)...`);

        // Prepare all products for processing
        const productsToSync = inflowProducts
            .map(item => {
                const attr = item.attributes || {};
                const inflowProduct = item; // Full product object for image extraction

                // Comprehensive image URL extraction with quality prioritization
                let imageUrl = null;

                // Method 1: images array - prioritize originalUrl (from /products endpoint with include=images)
                if (inflowProduct.images && Array.isArray(inflowProduct.images) && inflowProduct.images.length > 0) {
                    // First priority: originalUrl
                    if (inflowProduct.images[0].originalUrl) {
                        imageUrl = inflowProduct.images[0].originalUrl;
                    } else if (inflowProduct.images[0].largeUrl) {
                        imageUrl = inflowProduct.images[0].largeUrl;
                    } else if (inflowProduct.images[0].mediumUncroppedUrl) {
                        imageUrl = inflowProduct.images[0].mediumUncroppedUrl;
                    } else if (inflowProduct.images[0].mediumUrl) {
                        imageUrl = inflowProduct.images[0].mediumUrl;
                    } else if (inflowProduct.images[0].smallUrl) {
                        imageUrl = inflowProduct.images[0].smallUrl;
                    } else if (inflowProduct.images[0].thumbUrl) {
                        imageUrl = inflowProduct.images[0].thumbUrl;
                    }
                }

                // Method 2: defaultImage object - prioritize originalUrl (from /products endpoint with include=defaultImage)
                if (!imageUrl && inflowProduct.defaultImage) {
                    // First priority: originalUrl
                    if (inflowProduct.defaultImage.originalUrl) {
                        imageUrl = inflowProduct.defaultImage.originalUrl;
                    } else if (inflowProduct.defaultImage.largeUrl) {
                        imageUrl = inflowProduct.defaultImage.largeUrl;
                    } else if (inflowProduct.defaultImage.mediumUncroppedUrl) {
                        imageUrl = inflowProduct.defaultImage.mediumUncroppedUrl;
                    } else if (inflowProduct.defaultImage.mediumUrl) {
                        imageUrl = inflowProduct.defaultImage.mediumUrl;
                    } else if (inflowProduct.defaultImage.smallUrl) {
                        imageUrl = inflowProduct.defaultImage.smallUrl;
                    } else if (inflowProduct.defaultImage.thumbUrl) {
                        imageUrl = inflowProduct.defaultImage.thumbUrl;
                    }
                }

                // Method 3: Direct image fields from /productlistings endpoint (fallback only)
                // /productlistings returns: imageUrl, imageMediumUrl, imageThumbUrl directly on the product
                // Note: These don't have originalUrl, so only use as fallback
                if (!imageUrl) {
                    if (attr.imageUrl) {
                        imageUrl = attr.imageUrl;
                    } else if (attr.imageMediumUrl) {
                        imageUrl = attr.imageMediumUrl;
                    } else if (attr.imageThumbUrl) {
                        imageUrl = attr.imageThumbUrl;
                    }
                }

                // Calculate total quantity from inventoryLines
                let totalQuantity = 0;
                if (inflowProduct.inventoryLines && Array.isArray(inflowProduct.inventoryLines)) {
                    totalQuantity = inflowProduct.inventoryLines.reduce((sum, line) => {
                        return sum + (parseFloat(line.quantityOnHand || line.quantity) || 0);
                    }, 0);
                }

                // Debug: Log image URL extraction for first product
                if (attr.sku && !global.imageDebugLogged) {
                    console.log(`[DEBUG] Product: ${attr.name}`);
                    console.log(`[DEBUG] Has images array:`, inflowProduct.images?.length || 0);
                    console.log(`[DEBUG] Has defaultImage:`, !!inflowProduct.defaultImage);
                    console.log(`[DEBUG] Final imageUrl:`, imageUrl);
                    global.imageDebugLogged = true;
                }

                return {
                    sku: attr.sku,
                    name: attr.name,
                    description: attr.description,
                    price: inflowProduct.defaultPrice?.unitPrice || attr.unitPrice || '0.00',
                    totalQuantityOnHand: totalQuantity || attr.totalQuantityOnHand || 0,
                    category: inflowProduct.category?.name || attr.categoryName || '',
                    vendor: attr.lastVendorName || '',
                    primaryImageUrl: imageUrl,
                    defaultImage: imageUrl ? {
                        originalUrl: imageUrl
                    } : null,
                    images: imageUrl ? [{ originalUrl: imageUrl }] : []
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
            getApiUrl(),
            { query },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
            getApiUrl(),
            {
                query: mutation,
                variables: {
                    id: productId,
                    input: [{ publicationId }]
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
        const response = await axios.get(`${getRestUrl()}/locations.json`, {
            headers: {
                'X-Shopify-Access-Token': getAccessToken()
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
            `${getRestUrl()}/inventory_levels/set.json`,
            {
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: available
            },
            {
                headers: {
                    'X-Shopify-Access-Token': getAccessToken(),
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
    fetchShopifyLocations,
    getAuthUrl,
    exchangeCodeForToken
};
