/*─────────────────────────────────────────────────────────────
  File: src/ui/Entrypoints/ClearUri.jsx                     r438
  Summary: Clean “Clear URI” panel
           • token-dropdown “— none —” placeholder
           • TokenMetaPanel renders URIs with inline ✕ remove
           • Re-usable PixelConfirmDialog for confirmations
─────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import { Buffer }                from 'buffer';
import styledPkg                 from 'styled-components';

import PixelHeading              from '../PixelHeading.jsx';
import PixelInput                from '../PixelInput.jsx';
import PixelButton               from '../PixelButton.jsx';
import OperationOverlay          from '../OperationOverlay.jsx';
import PixelConfirmDialog        from '../PixelConfirmDialog.jsx';
import TokenMetaPanel            from '../TokenMetaPanel.jsx';

import { listUriKeys }           from '../../utils/uriHelpers.js';
import { useWalletContext }      from '../../contexts/WalletContext.js';
import { jFetch }                from '../../core/net.js';
import { TZKT_API }              from '../../config/deployTarget.js';

if (typeof window !== 'undefined' && !window.Buffer)
  window.Buffer = Buffer;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.5rem;`;

const API     = `${TZKT_API}/v1`;
const hex2str = (h) =>
  Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

export default function ClearUri({
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
    const push = (arr) =>
      arr.forEach((n) => Number.isFinite(n) && seen.add(n));

    try {
      push(
        (await jFetch(
          `${API}/tokens?contract=${contractAddress}&select=tokenId&limit=10000`,
        ).catch(() => []))
          .map((r) => +r.tokenId),
      );
    } catch {}
    if (!seen.size) {
      try {
        push(
          (await jFetch(
            `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`,
          ).catch(() => []))
            .map((r) => +r.key),
        );
      } catch {}
    }
    setTokOpts([...seen].sort((a, b) => a - b));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─*/
  const [tokenId, setTokenId]   = useState('');
  const [meta,    setMeta]      = useState(null);
  const [keys,    setKeys]      = useState([]);

  /* confirm dialog key */
  const [confirmKey, setConfirmKey] = useState('');

  /* overlay */
  const [ov, setOv] = useState({ open: false });

  /*──────── meta loader ─*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setKeys([]); setConfirmKey('');
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
    const m = rows?.[0]?.metadata || {};
    setMeta(m);
    setKeys(listUriKeys(m));
  }, [contractAddress]);

  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── clear op ────*/
  const clearUri = async (k) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, k).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      snack('Cleared ✓', 'success');
      onMutate();
      loadMeta(tokenId);
      setOv({ open: false });
    } catch (e) {
      setOv({ open: false });
      snack(e.message, 'error');
    }
  };

  /*──────── helpers ─────*/
  const tokenPlaceholder = loadingTok
    ? 'Loading…'
    : tokOpts.length ? 'Select token' : '— none —';

  /*──────── JSX ────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Clear&nbsp;URI</PixelHeading>

      {/* token-picker */}
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) =>
            setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <select
          style={{ flex: 1, height: 32 }}
          disabled={loadingTok}
          value={tokenId || ''}
          onChange={(e) => setTokenId(e.target.value)}
        >
          <option value="">{tokenPlaceholder}</option>
          {tokOpts.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      {/* preview + inline remove buttons */}
      <div style={{ marginTop: '1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          onRemove={(k) => setConfirmKey(k)}
        />
      </div>

      {/* external link */}
      {tokenId && (
        <p
          style={{
            fontSize: '.7rem',
            textAlign: 'center',
            marginTop: '.4rem',
          }}
        >
          <a
            href={`/contracts/${contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            open&nbsp;in&nbsp;/contracts/{contractAddress}
          </a>
        </p>
      )}

      {/* confirm dialog */}
      <PixelConfirmDialog
        open={!!confirmKey}
        message={`Remove “${confirmKey}” from token ${tokenId}?`}
        onOk={() => {
          const k = confirmKey;
          setConfirmKey('');
          clearUri(k);
        }}
        onCancel={() => setConfirmKey('')}
      />

      {/* overlay */}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => {
            if (confirmKey) clearUri(confirmKey);
          }}
          onCancel={() => setOv({ open: false })}
        />
      )}
    </Wrap>
  );
}
/* EOF */
