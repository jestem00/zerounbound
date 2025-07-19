"""
FastAPI forging/injection service for ZeroUnbound
==================================================

This service exposes two HTTP endpoints (`/forge` and `/inject`) that mirror
the SmartPy origination workflow without requiring a full Tezos client on
the front‑end.  It relies on the pytezos library to construct and forge
origination operations and to inject signed operations into the network.

The service accepts raw Michelson contracts and storage in plain text,
converts them to Micheline JSON using `michelson_to_micheline`【473940771531753†L483-L497】, and builds an
origination operation with generous gas/storage/fee limits if the RPC
estimator fails.  It then returns the forged bytes so that a wallet can
sign them.  The `/inject` endpoint accepts a hex string containing the
forged bytes concatenated with a signature and broadcasts the operation
via the chosen Tezos RPC endpoint.

Environment variables
---------------------

The service reads a single environment variable, `RPC_URL`, which
determines the Tezos network and node to use.  If unset, it defaults to
Ghostnet.  You can override this value when deploying (e.g. set
`RPC_URL=https://mainnet.api.tez.ie` for mainnet).

Running locally
---------------

Install the dependencies with:

```
pip install -r requirements.txt
```

Then start the server:

```
uvicorn main:app --host 0.0.0.0 --port 8000
```

Deploying to Railway / Deta / Fly
---------------------------------

This service was designed to run on any platform that supports
FastAPI.  To deploy on Railway:

* Sign up for a free account at https://railway.app.
* Click “New Project → Deploy from GitHub” and select the repository
  containing this service.
* Set the `RPC_URL` environment variable in the project settings.
* Railway will build the container automatically from the provided
  `requirements.txt` and start the server on a public URL.  You can
  configure a custom domain (e.g. `forge.zerounbound.art`) via
  Railway’s domain settings and your DNS provider.

To deploy on Deta, create a new “Micro” project using the Deta CLI
(`deta new --python`) and copy these files into the created folder.  Deta
automatically detects FastAPI applications.  Use the “Add Domain”
feature on the Deta dashboard to attach your sub‑domain.
"""

import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pytezos import pytezos  # type: ignore
from pytezos.michelson.parse import michelson_to_micheline  # type: ignore


class ForgeRequest(BaseModel):
    """Request body for the `/forge` endpoint."""

    code: Any
    storage: Any
    source: str


class ForgeResponse(BaseModel):
    """Response body for the `/forge` endpoint."""

    forgedBytes: str
    branch: str


class InjectRequest(BaseModel):
    """Request body for the `/inject` endpoint."""

    signedBytes: str


class InjectResponse(BaseModel):
    """Response body for the `/inject` endpoint."""

    opHash: str


def get_rpc_url() -> str:
    """Return the RPC endpoint defined by the RPC_URL environment variable.

    Defaults to Ghostnet if not set.
    """

    return os.environ.get("RPC_URL", "https://rpc.ghostnet.teztnets.com")


app = FastAPI(title="ZeroUnbound Forge Service", version="1.0")

# -----------------------------------------------------------------------------
# CORS configuration
#
# When this service is called from a browser‑based dApp (e.g. the ZeroUnbound
# deploy page), the browser will enforce Cross‑Origin Resource Sharing (CORS)
# policies.  Without the proper headers, the preflight OPTIONS request will
# fail and the service will appear unreachable.  Here we allow all origins
# (`*`) by default.  For increased security, restrict `allow_origins` to the
# specific domains that will call this service (e.g. 'https://zerounbound.art'
# and 'https://ghostnet.zerounbound.art').
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/forge", response_model=ForgeResponse)
async def forge_operation(req: ForgeRequest) -> ForgeResponse:
    """Forge an origination operation from raw Michelson code and storage.

    This endpoint converts Michelson strings to Micheline, constructs an
    origination operation with generous fee/gas/storage defaults, and
    returns the forged bytes and branch.  Clients should then sign the
    returned bytes (prefixed with `03`) using a Tezos wallet.  If
    forging fails the service returns a 400 or 500 error accordingly.
    """

    code = req.code
    storage = req.storage
    source = req.source
    # Convert raw Michelson to Micheline if necessary
    try:
        if isinstance(code, str):
            code = michelson_to_micheline(code)
        if isinstance(storage, str):
            storage = michelson_to_micheline(storage)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Michelson: {e}")

    # Initialise pytezos without a key; using only RPC
    ptz = pytezos.using(shell=get_rpc_url())
    try:
        # Build an origination operation.  We specify the `source`
        # explicitly so that pytezos can fetch the correct counter and
        # compute the branch.  The `balance` is set to 0 since we
        # originate contracts with no initial tez.  The `autofill` call
        # simulates the operation and fills gas/storage limits.  If the
        # simulation fails (e.g. due to large metadata) pytezos will
        # still forge the operation using generous defaults【598687368881723†L188-L193】.
        opg = ptz.origination(script={"code": code, "storage": storage}, balance=0, source=source).autofill()
        forged = opg.forge()  # hex string without 0x prefix【598687368881723†L188-L193】
        return ForgeResponse(forgedBytes=forged, branch=opg.branch)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/inject", response_model=InjectResponse)
async def inject_operation(req: InjectRequest) -> InjectResponse:
    """Inject a signed operation into the Tezos network.

    Clients must provide the concatenated forged bytes and signature (without
    any `0x` prefix).  The operation is broadcast via the RPC and the
    resulting operation hash is returned.  If the injection fails, the
    service returns a 500 error with the underlying message.
    """

    signed_bytes = req.signedBytes
    # Remove optional 0x prefix
    if signed_bytes.startswith("0x"):
        signed_bytes = signed_bytes[2:]
    try:
        payload = bytes.fromhex(signed_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex payload: {e}")
    ptz = pytezos.using(shell=get_rpc_url())
    try:
        op_hash = ptz.shell.injection.operation.post(operation=payload)
        return InjectResponse(opHash=op_hash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))