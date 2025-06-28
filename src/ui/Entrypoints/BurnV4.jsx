/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/BurnV4.jsx
  Rev :    r908   2025‑08‑13
  Summary: robust token‑list fetch + name merge parity
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import styledPkg             from 'styled-components';

import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';
import TokenMetaPanel        from '../TokenMetaPanel.jsx';

import listLiveTokenIds      from '../../utils/listLiveTokenIds.js';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import { jFetch }            from '../../core/net.js';
import { TZKT_API }          from '../../config/deployTarget.js';

/*──────── constants ─────────────────────────────*/
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const styled    = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap      = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const FieldWrap = styled.div`display:flex;flex-direction:column;gap:.45rem;flex:1;`;
const Picker    = styled.div`display:flex;gap:.5rem;`;
const Box       = styled.div`position:relative;flex:1;`;
const Spin      = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox   = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*──────── component ────────────────────────────*/
export default function BurnV4({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const {
    address: walletAddress,
    toolkit,
    network = 'ghostnet',
  } = useWalletContext() || {};
  const kit   = toolkit || window.tezosToolkit;
  const snack = (m, s='warning') => setSnackbar({ open:true, message:m, severity:s });

  /* token list (wallet‑owned only) */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress || !walletAddress) return;
    setLoadingTok(true);
    try {
      /* live ids (+names when available) */
      const live = await listLiveTokenIds(contractAddress, network, true);
      if (!live.length) { setTokOpts([]); return; }

      /* quick map id → name (may be '') */
      const nameFromLive = new Map(
        live
          .filter((t) => typeof t === 'object' && t.name)
          .map((t) => [t.id, t.name]),
      );

      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';

      /* fast path – numeric array when ?select=token.tokenId is supported */
      let rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${walletAddress}`
        + `&token.contract=${contractAddress}`
        + `&balance.gt=0`
        + `&select=token.tokenId&limit=10000`,
      ).catch(() => []);

      /* legacy path (full objects) */
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
          /* row can be scalar or object */
          if (typeof r === 'number' || typeof r === 'string') return +r;
          return +(r['token.tokenId'] ?? r.token?.tokenId ?? r.token_id ?? NaN);
        })
        .filter(Number.isFinite);

      if (!ownedIds.length) { setTokOpts([]); return; }

      /* slice to 100 ids for URL safety when fetching missing names */
      const idSet = ownedIds
        .filter((id) => live.some((t) => (typeof t === 'object' ? t.id : t) === id))
        .sort((a, b) => a - b)
        .slice(0, 100);

      /* fetch missing names only */
      const missingIds = idSet.filter((id) => !nameFromLive.has(id));
      if (missingIds.length) {
        const rows2 = await jFetch(
          `${base}/tokens`
          + `?contract=${contractAddress}`
          + `&tokenId.in=${missingIds.join(',')}`
          + `&select=tokenId,metadata.name`
          + `&limit=${missingIds.length}`,
        ).catch(() => []);
        rows2.forEach((r) => {
          const id  = +r.tokenId;
          const nm  = r['metadata.name'] ?? r?.metadata?.name ?? r.name ?? '';
          if (nm) nameFromLive.set(id, nm.trim());
        });
      }

      const merged = idSet.map((id) => ({ id, name: nameFromLive.get(id) || '' }));
      setTokOpts(merged);
    } finally { setLoadingTok(false); }
  }, [contractAddress, walletAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* local state */
  const [tokenId, setTokenId] = useState('');
  const [amount,  setAmount ] = useState('1');
  const [meta,    setMeta  ] = useState(null);
  const [busy,    setBusy  ] = useState(false);

  /* preview */
  const API = `${TZKT_API}/v1`;
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;
    const [row] = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    ).catch(() => []);
    setMeta(row?.metadata || {});
  }, [contractAddress]);
  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* burn (transfer→burn address) */
  const send = async () => {
    if (!kit?.wallet) return snack('Connect wallet first', 'error');
    const idN  = Number(tokenId);
    const amtN = Number(amount);
    if (!Number.isInteger(idN)  || idN  < 0) return snack('Bad token‑ID');
    if (!Number.isInteger(amtN) || amtN <= 0) return snack('Bad amount');

    try {
      setBusy(true);
      const c  = await kit.wallet.at(contractAddress);
      const op = await c.methods.transfer([{
        from_: walletAddress,
        txs  : [{ to_: BURN_ADDR, token_id:idN, amount:amtN }],
      }]).send();
      snack('Burn pending…', 'info');
      await op.confirmation();
      snack('Token burned ✓', 'success');
      onMutate();
      setTokenId(''); setAmount('1'); setMeta(null);
      void fetchTokens();
    } catch (e) { snack(`Fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  };

  /*──────── UI ─────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Burn&nbsp;Tokens</PixelHeading>
      <HelpBox>
        ZeroContract&nbsp;v4 has <em>no native burn entry‑point</em>. This tool
        simply transfers your editions to the standard Tezos burn address
        (<code>{BURN_ADDR.slice(0,12)}…</code>).&nbsp;Once sent, they are
        permanently irretrievable and the collection supply is reduced.
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
          <label htmlFor="tokSel">Owned Tokens</label>
          <Box>
            <select
              id="tokSel"
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
              {tokOpts.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name ? `${id} — ${name}` : id}
                </option>
              ))}
            </select>
            {loadingTok && <Spin />}
          </Box>
        </FieldWrap>
      </Picker>

      {/* amount */}
      <FieldWrap style={{ marginTop:'.6rem' }}>
        <label htmlFor="amt">Amount *</label>
        <PixelInput
          id="amt"
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
        />
      </FieldWrap>

      {/* preview */}
      <div style={{ marginTop:'1rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
        />
      </div>

      <PixelButton
        warning
        disabled={!tokenId || !amount || busy}
        style={{ marginTop:'1rem' }}
        onClick={send}
      >
        {busy ? 'Burning…' : 'Burn'}
      </PixelButton>
    </Wrap>
  );
}
/* What changed & why:
   • fetchTokens now fully mirrors Transfer.jsx logic:
     – handles numeric rows from ?select=token.tokenId API.
     – legacy fallback when ?select unsupported.
     – merges names from live list + second /tokens query so
       dropdown shows “id — name” consistently.
   • Owned‑id parser fixed (previous NaN bug caused empty list).
   • Capped name look‑up to first 100 ids to keep URL ≤ 8 KB.
   • Rev bumped to r908.
*/
/* EOF */
