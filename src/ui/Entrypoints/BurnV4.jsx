/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/BurnV4.jsx
  Rev:     r910   2025‑08‑25 UTC
  Summary: Version‑aware burn tool:
           • ZeroTerminal v4a/v4c/v4d → call native burn(nat,nat)
           • ZeroContract v4/v4b/v4e → FA2 transfer → burn address
           Quick‑links reflect each family (Update vs Edit flows).
──────────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BigNumber             from 'bignumber.js';
import styledPkg             from 'styled-components';

import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import PixelConfirmDialog    from '../PixelConfirmDialog.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';
import TokenMetaPanel        from '../TokenMetaPanel.jsx';

import listLiveTokenIds      from '../../utils/listLiveTokenIds.js';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import { jFetch }            from '../../core/net.js';
import { TZKT_API }          from '../../config/deployTarget.js';

/*──────── constants ─────────────────────────────*/
const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';
const API       = `${TZKT_API}/v1`;

/*──────── styled shells ─────────────────────────*/
const Wrap      = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
  display:grid;grid-template-columns:repeat(12,1fr);gap:1.2rem;width:100%;
`;
const FieldWrap = styled.div`display:flex;flex-direction:column;gap:.45rem;flex:1;`;
const FormRow   = styled.div`
  grid-column:1 / -1;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:1rem;
`;
const Box       = styled.div`position:relative;flex:1;`;
const Spin      = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox   = styled.p`
  grid-column:1 / -1;font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const LinkRow   = styled.div`
  grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:.35rem;margin:-.25rem 0 .2rem;
`;

