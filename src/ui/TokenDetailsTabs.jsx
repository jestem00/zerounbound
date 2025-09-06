/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenDetailsTabs.jsx
  Rev :    r1
  Summary: Enrich token details page with intuitive tabs:
           History, Listings, Offers, Owners, Attributes. Uses
           existing marketplace helpers and TzKT endpoints and
           plugs into existing dialogs (Buy/Accept). Includes a
           lightweight “Thank” action that resolves a collector’s
           X/Twitter handle via our /api/handle route and opens a
           prefilled tweet. Desktop uses tabs; mobile renders as a
           stacked accordion for clarity.
*/

import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelButton from './PixelButton.jsx';
import AcceptOffer from './Entrypoints/AcceptOffer.jsx';
import CancelListing from './Entrypoints/CancelListing.jsx';
import { shortAddr } from '../utils/formatAddress.js';
import { formatMutez } from '../utils/formatTez.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch } from '../core/net.js';
import { tzktBase as tzktV1 } from '../utils/tzkt.js';
import { NETWORK_KEY, URL_OBJKT_TOKENS_BASE, SITE_URL, URL_TZKT_OP_BASE } from '../config/deployTarget.js';
import { fetchListings, fetchOffers } from '../core/marketplace.js';
import { buildHistory } from '../utils/historyEvents.js';
import ProfileLink from './ProfileLink.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ───────*/
const Wrap = styled.section`
  width: 100%;
  margin: 1rem auto 2rem;
  max-width: 1920px;
  padding: 0 clamp(1rem, 4vw, 2rem);
`;

const Tabs = styled.div`
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
`;

const TabBtn = styled(PixelButton).attrs({ size: 'xs', noActiveFx: true })`
  ${({ $active }) => $active && `filter: none; box-shadow: 0 0 0 2px var(--zu-bg), 0 0 0 4px var(--zu-accent-sec);`}
`;

const Panel = styled.div`
  border: 2px solid var(--zu-accent);
  background: var(--zu-bg-alt);
  padding: 10px;
`;
const Table = styled.div`
  display: grid;
  grid-template-columns:
    minmax(96px, 140px)      /* Event */
    minmax(140px, 1.2fr)     /* From */
    minmax(140px, 1.2fr)     /* To */
    minmax(56px, 72px)       /* Amount */
    minmax(110px, 0.9fr)     /* Price */
    minmax(160px, 1fr)       /* Time */
    minmax(40px, 60px);      /* Link */
  column-gap: 8px;
  row-gap: 6px;
  align-items: center;
  font-size: clamp(11px, 1.05vw, 13px);

  @media (max-width: 720px) {
    grid-template-columns:
      minmax(80px, 110px)
      minmax(120px, 1fr)
      minmax(120px, 1fr)
      minmax(50px, 64px)
      minmax(90px, 1fr)
      minmax(136px, 1fr)
      minmax(36px, 48px);
  }
`;
const TH = styled.div` font-weight: 700; opacity: .9; `;
const TDClip = styled.div` overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; `;
const TDWrap = styled.div` white-space: normal; overflow-wrap: anywhere; word-break: break-word; min-width: 0; `;
const Badge = styled.span`
  display:inline-block; padding:2px 6px; border:1px solid var(--zu-fg); border-radius:4px; font-size:.7rem;
  background: ${({$kind}) => {
    switch ($kind) {
      case 'Sale': return '#1c3';
      case 'Burn': return '#712';
      case 'List':
      case 'Offer':
      case 'Accept': return '#223';
      case 'Unlist': return '#333';
      default: return '#222';
    }
  }};
`;
const SourceTag = styled.small`
  opacity: 0.8; font-size: 0.85em; letter-spacing: .02em; text-transform: none;
`;
const EventCell = styled.div`
  min-width: 0; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255,255,255,.12);
  &:last-child { border-bottom: 0; }
`;

const Small = styled.small` opacity: .8; `;
const Mono  = styled.code` font-family: 'Pixeloid Sans', monospace; `;

const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,.12);
  position: sticky;
  bottom: 0;
  background: var(--zu-bg-alt);
