/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/api/inject.js
  Rev :    r4   2025‑07‑19
  Summary: serverless API to inject a signed operation.  It
           imports RPC_URLS from deployTarget.js to select a
           battle‑tested RPC without relying on environment
           variables.  The endpoint accepts a POST body with
           `signedBytes` and returns the operation hash after
           injection.  Works in both local yarn dev and Vercel
           environments without any configuration.  Increases the
           request body size limit to 512 KB for signed bytes.
──────────────────────────────────────────────────────────────*/

import { TezosToolkit } from '@taquito/taquito';
import { RPC_URLS } from '../../config/deployTarget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { signedBytes } = req.body;
    if (!signedBytes) {
      return res.status(400).json({ error: 'Missing signedBytes' });
    }
    // Use the first RPC from the network config.  No environment
    // variables are required; deployTarget.js centralises network
    // selection and RPC URLs.
    const rpcUrl = RPC_URLS[0];
    const toolkit = new TezosToolkit(rpcUrl);
    const hash = await toolkit.rpc.injectOperation(signedBytes);
    return res.status(200).json({ opHash: hash });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Inject failed' });
  }
}

// Increase the request body size limit to 0.5 MB for signed bytes.  Although
// signed operations are typically small (<10 KB), this ensures the
// API route never rejects injection requests due to body size limits.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '512kb',
    },
  },
};

/* What changed & why: Added a new serverless function to offload
   operation injection to Vercel.  It uses Taquito to inject a
   signed operation and returns the resulting operation hash.  This
   mirrors the behaviour of SmartPy’s backend deployment. */