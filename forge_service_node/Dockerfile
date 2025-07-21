#─────────────────────────────────────────────────────────────────
#  Dockerfile for the Zerounbound forge service
#
#  This image installs the official Octez client from the Nomadic
#  Labs package repository and then installs the Node.js service
#  defined in this directory.  The image uses the Node 18 base
#  image running on Debian (Bullseye/Bookworm).  The apt
#  instructions mirror the Tezos documentation to ensure the
#  latest Octez binaries are installed.  Only the client is
#  required; the node or baker components are not installed to
#  minimise footprint.  See the Tezos docs for details【489618868475251†L63-L73】.
#─────────────────────────────────────────────────────────────────

FROM node:18-bullseye

# Install prerequisites and the Octez client.  We follow the
# official installation guide for Debian/Ubuntu: add the Nomadic
# Labs signing key, register the package repository and install
# octez-client.  If you wish to target a different distribution
# set the distribution and release variables accordingly.  See
# https://packages.nomadic-labs.com for supported releases.  The
# commands below correspond to the steps described in the Tezos
# documentation【489618868475251†L63-L73】.

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

# Create app directory
WORKDIR /usr/src/app

# Copy package manifest and install production dependencies.  The
# separate copy of package files allows Docker to cache NPM
# install steps when code changes are made to index.js.
COPY package.json ./
RUN npm install --production

# Copy the remainder of the service code
COPY index.js ./

# Expose the port used by the forge service (Render uses this to
# map traffic).  The default in index.js is 8000 but this can be
# overridden with the PORT environment variable at deploy time.
EXPOSE 8000

# Start the service
CMD [ "node", "index.js" ]