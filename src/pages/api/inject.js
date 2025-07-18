/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/api/inject.js
  Rev :    r530   2025‑07‑18
  Summary: robust injection handler with multi‑variant fallbacks

  This serverless API route accepts a set of signed operation bytes
  and attempts to inject them onto the Tezos network.  When the
  request arrives it sanitises the payload, races across the
  configured RPC pool and tries multiple encoding strategies to
  maximise compatibility.  If any RPC accepts the operation, the
  resulting operation hash is returned.  Otherwise a 500 error is
  emitted with a helpful message.  This implementation borrows
  heavily from the front‑end fallback logic in net.js to avoid
  brittle single‑variant failures.

  NOTE: This file lives under src/pages/api to be executed by
        Next.js/Vercel edge/serverless environments.
────────────────────────────────────────────────────────────*/

import { TezosToolkit } from '@taquito/taquito';
import { RPC_URLS, selectFastestRpc } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { signedBytes, rpc: rpcHint } = req.body || {};
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }

    // Build a unique list of RPC endpoints to try
    const fastest = await selectFastestRpc().catch(() => null);
    const pool = [rpcHint, process.env.RPC_URL, fastest, ...RPC_URLS]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    // Strip an optional `0x` prefix from the signed bytes
    const hex = String(signedBytes).replace(/^0x/, '');

    /**
     * Try injecting using TezosToolkit.  Some nodes accept
     * operations via RPC through the JSON RPC interface.
     */
    async function tryInjectWithToolkit(rpc, hexValue) {
      const tk = new TezosToolkit(rpc);
      try {
        const opHash = await tk.rpc.injectOperation(hexValue);
        return opHash || null;
      } catch {
        return null;
      }
    }

    /**
     * Try injecting via the raw HTTP injection endpoint.  Different
     * nodes may expect different content types and quoting, so we
     * iterate through a handful of variants.
     */
    async function tryInjectRaw(rpc, hexValue) {
      const variants = [
        { body: `"${hexValue}"`, ct: 'application/json' },
        { body: `"0x${hexValue}"`, ct: 'application/json' },
        { body: `0x${hexValue}`, ct: 'text/plain' },
        { body: hexValue, ct: 'text/plain' },
        { body: hexValue, ct: 'application/octet-stream' },
      ];
      const url = `${rpc.replace(/\/+$/, '')}/injection/operation?chain=main`;
      for (const { body, ct } of variants) {
        const headers = ct ? { 'Content-Type': ct } : undefined;
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers,
            body,
          });
          if (resp.ok) {
            const txt = (await resp.text()).replace(/"/g, '').trim();
            if (/^o[0-9A-Za-z]{50}$/.test(txt)) return txt;
          }
        } catch {
          // Ignore network errors and try the next variant
        }
      }
      return null;
    }

    // Iterate through each RPC candidate and attempt injection
    for (const rpc of pool) {
      // First try via TezosToolkit
      const opHashViaTk = await tryInjectWithToolkit(rpc, hex);
      if (opHashViaTk) {
        return res.json({ opHash: opHashViaTk });
      }
      // Fallback to raw injection variants
      const opHashViaRaw = await tryInjectRaw(rpc, hex);
      if (opHashViaRaw) {
        return res.json({ opHash: opHashViaRaw });
      }
    }

    // Nothing succeeded
    return res.status(500).json({ error: 'All RPC inject attempts failed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}

/* What changed & why:
   • Multi-variant raw injection and TezosToolkit fallback (see net.js).
   • Sanitises input, deduplicates RPC pool and returns proper errors.
   • Revision r530 left unchanged; see deployTarget/net updates for
     environment flag improvements.
*/
