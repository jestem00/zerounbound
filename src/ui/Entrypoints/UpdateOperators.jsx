/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateOperators.jsx
  Rev :    r903   2025‑08‑01
  Summary: token dropdown now shows `<id> — <name>` (I101)
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback,
  useEffect,
  useState,
}                         from 'react';
import { Buffer }         from 'buffer';
import BigNumber          from 'bignumber.js';
import styledPkg          from 'styled-components';

import PixelHeading       from '../PixelHeading.jsx';
import PixelInput         from '../PixelInput.jsx';
import PixelButton        from '../PixelButton.jsx';
import TokenMetaPanel     from '../TokenMetaPanel.jsx';
import LoadingSpinner     from '../LoadingSpinner.jsx';
import PixelConfirmDialog from '../PixelConfirmDialog.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';

import listLiveTokenIds   from '../../utils/listLiveTokenIds.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';

/*──────────────── helpers ─────────────────*/
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
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

const isTz = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
const API  = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function UpdateOperators({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  /*── ctx ─────────────────────────────────*/
  const {
    toolkit,
    address: walletAddress,
    network = 'ghostnet',
  } = useWalletContext() || {};
  const snack = (m, s='info') => setSnackbar({ open:true, message:m, severity:s });

  /*── token list (I101 compliant) ─────────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    try {
      const live = await listLiveTokenIds(contractAddress, network, true);
      if (!live.length) { setTokOpts([]); return; }

      const ids = live
        .map((t) => (typeof t === 'object' ? t.id : t))
        .slice(0, 50);                       /* cap 50 ⇒ URL safe */

      const base = network === 'mainnet'
        ? 'https://api.tzkt.io/v1'
        : 'https://api.ghostnet.tzkt.io/v1';

      /* Pull full rows (no select) ⇒ metadata.name reliably present */
      const rows = await jFetch(
        `${base}/tokens`
        + `?contract=${contractAddress}`
        + `&tokenId.in=${ids.join(',')}`
        + `&limit=${ids.length}`,
      ).catch(() => []);

      const map = new Map(
        rows.map((r) => [Number(r.tokenId), r.metadata?.name ?? '']),
      );

      setTokOpts(ids.map((id) => ({ id, name: map.get(id) || '' })));
    } finally { setLoadingTok(false); }
  }, [contractAddress, network]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*── local state ─────────────────────────*/
  const [tokenId, setTokenId] = useState('');
  const [addr,    setAddr]    = useState('');
  const [adding,  setAdding]  = useState(true);
  const [busy,    setBusy]    = useState(false);

  const [meta,    setMeta]    = useState(null);
  const [ov,      setOv]      = useState({ open:false });
  const [confirm, setConfirm] = useState(false);

  /*── metadata preview ────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;
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
  }, [contractAddress]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*── core op ─────────────────────────────*/
  const toNat = (v) => new BigNumber(v).toFixed();

  const run = async () => {
    if (!isTz(addr))   return snack('Enter a valid operator address');
    if (!tokenId)      return snack('Token‑ID?', 'warning');
    if (!toolkit)      return snack('Connect wallet', 'error');
    try {
      setBusy(true);
      setOv({ open:true, status:'Waiting for signature…' });

      const c   = await toolkit.wallet.at(contractAddress);
      const row = adding
        ? { add_operator:    { owner: walletAddress, operator: addr, token_id: toNat(tokenId) } }
        : { remove_operator: { owner: walletAddress, operator: addr, token_id: toNat(tokenId) } };

      const op  = await c.methods.update_operators([row]).send();

      setOv({ open:true, status:'Broadcasting…' });
      await op.confirmation();

      snack(`${adding ? 'Added' : 'Removed'} ✓`, 'success');
      setAddr(''); setTokenId('');
      onMutate();
    } catch (e) {
      snack(e.message || String(e), 'error');
    } finally {
      setBusy(false);
      setOv({ open:false });
    }
  };

  /*── UI ───────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Update&nbsp;Operators</PixelHeading>
      <HelpBox>
        Grant or revoke <em>operator</em> rights on a specific token. Pick
        <strong>&nbsp;Token‑ID</strong> (dropdown or manual) → paste
        operator address → choose <strong>Add</strong> or <strong>Remove</strong>. One
        signature packs a single FA‑2&nbsp;<code>update_operators</code> row.
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

      {/* operator address */}
      <FieldWrap style={{ marginTop:'.6rem' }}>
        <label htmlFor="opAddr">Operator address *</label>
        <PixelInput
          id="opAddr"
          placeholder="tz1… or KT1…"
          value={addr}
          onChange={(e) => setAddr(e.target.value.trim())}
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
      <div style={{ display:'flex', gap:'.75rem', marginTop:'1rem' }}>
        <PixelButton
          style={{ flex:1 }}
          disabled={busy}
          onClick={() => { setAdding(true); setConfirm(true); }}
        >
          {busy && adding ? 'Processing…' : 'Add'}
        </PixelButton>
        <PixelButton
          warning
          style={{ flex:1 }}
          disabled={busy}
          onClick={() => { setAdding(false); setConfirm(true); }}
        >
          {busy && !adding ? 'Processing…' : 'Remove'}
        </PixelButton>
      </div>

      {/* confirm dialog */}
      <PixelConfirmDialog
        open={confirm}
        message={(
          <>
            {adding ? 'Grant' : 'Revoke'} operator&nbsp;
            <code>{addr}</code> for&nbsp;token&nbsp;
            <code>{tokenId}</code>?
          </>
        )}
        onOk={() => { setConfirm(false); run(); }}
        onCancel={() => setConfirm(false)}
      />

      {/* overlay */}
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
   • Token dropdown now queries full /tokens rows (no select) to
     guarantee availability of metadata.name, fulfilling I101.
   • Option label shows “<id> — <name>” pattern identical to Burn,
     Destroy & ClearUri components.
   • Added invariant I101 to Manifest; bump Rev r903. */
/* EOF */