/*════════ component ════════════════════════════════════════*/
export default function BurnV4({
  contractAddress = '',
  contractVersion = '',  // AdminTools passes version (e.g., "v4", "v4a", "v4e"). :contentReference[oaicite:1]{index=1}
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const {
    address: walletAddress,
    toolkit,
    network = 'ghostnet',
  } = useWalletContext() || {};
  const kit = toolkit || (typeof window !== 'undefined' ? window.tezosToolkit : null);
  const snack = (m, s='warning') => setSnackbar({ open:true, message:m, severity:s });

  const v = (contractVersion || '').toLowerCase();
  const isZeroContractV4 = v === 'v4' || v === 'v4b' || v === 'v4e';
  const isZeroTerminal   = v === 'v4a' || v === 'v4c' || v === 'v4d';

  /* deep‑link to AdminTools modals (AdminTools listens for 'zu:openAdminTool'). :contentReference[oaicite:2]{index=2} */
  const openAdminTool = useCallback((key) => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zu:openAdminTool', {
          detail: { key, contract: contractAddress },
        }));
      }
    } catch { /* noop */ }
  }, [contractAddress]);

  /*──────── token list (wallet‑owned only) ──────────*/
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

      /* Fast path – numeric list via ?select=token.tokenId */
      let rows = await jFetch(
        `${base}/tokens/balances`
        + `?account=${walletAddress}`
        + `&token.contract=${contractAddress}`
        + `&balance.gt=0`
        + `&select=token.tokenId&limit=10000`,
      ).catch(() => []);

      /* Fallback path – object rows */
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
          return +(r['token.tokenId'] ?? r.token?.tokenId ?? r.token_id ?? NaN);
        })
        .filter(Number.isFinite);

      const ids = live
        .filter((t) => ownedIds.includes(typeof t === 'object' ? t.id : t))
        .sort((a, b) => (typeof a === 'object' ? a.id : a) - (typeof b === 'object' ? b.id : b));

      setTokOpts(ids.map((id) => (typeof id === 'object' ? id : { id, name: '' })));
    } finally { setLoadingTok(false); }
  }, [contractAddress, walletAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ────────*/
  const [tokenId, setTokenId] = useState('');
  const [amount,  setAmount ] = useState('1');
  const [meta,    setMeta  ] = useState(null);
  const [busy,    setBusy  ] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /*──────── preview (lightweight; names handled by listLiveTokenIds) ─────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;
    const [row] = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    ).catch(() => []);
    setMeta(row?.metadata || {});
  }, [contractAddress]);
  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── ops ─────────────────────────────────────────────────────────*/
  const toNat = (v) => new BigNumber(v).toFixed();

  /** ZeroTerminal flow — call native burn(nat,nat) per registry (v4a/v4c/v4d). :contentReference[oaicite:3]{index=3} */
  const burnViaEntrypoint = async (idN, amtN) => {
    const c  = await kit.wallet.at(contractAddress);
    const ms = c?.methods;
    if (!ms?.burn) throw new Error('No burn entry‑point');
    /* Try both orders just in case of legacy parameter ordering (nat,nat). */
    let op, lastErr;
    for (const args of [[toNat(idN), toNat(amtN)], [toNat(amtN), toNat(idN)]]) {
      try { op = await ms.burn(...args).send(); break; }
      catch (e) { lastErr = e; }
    }
    if (!op) throw lastErr || new Error('Encode failed');
    return op;
  };

  /** ZeroContract v4 family — no native burn; FA2 transfer → burn address. :contentReference[oaicite:4]{index=4} */
  const burnViaTransfer = async (idN, amtN) => {
    const c  = await kit.wallet.at(contractAddress);
    return c.methods.transfer([{
      from_: walletAddress,
      txs  : [{ to_: BURN_ADDR, token_id: Number(idN), amount: Number(amtN) }],
    }]).send();
  };

  const run = async () => {
    if (!kit?.wallet)  return snack('Connect wallet first', 'error');
    if (tokenId === '') return snack('Pick a token', 'warning');

    const idN  = Number(tokenId);
    const amtN = Number(amount);
    if (!Number.isInteger(idN)  || idN  < 0) return snack('Bad token‑ID');
    if (!Number.isInteger(amtN) || amtN <= 0) return snack('Bad amount');

    try {
      setBusy(true);
      const op = isZeroTerminal
        ? await burnViaEntrypoint(idN, amtN)
        : await burnViaTransfer(idN, amtN);
      snack(isZeroTerminal ? 'Burn pending…' : 'Transfer to burn pending…', 'info');
      await op.confirmation();
      snack('Burned ✓', 'success');
      onMutate();
      setTokenId(''); setAmount('1'); setMeta(null);
      void fetchTokens();
    } catch (e) {
      snack(`Fail: ${e?.message || e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  /*──────── quick‑links per family (AdminTools keys) ─────────
    ZeroContract v4 family: edit/append/clear/repair exist under our v4/v4b/v4e. :contentReference[oaicite:5]{index=5}
    ZeroTerminal family: update_* metadata and repair_uri_v4a (UI affordance) exist. :contentReference[oaicite:6]{index=6} */
  const links = useMemo(() => {
    if (isZeroTerminal) {
      const arr = [
        { key: 'update_token_metadata',  label: 'Update Token Meta' },
        { key: 'repair_uri_v4a',         label: 'Repair URI' },
      ];
      if (v === 'v4a' || v === 'v4d') {
        arr.splice(1, 0, { key: 'update_contract_metadata', label: 'Update Contract Meta' });
      }
      return arr;
    }
    // ZeroContract v4/v4b/v4e
    return [
      { key: 'append_artifact_uri',  label: 'Replace Artifact' },
      { key: 'append_extrauri',      label: 'Replace ExtraUri' },
      { key: 'repair_uri',           label: 'Repair URI' },
      { key: 'clear_uri',            label: 'Clear URI' },
      { key: 'edit_token_metadata',  label: 'Edit Token Meta' }, // ✅ restored for v4/v4b/v4e
    ];
  }, [isZeroTerminal, v]);

  const LinksRow = () => (
    <LinkRow>
      {links.map(({ key, label }) => (
        <PixelButton key={key} size="xs" onClick={() => openAdminTool(key)}>
          {label}
        </PixelButton>
      ))}
    </LinkRow>
  );

  /*──────── UI ───────────────────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3} style={{ gridColumn: '1 / -1' }}>Burn Tokens</PixelHeading>

      <HelpBox>
        {isZeroTerminal ? (
          <>
            ZeroTerminal <strong>{contractVersion || 'v4a/v4c/v4d'}</strong> supports a
            native <code>burn(nat,nat)</code> entry‑point. This permanently destroys your
            editions. Use updates/repairs first when possible.
          </>
        ) : (
          <>
            ZeroContract <strong>v4/v4b/v4e</strong> has <em>no native burn entry‑point</em>.
            This tool transfers editions to the Tezos burn address (<code>{BURN_ADDR.slice(0, 12)}…</code>).
            Once sent, they are irretrievable and supply is reduced.
            <br /><strong>Prefer repair:</strong> storage is already paid — fix mistakes first.
          </>
        )}
      </HelpBox>

      {/* Quick alternatives (version‑aware) */}
      <LinksRow />

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

      {/* Amount */}
      <FormRow>
        <FieldWrap>
          <label htmlFor="amt">Amount *</label>
          <PixelInput
            id="amt"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          />
        </FieldWrap>
      </FormRow>

      {/* Preview */}
      <div style={{ gridColumn: '1 / -1', marginTop: '.9rem' }}>
        <TokenMetaPanel
          meta={meta}
          tokenId={tokenId}
          contractAddress={contractAddress}
        />
      </div>

      {/* CTA */}
      <PixelButton
        warning
        disabled={!tokenId || !amount || busy}
        style={{ marginTop:'1rem', gridColumn: '1 / -1' }}
        onClick={() => setConfirmOpen(true)}
      >
        {busy ? 'Burning…' : 'Burn'}
      </PixelButton>

      <PixelConfirmDialog
        open={confirmOpen}
        title="Before you Burn"
        message={(
          <>
            {isZeroTerminal ? (
              <p style={{ marginTop: 0 }}>
                This action calls the contract’s native <code>burn</code> entry‑point and cannot be undone.
              </p>
            ) : (
              <p style={{ marginTop: 0 }}>
                This action transfers editions to <code>{BURN_ADDR}</code>. It cannot be undone.
              </p>
            )}
            <p style={{ margin: '8px 0 6px' }}>
              <strong>Consider a safer alternative first:</strong>
            </p>
            <ul style={{ margin: '0 0 10px 16px' }}>
              {links.map(({ key, label }) => (
                <li key={key}>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setConfirmOpen(false); openAdminTool(key); }}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <p>
              Burn <code>{amount}</code> edition(s) of token <code>{tokenId}</code>?
            </p>
          </>
        )}
        onOk={() => { setConfirmOpen(false); void run(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </Wrap>
  );
}

/* What changed & why:
   • Split logic by version: ZeroTerminal (v4a/v4c/v4d) uses burn(nat,nat);
     ZeroContract (v4/v4b/v4e) uses FA2 transfer → burn address.
   • Restored/ensured "Edit Token Meta" in v4/v4b/v4e (our contracts);
     used "Update Token Meta" for ZeroTerminal (v4a/c/d) to match AdminTools keys.
   • Quick‑links now dispatch AdminTools keys that actually exist per family:
     v4/v4b/v4e → append_artifact_uri, append_extrauri, repair_uri, clear_uri, edit_token_metadata;
     v4a/c/d → update_token_metadata, (update_contract_metadata when available), repair_uri_v4a.
   • Confirmation dialog mirrors the same set of links and burn semantics.
*/
