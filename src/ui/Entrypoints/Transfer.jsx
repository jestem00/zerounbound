/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Transfer.jsx
  Rev :    r694   2025-06-25
  Summary: fix wrong param naming, $level-safe Wrap, lint
──────────────────────────────────────────────────────────────*/
import React, { useState }   from 'react';
import styledPkg             from 'styled-components';
import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import { useWalletContext }  from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* helpers */
const isTz  = (s) => /^(tz1|tz2|tz3)[1-9A-HJ-NP-Za-km-z]{33}$/.test(s.trim());
const split = (r) => r.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;

export default function Transfer({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  $level,
}) {
  const { address: walletAddress, toolkit } = useWalletContext() || {};
  const kit   = tezos || toolkit || window.tezosToolkit;
  const snack = (m, s='warning') => setSnackbar({ open:true, message:m, severity:s });

  const [from, setFrom]   = useState(walletAddress || '');
  const [id,   setId]     = useState('');
  const [amt,  setAmt]    = useState('1');
  const [list, setList]   = useState('');
  const [busy, setBusy]   = useState(false);

  const send = async () => {
    const recips = split(list);
    if (!isTz(from))               return snack('Invalid sender');
    if (recips.length === 0)       return snack('Add recipient(s)');
    if (recips.some((a) => !isTz(a))) return snack('Bad recipient in list');

    const idN  = Number(id);
    const amtN = Number(amt);
    if (!Number.isInteger(idN) || idN < 0)   return snack('Bad token-id');
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
    } catch (e) { snack(`Fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  };

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Batch Transfer</PixelHeading>

      <PixelInput
        placeholder="Sender tz1…"
        value={from}
        onChange={(e) => setFrom(e.target.value.trim())}
      />
      <PixelInput
        placeholder="Token-ID"
        type="number"
        min="0"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <PixelInput
        placeholder="Amount each"
        type="number"
        min="1"
        value={amt}
        onChange={(e) => setAmt(e.target.value)}
      />
      <PixelInput
        as="textarea"
        rows={3}
        placeholder="Recipients list (space/comma/new-line)"
        value={list}
        onChange={(e) => setList(e.target.value)}
      />

      <PixelButton disabled={busy} onClick={send}>
        {busy ? 'Sending…' : 'Send Batch'}
      </PixelButton>
    </Wrap>
  );
}
/* EOF */
