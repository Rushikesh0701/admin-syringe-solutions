# inFlow to Shopify Sync Dashboard

An internal Admin Dashboard to sync products from inFlow Inventory to Shopify.

![Dashboard Preview](./docs/preview.png)

## 📁 Project Structure

```
inflow-shopify-sync/
├── backend/                    # Node.js Express API
│   ├── server.js              # Express server on port 8080
│   ├── services/
│   │   └── syncManager.js     # Sync logic (fetch inFlow → sync Shopify)
│   ├── package.json
│   └── .env.example           # Environment variables template
├── frontend/                   # React (Vite) SPA
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   └── components/
│   │       └── SyncDashboard.jsx
│   ├── vite.config.js         # Includes API proxy to backend
│   ├── tailwind.config.js
│   └── package.json
└── package.json               # Root scripts for running both
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all
```

Or install manually:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment Variables

Copy the example env file and add your API keys:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# inFlow API Configuration
INFLOW_API_KEY=your_inflow_api_key_here
INFLOW_API_URL=https://api.inflowinventory.com

# Shopify API Configuration
SHOPIFY_ACCESS_TOKEN=your_shopify_admin_access_token_here
SHOP_NAME=your-shop-name

# Server Configuration
PORT=8080

```

### 3. Run the Application

**Development Mode (runs both backend + frontend):**

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

**Access the dashboard:**

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080

## 📡 API Endpoints

### `POST /api/sync/start`

Initiates the sync process from inFlow to Shopify.

**Response:**
```json
{
  "success": true,
  "logs": [
    "[timestamp] 🚀 Starting inFlow to Shopify sync...",
    "[timestamp] 📥 Fetching products from inFlow Inventory...",
    "[timestamp] ✅ Fetched 10 products from inFlow",
    "[timestamp] 🔄 Starting Shopify sync...",
    "[timestamp] ✅ Synced SKU-101: Created",
    "[timestamp] ✅ Synced SKU-102: Updated"
  ],
  "summary": {
    "total": 10,
    "created": 3,
    "updated": 7,
    "failed": 0
  }
}
```

### `GET /api/health`

Health check endpoint.

## 🔧 Sync Logic

1. **Fetch Products**: Retrieves all products from inFlow Inventory API
2. **Search Shopify**: For each product, searches Shopify by SKU
3. **Create or Update**:
   - If SKU found → Updates Price and Stock
   - If SKU not found → Creates new product
4. **Log Progress**: Returns detailed logs for each operation

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- Axios for API calls
- dotenv for configuration

**Frontend:**
- React 18 + Vite
- Tailwind CSS
- Modern glassmorphism UI

## 📝 API Credentials

### inFlow API
Get your API key from the inFlow Inventory dashboard under Settings → API.

### Shopify Admin API
1. Go to your Shopify Admin → Settings → Apps and sales channels
2. Click "Develop apps" → Create an app
3. Configure Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
4. Install the app and copy the Admin API access token

## 📄 License

ISC
# admin-syringe-solutions
