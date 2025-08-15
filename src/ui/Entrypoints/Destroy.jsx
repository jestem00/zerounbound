/*Developed by @jams2blues – ZeroContract Studio
  File: src/ui/Entrypoints/Destroy.jsx
  Rev:  r865   2025‑08‑15
  Summary: warn‑first dialog with repair links; success overlay kept */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
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

/*──────── helpers ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Box = styled.div`position:relative;flex:1;`;
const Spin = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const LinkRow = styled.div`
  display:flex;flex-wrap:wrap;gap:.35rem;margin:.35rem 0 .1rem;
`;
const API = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/* robust decode – never throw */
function decodeMeta(src = '') {
  try {
    const txt = typeof src === 'string' ? src : JSON.stringify(src);
    return JSON.parse(txt);
  } catch { return {}; }
}

/*──────────────── component ────────────────────────────────*/
export default function Destroy({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  /* deep‑link to AdminTools modals */
  const openAdminTool = useCallback((key) => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zu:openAdminTool', {
          detail: { key, contract: contractAddress },
        }));
      }
    } catch { /* noop */ }
  }, [contractAddress]);

  /* token list */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, network, true));
    setLoadingTok(false);
  }, [contractAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* ui state */
  const [tokenId, setTokenId]   = useState('');
  const [meta,    setMeta]      = useState(null);
  const [ov,      setOv]        = useState({ open: false });
  const [confirmOpen, setConfirm] = useState(false);
  const closeTimer = useRef(null);

  /*── metadata loader ───────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;

    /* indexed row */
    let rows = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    ).catch(() => []);

    /* big‑map fallback */
    if (!rows.length) {
      const one = await jFetch(
        `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
      ).catch(() => null);
      if (one?.value) rows = [{ metadata: decodeMeta(hex2str(one.value)) }];
    }

    let m = rows?.[0]?.metadata ?? {};
    if (typeof m === 'string') m = decodeMeta(m);
    setMeta(m);
  }, [contractAddress]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  useEffect(() => () => { clearTimeout(closeTimer.current); }, []);

  /*── destroy op ────────────────────────────────────*/
  const run = async () => {
    if (!toolkit)       return snack('Connect wallet', 'error');
    if (tokenId === '') return snack('Token‑ID?', 'warning');

    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.destroy(+tokenId).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();

      /* success overlay */
      setOv({ open: true, status: 'Destroyed ✓', success: true });
      closeTimer.current = setTimeout(() => setOv({ open: false }), 1600);

      snack('Destroyed ✓', 'success');
      onMutate();
      await fetchTokens();
      setTokenId(''); setMeta(null);
    } catch (e) {
      setOv({ open: false });
      snack(e.message || String(e), 'error');
    }
  };

  /*── render ───────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Destroy&nbsp;Token</PixelHeading>
      <HelpBox>
        V4 contracts replace burn with an admin‑only “hard” destroy:
        sets <strong>total_supply = 0</strong> and marks token as destroyed.
        Metadata remains for provenance. You must own <em>all</em> editions.
        <br />
        <strong>Prefer repair:</strong> storage is already paid. Use the tools below to fix mistakes instead of wasting funds.
      </HelpBox>

      {/* quick alternatives */}
      <LinkRow aria-label="Quick alternatives">
        <PixelButton size="xs" onClick={() => openAdminTool('append_artifact_uri')}>Replace Artifact</PixelButton>
        <PixelButton size="xs" onClick={() => openAdminTool('append_extrauri')}>Replace ExtraUri</PixelButton>
        <PixelButton size="xs" onClick={() => openAdminTool('repair_uri')}>Repair URI</PixelButton>
        <PixelButton size="xs" onClick={() => openAdminTool('clear_uri')}>Clear URI</PixelButton>
        <PixelButton size="xs" onClick={() => openAdminTool('edit_token_metadata')}>Edit Token Meta</PixelButton>
      </LinkRow>

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <PixelInput
          placeholder="Token‑ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <Box>
          <select
            style={{ width: '100%', height: 32 }}
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
          {loadingTok && <Spin />}
        </Box>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
        />
      </div>

      <PixelButton
        warning
        style={{ marginTop: '1rem' }}
        disabled={tokenId === ''}
        onClick={() => setConfirm(true)}
      >
        Destroy
      </PixelButton>

      <PixelConfirmDialog
        open={confirmOpen}
        title="Before you Destroy"
        message={(
          <>
            <p style={{ marginTop: 0 }}>
              <strong>WAIT!</strong>&nbsp;Are you sure you don’t want to <strong>repair</strong>?
              Storage is already paid — don’t waste gas/value.
            </p>
            <ul style={{ margin: '8px 0 10px 16px' }}>
              <li>
                <a href="#"
                   onClick={(e) => { e.preventDefault(); setConfirm(false); openAdminTool('append_artifact_uri'); }}>
                  Replace Artifact
                </a>
              </li>
              <li>
                <a href="#"
                   onClick={(e) => { e.preventDefault(); setConfirm(false); openAdminTool('append_extrauri'); }}>
                  Replace ExtraUri
                </a>
              </li>
              <li>
                <a href="#"
                   onClick={(e) => { e.preventDefault(); setConfirm(false); openAdminTool('repair_uri'); }}>
                  Repair URI
                </a>
              </li>
              <li>
                <a href="#"
                   onClick={(e) => { e.preventDefault(); setConfirm(false); openAdminTool('clear_uri'); }}>
                  Clear URI
                </a>
              </li>
              <li>
                <a href="#"
                   onClick={(e) => { e.preventDefault(); setConfirm(false); openAdminTool('edit_token_metadata'); }}>
                  Edit Token Metadata
                </a>
              </li>
            </ul>
            <p>
              This will <strong>permanently reduce</strong> supply of token&nbsp;<code>{tokenId}</code> to 0.
              Metadata remains on‑chain for provenance. Continue?
            </p>
          </>
        )}
        onOk={() => { setConfirm(false); run(); }}
        onCancel={() => setConfirm(false)}
      />

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
/* What changed & why:
   • Added repair‑first quick links + deep‑linked confirm.
   • Kept success overlay with auto‑dismiss.
   • Rev‑bump to r865; lint‑clean. */