`;

// Responsive wrappers and mobile list styles
const DesktopOnly = styled.div`
  display: block;
  @media (max-width: 720px) { display: none; }
`;
const MobileOnly = styled.div`
  display: none;
  @media (max-width: 720px) { display: block; }
`;
const MobileList = styled.div`
  display: flex; flex-direction: column; gap: 12px;
`;
const MobileRow = styled.div`
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  padding: 8px 2px 10px;
  border-bottom: 1px dashed rgba(255,255,255,.12);
`;
const Thumb = styled.div`
  width: 56px; height: 56px; border-radius: 6px; overflow: hidden;
  background: #111; background-size: cover; background-position: center;
  border: 1px solid rgba(255,255,255,.1);
`;
const MobTop = styled.div`
  display: flex; align-items: center; gap: 8px; justify-content: space-between; min-width: 0;
`;
const MobTopLeft = styled.div`
  display: inline-flex; align-items: center; gap: 8px; min-width: 0;
`;
const MobPrice = styled.span`
  font-family: 'Pixeloid Sans', monospace; opacity: .95; white-space: nowrap; font-size: 12px;
`;
const MobTime = styled.small`
  opacity: .75; white-space: nowrap;
`;
const Names = styled.div`
  display: grid; grid-auto-rows: min-content; gap: 4px; font-size: 12px;
`;
const Arrow = styled.span` opacity: .8; margin: 0 6px; `;

/*──────── utils ───────*/
function useTzktBase(net) { return useMemo(() => tzktV1(net), [net]); }

async function fetchOwners(base, contract, tokenId) {
  try {
    const qs = new URLSearchParams({
      'token.contract': contract,
      'token.tokenId' : String(tokenId),
      'balance.gt'    : '0',
      select          : 'account.address,balance',
      limit           : '10000',
    });
    const rows = await jFetch(`${base}/tokens/balances?${qs}`, 2).catch(() => []);
    return (rows || []).map((r) => ({ address: r['account.address'] || r?.account?.address || r?.account, balance: Number(r?.balance || 0) }))
      .filter((r) => r.address && r.balance > 0);
  } catch { return []; }
}

async function resolveHandle(address) {
  try {
    const j = await jFetch(`/api/handle/${address}`, 1);
    return { alias: j?.alias || shortAddr(address), handle: j?.handle || '' };
  } catch { return { alias: shortAddr(address) }; }
}

function ThankButton({ address, tokenUrl, tokenName }) {
  const [alias, setAlias] = useState(shortAddr(address));
  useEffect(() => { resolveHandle(address).then((r) => setAlias(r.alias || shortAddr(address))); }, [address]);
  const onClick = async () => {
    const r = await resolveHandle(address);
    const who = r.handle ? `@${r.handle}` : r.alias;
    const text = `Thank you ${who} for collecting "${tokenName}" on @ZeroUnboundArt ${tokenUrl}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    try { window.open(url, '_blank', 'noopener'); } catch { window.location.href = url; }
  };
  return (
    <PixelButton size="xs" noActiveFx onClick={onClick} title="Thank this collector on X/Twitter">THANK</PixelButton>
  );
}
ThankButton.propTypes = {
  address: PropTypes.string.isRequired,
  tokenUrl: PropTypes.string.isRequired,
  tokenName: PropTypes.string.isRequired,
};

