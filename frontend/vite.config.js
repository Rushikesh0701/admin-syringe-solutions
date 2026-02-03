import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react({
            template: {
                compilerOptions: {
                    isCustomElement: (tag) => tag.startsWith('ui-')
                }
            }
        })
    ],
    server: {
        port: 3000,
        // Proxy /api requests to the backend server
        proxy: {
            '/api': {
                // target: 'http://localhost:8080',
                // target: 'https://admin-syringe-solutions.onrender.com',
                target: 'http://184.72.175.48:8080',
                changeOrigin: true,
                secure: false
            }
        }
    }
})
