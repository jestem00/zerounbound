/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Burn.jsx
  Rev:     r911   2025‑08‑25 UTC
  Summary: Version‑aware burn for v1/v2/v3. Gates repair/edit links
           to v4/v4b/v4e only; safer confirm copy; version‑specific
           argument shapes for legacy burn entrypoints.
──────────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Buffer }            from 'buffer';
import BigNumber             from 'bignumber.js';
import styledPkg             from 'styled-components';

import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import PixelConfirmDialog    from '../PixelConfirmDialog.jsx';
import OperationOverlay      from '../OperationOverlay.jsx';
import TokenMetaPanel        from '../TokenMetaPanel.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';

import listLiveTokenIds      from '../../utils/listLiveTokenIds.js';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import { jFetch }            from '../../core/net.js';
import { TZKT_API }          from '../../config/deployTarget.js';

/* polyfill */
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section.attrs({ 'data-modal': 'burn' })
  .withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  display:grid;
  grid-template-columns:repeat(12,1fr);
  gap:1.6rem;
  position:relative;
  z-index:${(p)=>p.$level??'auto'};
  overflow-x:hidden;
  width:100%;
  @media(min-width:1800px){ gap:1.2rem; }
`;
const FormRow = styled.div`
  grid-column:1 / -1;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:1.1rem;
  @media(min-width:1800px){
    grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
    gap:1rem;
  }
`;
const FieldWrap = styled.div`
  display:flex;flex-direction:column;gap:.45rem;flex:1;
`;
const Box    = styled.div`position:relative;flex:1;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  grid-column:1 / -1;
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const LinkRow = styled.div`
  grid-column:1 / -1;
  display:flex;flex-wrap:wrap;gap:.35rem;margin:-.35rem 0 .2rem;
`;