/*──────── component ───────*/
export default function TokenDetailsTabs({ addr, tokenId, tokenName, meta, rarity: _rarity, isCreator = false }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const base = useTzktBase(NETWORK_KEY);
  const tokenUrl = `${URL_OBJKT_TOKENS_BASE}${addr}/${tokenId}`; // external link for familiarity
  const tokenSelfUrl = `${SITE_URL}/tokens/${addr}/${tokenId}`;  // internal canonical link

  const [tab, setTab] = useState('history');
  const [owners, setOwners] = useState([]);
  const [history, setHistory] = useState([]);
  const [listings, setListings] = useState([]);
  const [offers, setOffersState] = useState([]);
  const [dlg, setDlg] = useState(null); // { kind: 'buy'|'accept', data: {...} }

  // Pagination (history)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  useEffect(() => {
    const calc = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
      setPageSize(w < 600 ? 12 : (w < 1024 ? 20 : 30));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  useEffect(() => { setPage(1); }, [addr, tokenId, history.length]);

  // Fetch static-ish data
  useEffect(() => {
    let stop = false;
    (async () => {
      const ownP = fetchOwners(base, addr, tokenId);
      const histP = isCreator ? buildHistory({ contract: addr, tokenId, includeObjkt: true }) : Promise.resolve([]);
      const [own, hist] = await Promise.all([ownP, histP]);
      if (!stop) { setOwners(own); setHistory(hist); }
    })();
    return () => { stop = true; };
  }, [base, addr, tokenId, isCreator]);

  // Marketplace data (polling a bit)
  useEffect(() => {
    let stop = false; let t;
    async function run() {
      try {
        let ls = [];
        let of = [];
        try { ls = await fetchListings({ toolkit, nftContract: addr, tokenId }); } catch { ls = []; }
        try { of = await fetchOffers({ toolkit, nftContract: addr, tokenId }); } catch { of = []; }

        // Fallback: if listings empty, use collection-wide bigmap scanner and filter to our token
        if ((!ls || ls.length === 0)) {
          try {
            const mod = await import('../utils/marketplaceListings.js');
            const network = NETWORK_KEY;
            const arr = await mod.listListingsForCollectionViaBigmap(addr, network).catch(() => []);
            if (Array.isArray(arr) && arr.length) {
              ls = arr.filter((x) => Number(x?.tokenId) === Number(tokenId));
            }
          } catch { /* ignore */ }
        }
        if (!stop) { setListings(Array.isArray(ls) ? ls : []); setOffersState(Array.isArray(of) ? of : []); }
      } catch { /* ignore */ }
    }
    run();
    t = setInterval(run, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [toolkit, addr, tokenId]);

  const isSeller = (who) => String(who || '').toLowerCase() === String(walletAddr || '').toLowerCase();

  if (!isCreator) return null;
  const tabsList = ['history','listings','offers','owners'];

  // Slice history for current page
  const totalPages = Math.max(1, Math.ceil((history?.length || 0) / pageSize));
  const curPage = Math.min(Math.max(1, page), totalPages);
  const start = (curPage - 1) * pageSize;
  const pageRows = (history || []).slice(start, start + pageSize);
  
  // helpers for mobile preview + relative time
  const ipfsToHttp = (u = '') => (typeof u === 'string' && u.startsWith('ipfs://') ? u.replace(/^ipfs:\/\//i, 'https://ipfs.io/ipfs/') : u);
  const previewUrl = useMemo(() => {
    const m = meta || {};
    const u = m.thumbnailUri || m.displayUri || m.image || m.artifactUri || '';
    return u ? ipfsToHttp(u) : '';
  }, [meta]);
  const timeAgo = (ts) => {
    const d = new Date(ts).getTime();
    const s = Math.max(0, (Date.now() - d) / 1000);
    if (s < 60) return `${Math.floor(s)}s ago`;
    const m = s/60; if (m < 60) return `${Math.floor(m)}m ago`;
    const h = m/60; if (h < 24) return `${Math.floor(h)}h ago`;
    const days = Math.floor(h/24); if (days < 7) return `${days}d ago`;
    const w = Math.floor(days/7); if (w < 4) return `${w} wks ago`;
    const mo = Math.floor(days/30); if (mo < 12) return `${mo} mths ago`;
    const y = Math.floor(days/365); return `${y}y ago`;
  };

  return (
    <Wrap>
      <Tabs role="tablist" aria-label="Token details">
        {tabsList.map((k) => (
          <TabBtn key={k} $active={tab===k} aria-selected={tab===k} role="tab" onClick={() => setTab(k)}>
            {k[0].toUpperCase()+k.slice(1)}
          </TabBtn>
        ))}
        <a href={tokenUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
          <TabBtn as="span" title="View on OBJKT">OBJKT ↗</TabBtn>
        </a>
      </Tabs>

      {/* Panels */}
      {tab === 'history' && (
        <Panel role="tabpanel">
          {history.length === 0 ? (
            <Small>No events found.</Small>
          ) : (
            <>
              <DesktopOnly>
                <Table role="table" aria-label="Token history">
                  <TH>Event</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH>Amount</TH>
                  <TH>Price</TH>
                  <TH>Time</TH>
                  <TH></TH>
                  {pageRows.map((e, i) => (
                    <React.Fragment key={`${e.hash || 'row'}_${i}`}>
                      <EventCell title={`${e.kind} • ${e.source}`}>
                        <Badge $kind={e.kind}>{e.kind}</Badge>
                        <SourceTag>{e.source}</SourceTag>
                      </EventCell>
                      <TDWrap title={e.from || ''}>{e.from ? <ProfileLink address={e.from} /> : <Small>—</Small>}</TDWrap>
                      <TDWrap title={e.to || ''}>{
                        (e.kind === 'Burn') ? '🔥 Burned' : (
                          e.to ? (String(e.to).startsWith('tz1burnburn') ? '🔥 Burned' : <ProfileLink address={e.to} />) : <Small>—</Small>
                        )
                      }</TDWrap>
                      <TDClip><Mono>{e.amount || 1}</Mono></TDClip>
                      <TDClip>{e.priceMutez != null ? <Mono>{formatMutez(e.priceMutez)} ꜩ</Mono> : <Small>—</Small>}</TDClip>
                      <TDWrap title={new Date(e.time).toLocaleString()}><Small>{new Date(e.time).toLocaleString()}</Small></TDWrap>
                      <TDClip>
                        {e.tzktUrl || e.hash ? (
                          <a href={e.tzktUrl || `${URL_TZKT_OP_BASE}${e.hash}`} target="_blank" rel="noopener noreferrer" title="View on TzKT">↗</a>
                        ) : null}
                      </TDClip>
                    </React.Fragment>
                  ))}
                </Table>
              </DesktopOnly>
              <MobileOnly>
                <MobileList aria-label="Token history list (mobile)">
                  {pageRows.map((e, i) => (
                    <MobileRow key={`${e.hash || 'rowm'}_${i}`}>
                      <Thumb style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : 'none' }} />
                      <div>
                        <MobTop>
                          <MobTopLeft>
                            <Badge $kind={e.kind}>{e.kind}</Badge>
                            <SourceTag>{e.source}</SourceTag>
                            <MobPrice>{e.priceMutez != null ? `${formatMutez(e.priceMutez)} ꜩ` : ''}</MobPrice>
                          </MobTopLeft>
                          <div>
                            <MobTime title={new Date(e.time).toLocaleString()}>{timeAgo(e.time)}</MobTime>
                            {(e.tzktUrl || e.hash) && (
                              <a style={{ marginLeft: 8 }} href={e.tzktUrl || `${URL_TZKT_OP_BASE}${e.hash}`} target="_blank" rel="noopener noreferrer" title="View on TzKT">↗</a>
                            )}
                          </div>
                        </MobTop>
                        <Names>
                          <div>
                            {e.from ? <ProfileLink address={e.from} /> : <Small>—</Small>}
                          </div>
                          <div>
                            <Arrow>↳</Arrow>
                            {(e.kind === 'Burn') ? '🔥 Burned' : (e.to ? (String(e.to).startsWith('tz1burnburn') ? '🔥 Burned' : <ProfileLink address={e.to} />) : <Small>—</Small>)}
                          </div>
                        </Names>
                      </div>
                    </MobileRow>
                  ))}
                </MobileList>
              </MobileOnly>
            </>
          )}
          {history.length > 0 && (
            <Pager>
              <Small style={{marginRight:'auto'}}>Page {curPage} of {totalPages} • {history.length} events</Small>
              <PixelButton size="xs" noActiveFx disabled={curPage<=1} onClick={() => setPage((p) => Math.max(1, p-1))}>Prev</PixelButton>
              <PixelButton size="xs" noActiveFx disabled={curPage>=totalPages} onClick={() => setPage((p) => Math.min(totalPages, p+1))}>Next</PixelButton>
            </Pager>
          )}
        </Panel>
      )}

      {tab === 'listings' && (
        <Panel role="tabpanel">
          {(!listings || listings.length === 0) && <Small>No active listings.</Small>}
          {(listings || []).map((l) => (
            <Row key={`${l.seller}_${l.nonce || Math.random()}`}>
              <div>
                <Mono>{formatMutez(l.priceMutez)} ꜩ</Mono>
                <Small> • by {shortAddr(l.seller)} • qty {l.amount}</Small>
              </div>
              <div>
                {String(l.seller || '').toLowerCase() === String(walletAddr || '').toLowerCase() && (
                  <PixelButton size="xs" noActiveFx onClick={() => setDlg({ kind:'cancel', data: l })} disabled={!l.active} title="Cancel Listing">Cancel Listing</PixelButton>
                )}
              </div>
            </Row>
          ))}
        </Panel>
      )}

      {tab === 'offers' && (
        <Panel role="tabpanel">
          {(!offers || offers.length === 0) && <Small>No open offers.</Small>}
          {offers.map((o, i) => (
            <Row key={`${o.offeror}_${i}`}>
              <div>
                <Mono>{formatMutez(o.priceMutez)} ꜩ</Mono>
                <Small> • by {shortAddr(o.offeror)} • qty {o.amount}</Small>
              </div>
              {isSeller(o.offeror) ? (
                <Small>by you</Small>
              ) : (
                <PixelButton size="xs" noActiveFx onClick={() => setDlg({ kind:'accept', data: o })} title="Accept an offer (seller only)" disabled={!walletAddr}>
                  ACCEPT
                </PixelButton>
              )}
            </Row>
          ))}
        </Panel>
      )}

      {tab === 'owners' && (
        <Panel role="tabpanel">
          {owners.length === 0 && <Small>No current owners found.</Small>}
          {owners.map((o) => (
            <Row key={o.address}>
              <div>
                <Small><ProfileLink address={o.address} /> • x{o.balance}</Small>
              </div>
              <ThankButton address={o.address} tokenUrl={tokenSelfUrl} tokenName={tokenName || `Token #${tokenId}`} />
            </Row>
          ))}
          <div style={{ marginTop: '8px' }}>
            <PixelButton size="xs" noActiveFx onClick={async () => {
              const rows = owners || [];
              if (!rows.length) return;
              const mod = await import('../utils/resolveTezosDomain.js');
              const resolveTezosDomain = mod.resolveTezosDomain || mod.default?.resolveTezosDomain;
              const expanded = await Promise.all(rows.map(async (r) => {
                const addr = r.address;
                let domain = '';
                try { domain = await resolveTezosDomain(addr); } catch {}
                let alias = '';
                try { const j = await (await import('../core/net.js')).jFetch(`/api/handle/${addr}`, 1); alias = (j && j.alias) || ''; } catch {}
                return { address: addr, balance: r.balance, domain, alias };
              }));
              const header = 'address,balance,domain,alias\n';
              const lines = expanded.map((r) => [r.address, r.balance, r.domain, r.alias].map((v) => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
              const csv = header + lines.join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `owners_${addr}_${tokenId}.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }}>Export Owners CSV</PixelButton>
          </div>
        </Panel>
      )}

      {/* Attributes tab intentionally removed per product direction */}

      {/* Curations removed per product direction */}

      {/* Dialogs */}
      {/* owner-only cancel listing */}
      {dlg?.kind === 'cancel' && dlg.data && (
        <CancelListing open contract={addr} tokenId={tokenId} onClose={() => setDlg(null)} />
      )}

      {dlg?.kind === 'accept' && dlg.data && (
        <AcceptOffer
          open
          contract={addr}
          tokenId={tokenId}
          onClose={() => setDlg(null)}
        />
      )}
    </Wrap>
  );
}

TokenDetailsTabs.propTypes = {
  addr     : PropTypes.string.isRequired,
  tokenId  : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  tokenName: PropTypes.string,
  meta     : PropTypes.object,
  rarity   : PropTypes.object,
  isCreator: PropTypes.bool,
};

/* EOF */
