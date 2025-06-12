/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Burn.jsx
  Rev :    r664   2025-06-22
  Summary: owned-token dropdown fix
           • handles numeric rows from ?select=token.tokenId
           • dropdown now lists wallet-owned ids correctly
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
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
const Wrap   = styled.section`margin-top:1.5rem;`;
const Picker = styled.div`display:flex;gap:.5rem;`;
const Box    = styled.div`position:relative;flex:1;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/*──────── helpers ────────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function Burn({
  contractAddress = '',
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
    setSnackbar({ open: true, message: m, severity: s });

  /*──────── token list (wallet-owned only) ───────────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress || !walletAddress) return;
    setLoadingTok(true);

    try {
      const live = await listLiveTokenIds(contractAddress, network);
      if (!live.length) { setTokOpts([]); return; }

      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';

      /* ① fast path (with ?select) */
      let rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${walletAddress}`
        + `&token.contract=${contractAddress}`
        + `&balance.gt=0`
        + `&select=token.tokenId&limit=10000`,
      ).catch(() => []);

      /* ② legacy path (older TzKT: ?select bug) */
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
            r['token.tokenId']       /* ?select style          */
            ?? r.token?.tokenId      /* full object style      */
            ?? r.token_id;           /* v1–v2 legacy key       */
          return +id;
        })
        .filter(Number.isFinite);

      const ids = live.filter((n) => ownedIds.includes(n)).sort((a, b) => a - b);
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
  const [ov, setOv] = useState({ open: false });

  /*──────── metadata + owned qty ─────────────────────*/
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

  /*──────── burn operation ───────────────────────────*/
  const chooseMethod = (ms = {}) =>
         ms?.burn        ??  /* v1-v4a */
         ms?.burn_tokens ??  /* older forks */
         ms?.retire      ??  /* experimental wrapper */
         null;

  const toNat = (v) => new BigNumber(v).toFixed();
  const argPerms = (tid, amt) => {
    const T = toNat(tid); const A = toNat(amt);
    return [
      { amount:A, token_id:T }, { amount:A, tokenId:T }, { amount:A, id:T },
      [A, T], [T, A], [[A, T]], [[T, A]],
    ];
  };

  const run = async () => {
    if (!toolkit)          return snack('Connect wallet', 'error');
    if (tokenId === '')    return snack('Pick a token', 'error');

    const nQty = +qty;
    if (!nQty) return snack('Enter quantity', 'error');
    if (owned != null && nQty > owned)
      return snack(`You own only ${owned}`, 'error');

    try {
      const c  = await toolkit.wallet.at(contractAddress);
      const fn = chooseMethod(c?.methods);
      if (!fn) return snack('No burn entry-point', 'error');

      let tx = null; let lastErr;
      for (const arg of argPerms(tokenId, nQty)) {
        try {
          tx = Array.isArray(arg) ? fn(...arg) : fn(arg);
          tx = await tx.send();
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

  /*──────── UI ───────────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Burn&nbsp;Tokens</PixelHeading>

      <Picker>
        <PixelInput
          placeholder="Token-ID"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
          style={{ flex:1 }}
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
      </Picker>

      <PixelInput
        placeholder="Quantity"
        type="number"
        min="1"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
        style={{ marginTop:'.5rem' }}
      />

      <div style={{ marginTop:'1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
        />
      </div>

      <PixelButton
        warning
        disabled={!qty || !tokenId}
        style={{ marginTop:'1rem' }}
        onClick={() => setConfirm(true)}
      >
        Burn
      </PixelButton>

      <PixelConfirmDialog
        open={confirmOpen}
        message={(
          <>Burn&nbsp;<code>{qty}</code>&nbsp;edition(s) of&nbsp;
            token&nbsp;<code>{tokenId}</code>?</>
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
   • fetchTokens(): handles numeric/string rows returned by
     `?select=token.tokenId` so ownedIds populates correctly.
   • Dropdown now lists wallet-owned tokens on all contract versions. */
/* EOF */
