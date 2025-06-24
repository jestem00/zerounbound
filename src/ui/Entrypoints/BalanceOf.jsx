/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/BalanceOf.jsx
  Rev :    r901   2025‑07‑30
  Summary: HelpBox wording – clarifies wallet requirement
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg             from 'styled-components';
import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import listLiveTokenIds      from '../../utils/listLiveTokenIds.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ───────────────────────────────────────────*/
const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Row  = styled.div`display:flex;gap:.5rem;align-items:center;`;
const Box  = styled.div`position:relative;flex:1;`;
const Chips = styled.div`
  display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.35rem;
  > span{
    font-size:.7rem;padding:.1rem .35rem;border:1px solid var(--zu-fg);
    background:var(--zu-bg-alt);white-space:nowrap;
  }
`;
const Res = styled.div`
  font-size:.8rem;margin-top:.8rem;white-space:pre-wrap;word-break:break-all;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const Spin = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/*──────── helpers ──────────────────────────────────────────*/
const uniqNatList = (src = '') => {
  const set = new Set(
    src.split(',')
       .map((t) => t.trim())
       .filter((t) => /^\d+$/.test(t)),
  );
  return [...set];
};

/*════════ component ═══════════════════════════════════════*/
export default function BalanceOf({
  contractAddress = '',
  tezos,
  setSnackbar = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit  = tezos || ctxToolkit || window?.tezosToolkit;

  /*──────── token list (live helper) ───────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  useEffect(() => {
    (async () => {
      if (!contractAddress) return;
      setLoadingTok(true);
      setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
      setLoadingTok(false);
    })();
  }, [contractAddress]);

  /*──────── local state ───────*/
  const [addr,       setAddr]   = useState('');
  const [tokenField, setField]  = useState('');      // raw comma‑string
  const tokens = useMemo(() => uniqNatList(tokenField), [tokenField]);

  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);

  const snack = (m, s='info') => setSnackbar({ open:true, message:m, severity:s });

  /*──────── events ───────*/
  const addToken = (id) =>
    setField((f) => {
      const list = uniqNatList(f);
      list.push(id);
      return list.join(', ');
    });

  /*──────── run query ───────*/
  const run = useCallback(async () => {
    if (!addr)   return snack('Enter wallet/contract address', 'warning');
    if (!tokens.length) return snack('Add at least one token‑ID', 'warning');
    try {
      setBusy(true);
      const c   = await kit.contract.at(contractAddress);
      const req = tokens.map((id) => ({ owner: addr, token_id: +id }));
      const res = await c.views.balance_of(req).read();   // [{balance}]
      const lines = res.map((r, i) => `Token ${tokens[i]} → ${r.balance}`).join('\n');
      setResult(lines || '—');
    } catch (e) {
      setResult(null);
      snack(`Fail: ${e.message}`, 'error');
    } finally { setBusy(false); }
  }, [addr, tokens, kit, contractAddress]);                // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Check&nbsp;Balances</PixelHeading>
      <HelpBox>
        Read‑only utility — returns FA2 balances for <strong>one</strong> wallet
        or contract address across <strong>multiple token‑IDs</strong>.
        <br/>
        1)&nbsp;Connect your wallet&nbsp;→ 2)&nbsp;Enter target tz*/KT1* address&nbsp;→
        3)&nbsp;Select IDs from dropdown <em>or</em> type comma‑list&nbsp;→
        4)&nbsp;Click&nbsp;<b>Check</b>.
      </HelpBox>

      {/* address */}
      <PixelInput
        placeholder="tz… / KT1… (wallet or contract)"
        value={addr}
        onChange={(e) => setAddr(e.target.value.trim())}
      />

      {/* token selector */}
      <Row style={{ marginTop: '.6rem' }}>
        <PixelInput
          as="textarea"
          rows={3}
          placeholder="Token‑ID(s) comma‑sep"
          style={{ flex:1 }}
          value={tokenField}
          onChange={(e) => setField(e.target.value)}
        />

        <Box>
          <select
            style={{ width:'100%', height:32 }}
            disabled={loadingTok}
            defaultValue=""
            onChange={(e) => { if (e.target.value) { addToken(e.target.value); e.target.value=''; } }}
          >
            <option value="">
              {loadingTok
                ? 'Loading…'
                : tokOpts.length ? 'Add token…' : '— none —'}
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
      </Row>

      {/* chips preview */}
      {tokens.length > 0 && (
        <Chips>{tokens.map((id) => <span key={id}>{id}</span>)}</Chips>
      )}

      {/* CTA */}
      <PixelButton
        style={{ marginTop: '.8rem' }}
        onClick={run}
        disabled={busy}
      >
        {busy ? 'Querying…' : 'CHECK'}
      </PixelButton>

      {/* result */}
      {result != null && (
        <Res>{result}</Res>
      )}
    </Wrap>
  );
}
/* What changed & why (r901):
   • HelpBox text now states wallet connection is required and
     removes the previous incorrect “No wallet connection required”.
   • No functional logic altered – dropdown multi‑select and query
     behaviour remain intact. */
/* EOF */
