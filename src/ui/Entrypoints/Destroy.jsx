/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Destroy.jsx
  Rev :    r428   2025-06-07
  Summary: v4 destroy helper – token picker, metadata preview,
           irreversible confirmation, overlay & snackbar
──────────────────────────────────────────────────────────────*/

import React, { useCallback, useEffect, useState } from 'react';
import { Buffer }          from 'buffer';
import styledPkg           from 'styled-components';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import TokenMetaPanel      from '../TokenMetaPanel.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';

/* polyfill */
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────── shells ──────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled('section')`margin-top:1.5rem;`;

/*──────── helpers ─────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

export default function Destroy({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  /*──────── token list ───*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    const seen = new Set();
    const push = (a) => a.forEach((n) => Number.isFinite(n) && seen.add(n));

    /* preferred: /tokens */
    try {
      push((await jFetch(
        `${API}/tokens?contract=${contractAddress}&select=tokenId&limit=10000`,
      ).catch(() => [])).map((r) => +r.tokenId));
    } catch {}
    /* fallback: bigmap */
    if (!seen.size) {
      try {
        push((await jFetch(
          `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`,
        ).catch(() => [])).map((r) => +r.key));
      } catch {}
    }
    setTokOpts([...seen].sort((a, b) => a - b));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─*/
  const [tokenId, setTokenId] = useState('');
  const [meta,    setMeta]    = useState(null);

  const [ov, setOv] = useState({ open: false });

  /*──────── meta loader ─*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;

    let rows = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    ).catch(() => []);

    if (!rows.length) {
      const one = await jFetch(
        `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
      ).catch(() => null);
      if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }];
    }
    setMeta(rows?.[0]?.metadata || {});
  }, [contractAddress]);

  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── destroy op ───*/
  const run = async () => {
    if (!toolkit)           return snack('Connect wallet', 'error');
    if (tokenId === '')     return snack('Token-ID?', 'error');

    const idNat = +tokenId;
    if (!Number.isFinite(idNat))     return snack('Invalid Token-ID', 'error');

    const warn = `This will permanently destroy token ${idNat}. `
               + 'The action is irreversible and the token ID '
               + 'may be reused by the contract. Continue?';
    if (!window.confirm(warn)) return;

    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.destroy(idNat).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();

      snack('Destroyed ✓', 'success');
      onMutate();
      fetchTokens();        /* refresh token list */
      setTokenId('');
      setMeta(null);
      setOv({ open: false });
    } catch (e) {
      setOv({ open: false });
      snack(e.message, 'error');
    }
  };

  /*──────── JSX ────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Destroy&nbsp;Token</PixelHeading>

      {/* token dropdown + manual */}
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <select
          style={{ flex: 1, height: 32 }}
          disabled={loadingTok}
          value={tokenId || ''}
          onChange={(e) => setTokenId(e.target.value)}
        >
          <option value="">
            {loadingTok ? 'Loading…' : 'Select token'}
          </option>
          {tokOpts.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>

      {/* preview */}
      <div style={{ marginTop: '1rem' }}>
        <TokenMetaPanel meta={meta} tokenId={tokenId} />
      </div>

      <PixelButton
        style={{ marginTop: '1rem' }}
        onClick={run}
        disabled={tokenId === ''}
        warning
      >
        Destroy
      </PixelButton>

      {/* overlay */}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={run}
          onCancel={() => setOv({ open: false })}
        />
      )}
    </Wrap>
  );
}
/* EOF */