/*──────── helpers ────────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function Burn({
  contractAddress = '',
  contractVersion = '',         /* ← AdminTools passes this; used to gate UI and args. */
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const {
    toolkit,
    address: walletAddress,
    network = 'ghostnet',
  } = useWalletContext() || {};

  const snack = (m, s = 'info') =>
    setSnackbar({ open:true, message:m, severity:s });

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

  /*──────── version features & burn shapes ──────────*/
  const vLow = (contractVersion || '').toLowerCase();

  // ZeroContract “repair/edit” flows exist only on v4/v4b/v4e; hide for legacy.
  const canRepair = useMemo(() => (
    vLow === 'v4' || vLow === 'v4b' || vLow === 'v4e'
  ), [vLow]);

  // Family bucket for burn argument shapes.
  const burnFamily = useMemo(() => {
    if (vLow === 'v1') return 'v1';
    if (vLow === 'v3') return 'v3';
    if (vLow.startsWith('v2')) return 'v2';
    if (vLow === 'v4' || vLow === 'v4b' || vLow === 'v4e') return 'v4';
    return 'unknown';
  }, [vLow]);

  /*──────── token list (wallet-owned only) ──────────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress || !walletAddress) return;
    setLoadingTok(true);

    try {
      const live = await listLiveTokenIds(contractAddress, network, true);
      if (!live.length) { setTokOpts([]); return; }

      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';

      /* fast path ( ?select ) */
      let rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${walletAddress}`
        + `&token.contract=${contractAddress}`
        + `&balance.gt=0`
        + `&select=token.tokenId&limit=10000`,
      ).catch(() => []);

      /* legacy path */
      if (!rows.length) {
        rows = await jFetch(
          `${base}/tokens/balances`
          + `?account=${walletAddress}`
          + `&token.contract=${contractAddress}`
          + `&balance.gt=0`
          + `&limit=10000`,
        ).catch(() => []);
      }

      const ownedIds = rows
        .map((r) => {
          if (typeof r === 'number' || typeof r === 'string') return +r;
          const id =
            r['token.tokenId']
            ?? r.token?.tokenId
            ?? r.token_id;
          return +id;
        })
        .filter(Number.isFinite);

      const ids = live
        .filter((t) => ownedIds.includes(typeof t === 'object' ? t.id : t))
        .sort((a, b) => (typeof a === 'object' ? a.id : a)
                      - (typeof b === 'object' ? b.id : b));
      setTokOpts(ids);
    } finally { setLoadingTok(false); }
  }, [contractAddress, walletAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ────────*/
  const [tokenId, setTokenId] = useState('');
  const [qty,     setQty]     = useState('');
  const [meta,    setMeta]    = useState(null);
  const [owned,   setOwned]   = useState(null);

  const [confirmOpen, setConfirm] = useState(false);
  const [ov, setOv] = useState({ open:false });

  /*──────── metadata + owned qty ────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOwned(null); setQty('');
    if (!contractAddress || id === '') return;

    /* metadata */
    let rows = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    ).catch(() => []);

    if (!rows.length) {
      const one = await jFetch(
        `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
      ).catch(() => null);
      if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }];
    }
    setMeta(rows[0]?.metadata || {});

    /* owned balance */
    if (!walletAddress) return;
    const base = network === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';

    try {
      const [row] = await jFetch(
        `${base}/tokens/balances`
        + `?account=${walletAddress}`
        + `&token.contract=${contractAddress}`
        + `&token.tokenId=${id}`
        + `&limit=1`,
      ).catch(() => []);

      const bal = row
        ? Number(row.balance ?? row?.['balance'] ?? 0)
        : 0;

      setOwned(bal);
      if (bal === 1) setQty('1');
    } catch { setOwned(null); }
  }, [contractAddress, walletAddress, network]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── burn operation ────────────────*/
  const chooseMethod = (ms = {}) =>
         ms?.burn        ?? ms?.burn_tokens ?? ms?.retire ?? null;

  const toNat = (v) => new BigNumber(v).toFixed();

  // Version‑specific argument permutations to minimize encode failures.
  const argPerms = (family, tid, amt) => {
    const T = toNat(tid); const A = toNat(amt);
    switch (family) {
      case 'v2':
        // v2a/b/c/d/e — registry shape ["nat"] (single value; tokenId).
        // Try tokenId first, then amount as fallback (some homebrews flipped semantics).
        return [T, A];
      case 'v1':
      case 'v3':
        // registry: ["nat","nat"] — order may vary across vintages.
        return [
          [A, T], [T, A],
          { amount:A, token_id:T }, { amount:A, tokenId:T }, { amount:A, id:T },
          [[A, T]], [[T, A]],
        ];
      case 'v4':
        // Our v4/v4b/v4e shouldn't reach here via AdminTools (mapped to BurnV4),
        // but keep a safe fallback identical to modern FA2 patterns.
        return [
          { amount:A, token_id:T }, { amount:A, tokenId:T }, { amount:A, id:T },
          [A, T], [T, A], [[A, T]], [[T, A]], T, A,
        ];
      default:
        // Unknown: try broad set.
        return [
          { amount:A, token_id:T }, { amount:A, tokenId:T }, { amount:A, id:T },
          [A, T], [T, A], [[A, T]], [[T, A]], T, A,
        ];
    }
  };

  const run = async () => {
    if (!toolkit)       return snack('Connect wallet', 'error');
    if (tokenId === '') return snack('Pick a token', 'warning');

    const nQty = +qty;
    if (!nQty) return snack('Enter quantity', 'warning');
    if (owned != null && nQty > owned)
      return snack(`You own only ${owned}`, 'error');

    try {
      const c  = await toolkit.wallet.at(contractAddress);
      const fn = chooseMethod(c?.methods);
      if (!fn) return snack('No burn entry‑point', 'error');

      setOv({ open:true, status:'Waiting for signature…' });

      let tx = null; let lastErr;
      for (const arg of argPerms(burnFamily, tokenId, nQty)) {
        try {
          const sent = Array.isArray(arg) ? fn(...arg) : fn(arg);
          tx = await sent.send();
          break;
        } catch (e) { lastErr = e; }
      }
      if (!tx) throw lastErr || new Error('Encode failed');

      setOv({ open:true, status:'Broadcasting…' });
      await tx.confirmation();

      snack('Burned ✓', 'success');
      onMutate();
      await fetchTokens();
      setTokenId(''); setQty(''); setMeta(null); setOwned(null);
      setOv({ open:false });
    } catch (e) {
      setOv({ open:false });
      snack(e.message || String(e), 'error');
    }
  };

  /*──────── UI ───────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3} style={{ gridColumn: '1 / -1' }}>Burn Tokens</PixelHeading>

      <HelpBox>
        Removes your editions from circulation. It reduces <em>your</em> balance only.
        {!canRepair && (
          <>
            <br />
            <strong>Note:</strong>&nbsp;This contract version (<code>{contractVersion || 'unknown'}</code>)
            does not support ZeroContract’s metadata repair/edit flows. Burning cannot be undone.
          </>
        )}
        {canRepair && (
          <>
            <br />
            <strong>Prefer repair:</strong>&nbsp;storage is already paid — fix mistakes instead of burning.
          </>
        )}
      </HelpBox>

      {/* quick alternatives – shown only when the contract family actually supports them */}
      {canRepair && (
        <LinkRow>
          <PixelButton size="xs" onClick={() => openAdminTool('append_artifact_uri')}>Replace Artifact</PixelButton>
          <PixelButton size="xs" onClick={() => openAdminTool('append_extrauri')}>Replace ExtraUri</PixelButton>
          <PixelButton size="xs" onClick={() => openAdminTool('repair_uri')}>Repair URI</PixelButton>
          <PixelButton size="xs" onClick={() => openAdminTool('clear_uri')}>Clear URI</PixelButton>
          <PixelButton size="xs" onClick={() => openAdminTool('edit_token_metadata')}>Edit Token Meta</PixelButton>
        </LinkRow>
      )}

      {/* Token‑ID picker */}
      <FormRow>
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
          <label htmlFor="tokenSelect">Owned Tokens</label>
          <Box>
            <select
              id="tokenSelect"
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
            {loadingTok && <Spin />}
          </Box>
        </FieldWrap>
      </FormRow>

      {/* Quantity */}
      <FormRow>
        <FieldWrap>
          <label htmlFor="qty">Quantity *</label>
          <PixelInput
            id="qty"
            placeholder="How many to burn"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
          />
        </FieldWrap>
      </FormRow>

      {/* token preview */}
      <div style={{ gridColumn: '1 / -1', marginTop:'1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
        />
      </div>

      {/* CTA */}
      <PixelButton
        warning
        disabled={!qty || !tokenId}
        style={{ marginTop:'1rem', gridColumn: '1 / -1' }}
        onClick={() => setConfirm(true)}
      >
        Burn
      </PixelButton>

      <PixelConfirmDialog
        open={confirmOpen}
        title="Before you Burn"
        message={(
          <>
            {!canRepair ? (
              <>
                <p style={{ marginTop: 0 }}>
                  This contract version (<code>{contractVersion || 'unknown'}</code>) does not
                  support on‑platform metadata repair/edit flows.
                </p>
                <p>Proceed to burn <code>{qty}</code> edition(s) of token&nbsp;<code>{tokenId}</code>?</p>
              </>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>
                  <strong>WAIT!</strong>&nbsp;Are you sure you don’t want to <strong>repair</strong>?
                  Storage is already paid — you can usually fix mistakes without burning.
                </p>
                <ul style={{ margin: '8px 0 10px 16px' }}>
                  <li><a href="#"
                         onClick={(e)=>{e.preventDefault(); setConfirm(false); openAdminTool('append_artifact_uri');}}>
                    Replace Artifact
                  </a></li>
                  <li><a href="#"
                         onClick={(e)=>{e.preventDefault(); setConfirm(false); openAdminTool('append_extrauri');}}>
                    Replace ExtraUri
                  </a></li>
                  <li><a href="#"
                         onClick={(e)=>{e.preventDefault(); setConfirm(false); openAdminTool('repair_uri');}}>
                    Repair URI
                  </a></li>
                  <li><a href="#"
                         onClick={(e)=>{e.preventDefault(); setConfirm(false); openAdminTool('clear_uri');}}>
                    Clear URI
                  </a></li>
                  <li><a href="#"
                         onClick={(e)=>{e.preventDefault(); setConfirm(false); openAdminTool('edit_token_metadata');}}>
                    Edit Token Metadata
                  </a></li>
                </ul>
                <p>Proceed to burn <code>{qty}</code> edition(s) of token&nbsp;<code>{tokenId}</code>?</p>
              </>
            )}
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
/* What changed & why:
   • Gated repair/edit quick-links to v4/v4b/v4e to prevent misleading UI
     on legacy versions (v1/v2/v3).
   • Adjusted confirm dialog copy to mirror gating and avoid dead links.
   • Version-aware arg permutations for v1 (nat,nat), v3 (nat,nat),
     and v2* (single nat) per registry; kept broad fallbacks for safety.
   • Preserved transient prop guard ($level) and existing UX.
*/
