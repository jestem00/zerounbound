/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateTokenMetadatav4a.jsx
  Rev :    r205   2025‑08‑15
  Summary: token dropdown filtered to wallet‑created tokens
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState,
} from 'react';
import styledPkg          from 'styled-components';
import PixelHeading       from '../PixelHeading.jsx';
import PixelInput         from '../PixelInput.jsx';
import PixelButton        from '../PixelButton.jsx';
import LoadingSpinner     from '../LoadingSpinner.jsx';
import listLiveTokenIds   from '../../utils/listLiveTokenIds.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ─────*/
const Wrap     = styled.section`
  margin-top:1rem;text-align:center;max-width:640px;margin-inline:auto;
`;
const FieldRow = styled.div`
  display:flex;gap:.4rem;justify-content:center;margin:.6rem 0;flex-wrap:wrap;
`;
const Select   = styled.div`flex:1;position:relative;`;
const Spinner  = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/*════════ component ═══════════════════════════════════════*/
export default function UpdateTokenMetadatav4a({ contractAddress }) {
  const {
    network,
    address: walletAddress,
  } = useWalletContext() || {};
  const [tokenId, setTokenId] = useState('');
  const [tokOpts, setTokOpts] = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  /* fetch filtered token list */
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(
      contractAddress,
      network,
      true,
      walletAddress || '',
    ));
    setLoadingTok(false);
  }, [contractAddress, network, walletAddress]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  const base = network === 'mainnet'
    ? 'https://zeroterminal.art'
    : 'https://testnet.zeroterminal.art';
  const url = `${base}/?cmd=tokendata&cid=${contractAddress}`
            + (tokenId ? `&tid=${tokenId}` : '');

  return (
    <Wrap>
      <PixelHeading level={3}>Update Token Metadata on ZeroTerminal</PixelHeading>
      <p>
        Progressive contracts delegate full‑map token‑metadata updates to
        <strong> ZeroTerminal</strong>. Select your token (only ones you
        created are listed), or enter Token‑ID, then follow the link.
      </p>

      {/* selector row */}
      <FieldRow>
        <Select>
          <select
            style={{ width:'100%',height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => (
              <option key={id} value={id}>
                {name ? `${id} — ${name}` : id}
              </option>
            ))}
          </select>
          {loadingTok && <Spinner />}
        </Select>

        <PixelInput
          placeholder="Token‑ID"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
          style={{ flex:'0 0 120px' }}
        />
        <PixelButton
          as="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          disabled={!contractAddress}
        >
          OPEN ZEROTERMINAL
        </PixelButton>
      </FieldRow>
    </Wrap>
  );
}
/* EOF */
