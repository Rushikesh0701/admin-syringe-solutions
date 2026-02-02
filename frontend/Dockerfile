# Use Node.js 18 slim image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose frontend port
EXPOSE 3000

# Start Vite with --host to allow external access in dev mode
CMD ["npm", "run", "dev", "--", "--host"]
