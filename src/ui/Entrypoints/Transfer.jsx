/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Transfer.jsx
  Rev :    r906   2025‑08‑03
  Summary: token dropdown now shows “id — name” reliably
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

/*──────────────── helpers ─────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const isTz  = (s) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(s.trim());
const split = (r) => r.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const FieldWrap = styled.div`
  display:flex;flex-direction:column;gap:.45rem;flex:1;
`;
const Picker = styled.div`display:flex;gap:.5rem;`;
const Box    = styled.div`position:relative;flex:1;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;

/*──────────────── component ───────────────*/
export default function Transfer({
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

  /* ── token list ───────────────────────── */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    try {
      /* listLiveTokenIds may already return {id,name} objects */
      const live = await listLiveTokenIds(contractAddress, network, true);
      if (!live.length)        { setTokOpts([]); return; }

      /** maps for fast merge */
      const fromLive = new Map(
        live
          .filter((t) => typeof t === 'object' && t.name)
          .map((t) => [t.id, t.name]),
      );

      const ids = live
        .map((t) => (typeof t === 'object' ? t.id : t))
        .slice(0, 100);                      /* keep generous yet URL‑safe */

      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';

      /* ask TzKT for any names we may be missing */
      const rows = await jFetch(
        `${base}/tokens`
        + `?contract=${contractAddress}`
        + `&tokenId.in=${ids.join(',')}`
        + `&select=tokenId,metadata.name`
        + `&limit=${ids.length}`,
      ).catch(() => []);

      const fromApi = new Map(
        rows.map((r) => [
          Number(r.tokenId),
          /* response can vary: metadata.name, metadata, or metadata.name flattened */
          r['metadata.name']
          ?? r?.metadata?.name
          ?? r.name
          ?? '',
        ]),
      );

      /* final merge: prefer API > live > '' */
      const merged = ids.map((id) => ({
        id,
        name: (fromApi.get(id) || fromLive.get(id) || '').trim(),
      }));

      setTokOpts(merged);
    } finally { setLoadingTok(false); }
  }, [contractAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* ── local state ──────────────────────── */
  const [from,   setFrom]   = useState(walletAddress || '');
  const [tokenId,setTokenId]= useState('');
  const [amount, setAmount] = useState('1');
  const [list,   setList]   = useState('');
  const [meta,   setMeta]   = useState(null);
  const [busy,   setBusy]   = useState(false);

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

  /* ── send ─────────────────────────────── */
  const send = async () => {
    const recips = split(list);
    if (!isTz(from))                   return snack('Invalid sender');
    if (!recips.length)                return snack('Add recipient(s)');
    if (recips.some((a) => !isTz(a)))  return snack('Bad recipient in list');

    const idN  = Number(tokenId);
    const amtN = Number(amount);
    if (!Number.isInteger(idN)  || idN  < 0) return snack('Bad token‑ID');
    if (!Number.isInteger(amtN) || amtN <= 0) return snack('Bad amount');

    if (!kit?.wallet) return snack('Connect wallet first', 'error');

    try {
      setBusy(true);
      const transfers = recips.map((to_) => ({ to_, token_id:idN, amount:amtN }));
      const c  = await kit.wallet.at(contractAddress);
      const op = await c.methods.transfer([{ from_: from, txs: transfers }]).send();
      snack('Transfer pending…', 'info');
      await op.confirmation();
      snack('Batch sent', 'success');
      setList('');
      onMutate();
    } catch (e) { snack(`Fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  };

  /* ── render ───────────────────────────── */
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Batch&nbsp;Transfer</PixelHeading>
      <HelpBox>
        Send one token‑ID to multiple recipients in a single FA‑2&nbsp;call.
        Enter <strong>sender</strong>, choose <strong>Token‑ID</strong>,
        amount, list recipients (tz/KT1) – then&nbsp;<strong>Send&nbsp;Batch</strong>.
      </HelpBox>

      {/* sender */}
      <FieldWrap>
        <label htmlFor="fromAddr">Sender address *</label>
        <PixelInput
          id="fromAddr"
          placeholder="tz1…"
          value={from}
          onChange={(e) => setFrom(e.target.value.trim())}
        />
      </FieldWrap>

      {/* token picker */}
      <Picker style={{ marginTop:'.6rem' }}>
        <FieldWrap>
          <label htmlFor="tokenId">Token‑ID *</label>
          <PixelInput
            id="tokenId"
            placeholder="e.g. 42"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
          />
        </FieldWrap>

        <FieldWrap>
          <label htmlFor="tokSelect">Owned Tokens</label>
          <Box>
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
        <label htmlFor="amt">Amount each *</label>
        <PixelInput
          id="amt"
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
        />
      </FieldWrap>

      {/* recipients */}
      <FieldWrap style={{ marginTop:'.6rem' }}>
        <label htmlFor="list">Recipients list *</label>
        <PixelInput
          id="list"
          as="textarea"
          rows={3}
          placeholder="Recipients (space, comma or newline separated)"
          value={list}
          onChange={(e) => setList(e.target.value)}
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

      {/* CTA */}
      <PixelButton
        disabled={busy}
        style={{ marginTop:'1rem' }}
        onClick={send}
      >
        {busy ? 'Sending…' : 'Send Batch'}
      </PixelButton>
    </Wrap>
  );
}
/* What changed & why:
   • fetchTokens now merges names from both listLiveTokenIds and a
     flattened TzKT `?select=tokenId,metadata.name` query. Parsing
     covers all API variants (metadata.name, metadata.name‑flattened,
     name field). Result always returns {id,name}. Dropdown therefore
     renders “id — name” like other entry‑points.
   • Increased cap to 100 ids yet keeps URL‑safe length.
   • Rev bump r906. */
/* EOF */
