/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/ClearUri.jsx
  Rev :    r903   2025‑08‑01
  Summary: I101‑compliant picker, drop /contracts link
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import { Buffer }            from 'buffer';
import styledPkg             from 'styled-components';

import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import OperationOverlay      from '../OperationOverlay.jsx';
import PixelConfirmDialog    from '../PixelConfirmDialog.jsx';
import TokenMetaPanel        from '../TokenMetaPanel.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';

import { listUriKeys }       from '../../utils/uriHelpers.js';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import { jFetch }            from '../../core/net.js';
import { TZKT_API }          from '../../config/deployTarget.js';
import listLiveTokenIds      from '../../utils/listLiveTokenIds.js';

/*──────── styled shells ─────*/
const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap    = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const FieldWrap = styled.div`
  display:flex;flex-direction:column;gap:.45rem;flex:1;
`;
const Picker = styled.div`display:flex;gap:.5rem;`;
const SelectWrap = styled.div`position:relative;flex:1;`;
const Spinner = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
/*──────── helpers ─────*/
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function ClearUri({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const { toolkit, network='ghostnet' } = useWalletContext() || {};
  const snack = (m, s='info') => setSnackbar({ open:true, message:m, severity:s });

  /* token list */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    const live = await listLiveTokenIds(contractAddress, network, true);
    setTokOpts(live);
    setLoadingTok(false);
  }, [contractAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* local state */
  const [tokenId,   setTokenId]   = useState('');
  const [meta,      setMeta]      = useState(null);
  const [keys,      setKeys]      = useState([]);
  const [confirmKey,setConfirmKey]= useState('');
  const [ov,        setOv]        = useState({ open:false });

  /* meta loader */
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
    const m = rows[0]?.metadata || {};
    setMeta(m); setKeys(listUriKeys(m));
  }, [contractAddress]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* clear op */
  const clearUri = async (k) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open:true, status:'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, k).send();
      setOv({ open:true, status:'Broadcasting…' });
      await op.confirmation();
      snack('Cleared ✓', 'success');
      onMutate(); loadMeta(tokenId); setOv({ open:false });
    } catch (e) {
      setOv({ open:false }); snack(e.message, 'error');
    }
  };

  /*──────── JSX ───*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Clear&nbsp;URI</PixelHeading>
      <HelpBox>
        Remove any metadata URI key from a token (e.g.&nbsp;artifactUri, thumbnailUri,
        extrauri_*). Pick <strong>Token‑ID</strong> → click trash icon beside the key →
        confirm. Useful before re‑uploading or fixing typos.
      </HelpBox>  

      {/* token picker */}
      <Picker>
        <FieldWrap>
          <label htmlFor="tokenId">Token‑ID *</label>
          <PixelInput
            id="tokenId"
            placeholder="e.g. 42"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
          />
        </FieldWrap>

        <FieldWrap>
          <label htmlFor="tokSelect">Owned Tokens</label>
          <SelectWrap>
            <select
              id="tokSelect"
              style={{ width:'100%', height:32 }}
              disabled={loadingTok}
              value={tokenId || ''}
              onChange={(e) => setTokenId(e.target.value)}
            >
              <option value="">
                {loadingTok
                  ? 'Loading…'
                  : tokOpts.length ? 'Select token' : '— none —'}
              </option>
              {tokOpts.map((t) => {
                const id   = typeof t === 'object' ? t.id   : t;
                const name = typeof t === 'object' ? t.name : '';
                return (
                  <option key={id} value={id}>
                    {name ? `${id} — ${name}` : id}
                  </option>
                );
              })}
            </select>
            {loadingTok && <Spinner />}
          </SelectWrap>
        </FieldWrap>
      </Picker>

      {/* preview + inline delete */}
      <div style={{ marginTop:'1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
          onRemove={(k) => setConfirmKey(k)}
        />
      </div>

      <PixelConfirmDialog
        open={!!confirmKey}
        message={`Remove “${confirmKey}” from token ${tokenId}?`}
        onOk={() => { const k = confirmKey; setConfirmKey(''); clearUri(k); }}
        onCancel={() => setConfirmKey('')}
      />

      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => { if (confirmKey) clearUri(confirmKey); }}
          onCancel={() => setOv({ open:false })}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Conformed to I101 token‑picker spec (FieldWrap + labels + names).
   • Removed redundant “open in /contracts/…” link.
   • Rev bump to r903; style parity & a11y labels added. */
/* EOF */
