/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Transfer.jsx
  Rev :    r910   2025‑10‑04
  Summary: preview‑button next to Token‑ID; hidden scrollbar
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState,
}                             from 'react';
import styledPkg              from 'styled-components';

import PixelHeading           from '../PixelHeading.jsx';
import PixelInput             from '../PixelInput.jsx';
import PixelButton            from '../PixelButton.jsx';
import LoadingSpinner         from '../LoadingSpinner.jsx';
import TokenPreviewWindow     from './TokenPreviewWindow.jsx';

import listLiveTokenIds       from '../../utils/listLiveTokenIds.js';
import { useWalletContext }   from '../../contexts/WalletContext.js';
import { jFetch }             from '../../core/net.js';

const styled      = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const isTzAddress = (s='') => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(s.trim());
const splitList   = (r='') => r.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

/*──────── styled shells ───────*/
const Wrap   = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Help   = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;
const Row    = styled.div`display:flex;gap:.6rem;align-items:flex-end;margin-bottom:.8rem;`;
const Field  = styled.div`display:flex;flex-direction:column;gap:.45rem;`;
const Picker = styled.div`position:relative;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:7px;right:8px;
`;

/*──────── component ──────────*/
export default function Transfer({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  /*──── context ────*/
  const {
    address : walletAddress,
    toolkit,
    network = 'ghostnet',
  } = useWalletContext() || {};
  const kit   = toolkit || window.tezosToolkit;
  const toast = (m, s='warning') => setSnackbar({ open:true, message:m, severity:s });

  /*──── token‑list dropdown ────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    try {
      const live = await listLiveTokenIds(contractAddress, network, true);
      const ids  = live.map((t) => (typeof t === 'object' ? t.id : t)).slice(0, 100);
      const fromLive = new Map(live.map((t) => [t.id, t.name || '']));
      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';
      const rows = await jFetch(
        `${base}/tokens?contract=${contractAddress}`
        + `&tokenId.in=${ids.join(',')}`
        + '&select=tokenId,metadata.name'
        + `&limit=${ids.length}`,
      ).catch(() => []);
      const fromApi = new Map(rows.map((r) => [
        Number(r.tokenId),
        (r['metadata.name'] ?? r?.metadata?.name ?? r.name ?? '').trim()]));
      setTokOpts(ids.map((id) => ({ id, name: fromApi.get(id) || fromLive.get(id) || '' })));
    } finally { setLoadingTok(false); }
  }, [contractAddress, network]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──── local state ────*/
  const [sender,       setSender]       = useState(walletAddress || '');
  const [rows,         setRows]         = useState([{ id:'', amount:'1', recips:'' }]);
  const [sameRecips,   setSameRecips]   = useState(true);
  const [globalRecips, setGlobalRecips] = useState('');
  const [busy,         setBusy]         = useState(false);
  const [previews,     setPreviews]     = useState([]);        // open preview tokenIds

  /*──── helpers ────*/
  const addRow    = () => setRows((r) => [...r, { id:'', amount:'1', recips:'' }]);
  const delRow    = (i) => setRows((r) => r.length === 1 ? r : r.filter((_,idx)=>idx!==i));
  const openPrev  = (id) => setPreviews((p) => (p.includes(id) ? p : [...p, id]));
  const closePrev = (id) => setPreviews((p) => p.filter((x) => x !== id));

  /*──── validation + send ────*/
  const send = async () => {
    if (!isTzAddress(sender)) return toast('Invalid sender');

    const recipientsByRow = sameRecips
      ? rows.map(() => globalRecips)
      : rows.map((r) => r.recips);

    if (recipientsByRow.some((r) => !splitList(r).length)) return toast('Add recipient(s)');
    if (recipientsByRow.some((r) => splitList(r).some((a) => !isTzAddress(a))))
      return toast('Bad recipient address');

    for (const { id, amount } of rows) {
      const nId = Number(id);
      const nAm = Number(amount);
      if (!Number.isInteger(nId) || nId < 0)  return toast(`Bad Token‑ID “${id}”`);
      if (!Number.isInteger(nAm) || nAm <= 0) return toast(`Bad amount “${amount}”`);
    }

    if (!kit?.wallet) return toast('Connect wallet first', 'error');

    try {
      setBusy(true);
      const txs = [];
      rows.forEach(({ id, amount }, idx) => {
        splitList(recipientsByRow[idx])
          .forEach((to_) => txs.push({ to_, token_id:Number(id), amount:Number(amount) }));
      });
      const c  = await kit.wallet.at(contractAddress);
      const op = await c.methods.transfer([{ from_: sender, txs }]).send();
      toast('Transfer pending …', 'info');
      await op.confirmation();
      toast('Batch sent ✔', 'success');
      setRows([{ id:'', amount:'1', recips:'' }]);
      setGlobalRecips('');
      onMutate();
    } catch (e) { toast(e?.message || 'Transaction failed', 'error'); }
    finally    { setBusy(false); }
  };

  /*──── UI ────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Batch Transfer</PixelHeading>
      <Help>
        Add one row per Token‑ID/edition, choose amount, set recipients, then&nbsp;
        <strong>Send Batch</strong>. Click&nbsp;<b>🔍</b>&nbsp;to preview metadata. All
        rows share recipients by default.
      </Help>

      {/* Sender */}
      <Field style={{ maxWidth:'100%' }}>
        <label htmlFor="fromAddr">Sender address *</label>
        <PixelInput
          id="fromAddr"
          placeholder="tz1…"
          value={sender}
          onChange={(e) => setSender(e.target.value.trim())}
        />
      </Field>

      {/* Dynamic rows */}
      <div style={{ marginTop:'.9rem' }}>
        {rows.map((row, idx) => (
          <Row key={`row-${idx}`}>
            {/* Token‑ID & preview */}
            <Field style={{ maxWidth:120 }}>
              <label>Token‑ID *</label>
              <div style={{ display:'flex', gap:'.4rem' }}>
                <PixelInput
                  placeholder="42"
                  value={row.id}
                  onChange={(e)=>{
                    const v=e.target.value.replace(/\D/g,'');
                    setRows((r)=>r.map((o,i)=>i===idx?{...o,id:v}:o));
                  }}
                  style={{ flex:1 }}
                />
                <PixelButton
                  title="Preview metadata"
                  disabled={!row.id}
                  onClick={()=>openPrev(Number(row.id))}
                  style={{ width:32 }}
                >🔍</PixelButton>
              </div>
            </Field>

            {/* Owned tokens dropdown */}
            <Field style={{ maxWidth:180 }}>
              <label>Owned Tokens</label>
              <Picker>
                <select
                  style={{ width:'100%',height:32 }}
                  disabled={loadingTok}
                  onChange={(e)=>{
                    const v=e.target.value;
                    setRows((r)=>r.map((o,i)=>i===idx?{...o,id:v}:o));
                  }}
                  value={row.id}
                >
                  <option value="">
                    {loadingTok ? 'Loading…' : tokOpts.length ? 'Select' : '— none —'}
                  </option>
                  {tokOpts.map(({ id, name })=>(
                    <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>
                  ))}
                </select>
                {loadingTok && <Spin />}
              </Picker>
            </Field>

            {/* Amount */}
            <Field style={{ maxWidth:100 }}>
              <label>Amount *</label>
              <PixelInput
                type="number"
                min="1"
                value={row.amount}
                onChange={(e)=>{
                  const v=e.target.value.replace(/\D/g,'');
                  setRows((r)=>r.map((o,i)=>i===idx?{...o,amount:v}:o));
                }}
              />
            </Field>

            {/* Per‑row recipients when not global */}
            {!sameRecips && (
              <Field style={{ flex:1 }}>
                <label>Recipients *</label>
                <PixelInput
                  as="textarea"
                  rows={1}
                  placeholder="tz1… tz1…"
                  value={row.recips}
                  onChange={(e)=>{
                    setRows((r)=>r.map((o,i)=>i===idx?{...o,recips:e.target.value}:o));
                  }}
                  /* hide scrollbar until needed */
                  style={{ overflowY:'hidden' }}
                  onFocus={(e)=>{ e.target.style.overflowY='auto'; }}
                  onBlur ={(e)=>{ e.target.style.overflowY='hidden'; }}
                />
              </Field>
            )}

            {/* Remove row */}
            <PixelButton
              title="Remove row"
              disabled={rows.length===1}
              onClick={()=>delRow(idx)}
              style={{ height:32 }}
            >✖</PixelButton>
          </Row>
        ))}

        {/* add row */}
        <PixelButton onClick={addRow}>＋ Add Row</PixelButton>
      </div>

      {/* Global recipients */}
      <div style={{ marginTop:'.9rem' }}>
        <label style={{ display:'flex',alignItems:'center',gap:'.45rem' }}>
          <input
            type="checkbox"
            checked={sameRecips}
            onChange={(e) => setSameRecips(e.target.checked)}
          />
          Same recipients for all tokens
        </label>
        {sameRecips && (
          <PixelInput
            as="textarea"
            rows={2}
            placeholder="tz1… tz1… tz1…"
            value={globalRecips}
            onChange={(e)=>setGlobalRecips(e.target.value)}
            style={{ marginTop:'.5rem', overflowY:'hidden' }}
            onFocus={(e)=>{ e.target.style.overflowY='auto'; }}
            onBlur ={(e)=>{ e.target.style.overflowY='hidden'; }}
          />
        )}
      </div>

      {/* CTA */}
      <PixelButton
        disabled={busy}
        style={{ marginTop:'1.2rem' }}
        onClick={send}
      >
        {busy ? 'Sending…' : 'Send Batch'}
      </PixelButton>

      {/* Preview windows */}
      {previews.map((id)=>(
        <TokenPreviewWindow
          key={`prev-${id}`}
          tokenId={id}
          contractAddress={contractAddress}
          onClose={()=>closePrev(id)}
        />
      ))}
    </Wrap>
  );
}
/* EOF */
