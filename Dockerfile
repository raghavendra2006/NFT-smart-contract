FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies (cache layer)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the application
COPY . .

# Compile contracts
RUN npx hardhat compile

# Default command runs the test suite
CMD ["npx", "hardhat", "test"]
