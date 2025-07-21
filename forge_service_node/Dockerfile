# ------------------------------------------------------------------------------
# Developed by @jams2blues – ZeroContract Studio
# File:    forge_service_node/Dockerfile
# Rev :    r1   2025‑07‑21
# Summary: Build configuration for the Octez-based forge service.  Uses the
#          official Node 18 Bookworm base image, installs the Nomadic Labs
#          Octez client via APT and copies the forge service into the
#          container.  The service listens on port 8000 by default.
# ------------------------------------------------------------------------------

# Use the Debian 12 (bookworm) base image to satisfy Octez dependencies
FROM node:18-bookworm

# Install Octez client (tezos-client) following Nomadic Labs' instructions
RUN apt-get update && \
    apt-get install -y --no-install-recommends gpg curl ca-certificates && \
    export distribution=debian && \
    export release=bookworm && \
    curl -s "https://packages.nomadic-labs.com/${distribution}/octez.asc" | \
      gpg --dearmor -o /usr/share/keyrings/octez.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/octez.gpg] https://packages.nomadic-labs.com/${distribution} ${release} main" > /etc/apt/sources.list.d/octez.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends octez-client && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package manifest and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application code
COPY index.js ./

# Expose the service port
EXPOSE 8000

# Define the default command
CMD ["node", "index.js"]