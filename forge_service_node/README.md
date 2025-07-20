/─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: forge_service_node/README.md
Rev : r1 2025‑07‑20 UTC
Summary: documentation for the Node‑based forge service used by
Zero Unbound; describes endpoints, environment variables, and
Render deployment. Keeps Ghostnet and Mainnet setups explicit.
──────────────────────────────────────────────────────────────────/

Zero Unbound Forge Service
This folder contains the Node‑based forge service used by the
Zero Unbound project. The service exposes two HTTP endpoints for
forging and injecting Tezos origination operations. It is intended
to run as a standalone web service on platforms such as Render,
Digital Ocean or any Node‑compatible host.

Endpoints
Method	Path	Description
POST	/forge	Forge an origination operation. Accepts a JSON body with code, storage and source (the manager address). Returns { forgedBytes, branch } on success.
POST	/inject	Inject a signed operation. Accepts a JSON body with signedBytes (a hex string with or without 0x prefix) and returns { opHash } on success.
GET	/healthz	Health check endpoint. Returns { status: "ok" } when the service is running. Use this path in Render’s health check configuration.

Both /forge and /inject respond with HTTP 400 when required
properties are missing, and HTTP 500 on unexpected errors. They
support CORS and JSON payloads up to 1 MB.

Environment Variables
The service uses a single environment variable:

RPC_URL – URL of the Tezos RPC node to use for forging and
injection (e.g. https://rpc.ghostnet.teztnets.com). When
undefined, the service defaults to the Ghostnet RPC. For mainnet,
set this variable to a mainnet RPC.

The server listens on the port defined by the PORT environment
variable. Render automatically sets PORT to 10000 at runtime.
When testing locally, you can specify PORT=8000 or any free port.

Local Development
To run the forge service locally:

cd forge_service_node
npm install
RPC_URL=https://rpc.ghostnet.teztnets.com PORT=8000 node index.js
Visit http://localhost:8000/healthz to confirm it is running. Use
curl or Postman to test the /forge and /inject endpoints.

Deploying on Render
Create a new Web Service: In the Render dashboard, click New → Web Service and select your GitHub repository.

Root Directory: Set to forge_service_node.

Docker Build Context Directory: forge_service_node.

Dockerfile Path: forge_service_node/Dockerfile.

Environment Variables: Add RPC_URL pointing to your target network (e.g. Ghostnet or Mainnet). Render automatically binds PORT=10000.

Health Check Path: /healthz.

Instance Type: The free tier (0.5 CPU / 512 MB) suffices for forging operations.

Auto‑Deploy: Enable to redeploy on every push to your branch.

Once deployed, the service will be reachable at
https://<your‑service>.onrender.com. You can assign a custom domain
and configure DNS (e.g. forgeghostnet.zerounbound.art). Ensure
FORGE_SERVICE_URL in src/config/deployTarget.js points to the
correct URL for each network.

Usage in Zero Unbound
The front‑end automatically calls the forge service when
FORGE_SERVICE_URL is non‑empty (see src/core/net.js). This offloads
forging and injection from the browser, avoiding payload limits in
Temple Wallet and other clients. When the remote service is
unreachable, the front‑end falls back to local forging using
Taquito’s LocalForger.

What changed & why
Created a dedicated README for the Node‑based forge service to
document its purpose, endpoints, environment variables, local usage,
Render deployment instructions, and integration with the front‑end.