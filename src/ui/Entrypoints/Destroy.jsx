/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Destroy.jsx
  Rev :    r661   2025-06-22
  Summary: dialog API v2 + shared spinner
           • <PixelConfirmDialog open={…} onOk={…}>
           • LoadingSpinner replaces <img>
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import { Buffer }          from 'buffer';
import styledPkg           from 'styled-components';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import PixelConfirmDialog  from '../PixelConfirmDialog.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import TokenMetaPanel      from '../TokenMetaPanel.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';

import listLiveTokenIds    from '../../utils/listLiveTokenIds.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';

/* polyfill */
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/* shells */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.5rem;`;
const Box    = styled.div`position:relative;flex:1;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/* helpers */
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/* component */
export default function Destroy({
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
    setTokOpts(await listLiveTokenIds(contractAddress, network));
    setLoadingTok(false);
  }, [contractAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* state */
  const [tokenId, setTokenId]   = useState('');
  const [meta,    setMeta]      = useState(null);
  const [ov,      setOv]        = useState({ open:false });
  const [confirmOpen, setConfirm] = useState(false);

  /* meta loader */
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id==='') return;

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

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* destroy op */
  const run = async () => {
    if (!toolkit)       return snack('Connect wallet', 'error');
    if (tokenId === '') return snack('Token-ID?', 'error');

    try {
      setOv({ open:true, status:'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.destroy(+tokenId).send();
      setOv({ open:true, status:'Broadcasting…' });
      await op.confirmation();

      snack('Destroyed ✓', 'success');
      onMutate();
      await fetchTokens();
      setTokenId(''); setMeta(null);
      setOv({ open:false });
    } catch (e) {
      setOv({ open:false });
      snack(e.message || String(e), 'error');
    }
  };

  /* render */
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Destroy&nbsp;Token</PixelHeading>

      <div style={{ display:'flex', gap:'.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g,''))}
        />
        <Box>
          <select
            style={{ width:'100%',height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok
                ? 'Loading…'
                : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          {loadingTok && <Spin />}
        </Box>
      </div>

      <div style={{ marginTop:'1rem' }}>
        <TokenMetaPanel meta={meta} tokenId={tokenId} contractAddress={contractAddress}/>
      </div>

      <PixelButton
        warning
        style={{ marginTop:'1rem' }}
        disabled={tokenId === ''}
        onClick={() => setConfirm(true)}
      >
        Destroy
      </PixelButton>

      <PixelConfirmDialog
        open={confirmOpen}
        message={(
          <>
            This will <strong>permanently reduce</strong> supply of&nbsp;
            token&nbsp;<code>{tokenId}</code> to&nbsp;0.<br/>
            Metadata stays on-chain for provenance but the edition
            is transferred to a burn address.<br/><br/>
            Continue?
          </>
        )}
        onOk={() => { setConfirm(false); run(); }}
        onCancel={() => setConfirm(false)}
      />

      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={run}
          onCancel={() => setOv({ open:false })}
        />
      )}
    </Wrap>
  );
}
/* EOF */
