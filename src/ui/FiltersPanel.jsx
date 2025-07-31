/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FiltersPanel.jsx
  Rev :    r4    2025‑07‑27 UTC
  Summary: Responsive filters panel for the explore pages.  This
           component renders a sidebar on desktop and a modal on
           mobile, allowing users to filter tokens by authors,
           MIME type, tags, edition type, mature content and
           flashing content.  Author entries now resolve Tezos
           domains when reverse records exist and truncate
           addresses via shortAddr() when unresolved, with
           word‑wrapping to prevent clipping.  Domain names are
           displayed in full.  This revision introduces a
           domains cache and asynchronous lookups via
           resolveTezosDomain().
──────────────────────────────────────────────────────────────*/

import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import { useState, useEffect, useCallback } from 'react';
import PixelButton from './PixelButton.jsx';

// Import domain resolver, network selection and address formatter.
import { resolveTezosDomain } from '../utils/resolveTezosDomain.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
import { shortAddr } from '../utils/formatAddress.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Side = styled.aside`
  background: var(--zu-bg-dim, #111);
  border: 2px solid var(--zu-accent, #00c8ff);
  padding: 10px;
  font-size: 0.75rem;
  display: none;
  @media (min-width: 1100px) { display: block; }
`;

const ModalWrap = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  top: var(--hdr, 0);
  background: rgba(0, 0, 0, 0.9);
  z-index: 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const Panel = styled.div`
  max-width: 320px;
  width: 100%;
  background: var(--zu-bg, #000);
  border: 2px solid var(--zu-accent);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 85vh;
  overflow: auto;
`;

const Section = styled.fieldset`
  border: 1px solid var(--zu-fg);
  padding: 6px;
  legend { padding: 0 4px; font-family: 'Pixeloid Sans', monospace; }
  label {
    display: block;
    margin: 2px 0;
    word-break: break-all;
    white-space: normal;
  }
  input[type='checkbox'] { margin-right: 4px; }
`;

export default function FiltersPanel({ tokens = [], filters, setFilters, renderToggle, buttonStyle }) {
  const [show, setShow] = useState(false);
  const [isDesktop, setDesktop] = useState(false);

  // Cache for reverse domain lookups.  Keys are lower-cased addresses;
  // values are the resolved domain or null.
  const [domains, setDomains] = useState({});

  /* responsive ‑ SSR‑safe */
  useEffect(() => {
    const check = () => setDesktop(window.innerWidth >= 1100);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* derive quick filter lists */
  const authSet = new Set();
  const tagSet = new Set();
  const mimeSet = new Set();
  tokens.forEach((t) => {
    const m = t.metadata || {};
    // Safely derive authors/creators/artists array.  Metadata fields may
    // be a string or array; normalize to an array before iteration.
    let authors = m.authors || m.artists || m.creators || [];
    if (!Array.isArray(authors)) {
      authors = authors ? [authors] : [];
    }
    authors.forEach((a) => { if (a) authSet.add(String(a)); });
    // Normalize tags to an array as well
    let tags = m.tags || [];
    if (!Array.isArray(tags)) {
      tags = tags ? [tags] : [];
    }
    tags.forEach((tg) => { if (tg) tagSet.add(String(tg)); });
    if (m.mimeType) mimeSet.add(m.mimeType);
  });

  // Resolve domains for Tezos addresses in the authors set.
  useEffect(() => {
    const addrs = [...authSet].filter((a) => typeof a === 'string' && /^(tz|kt)/i.test(a.trim()));
    addrs.forEach((addr) => {
      const key = addr.trim().toLowerCase();
      if (domains[key] !== undefined) return;
      (async () => {
        const name = await resolveTezosDomain(addr, NETWORK_KEY);
        setDomains((prev) => {
          if (prev[key] !== undefined) return prev;
          return { ...prev, [key]: name };
        });
      })();
    });
  }, [tokens]);

  // Format a single author entry: return the resolved domain if present;
  // return the string verbatim if it contains a dot (likely a name);
  // otherwise abbreviate addresses via shortAddr().
  const formatAuthor = useCallback((val) => {
    if (!val || typeof val !== 'string') return String(val || '');
    const v = val.trim();
    const key = v.toLowerCase();
    const dom = domains[key];
    if (dom) return dom;
    if (v.includes('.')) return v;
    return shortAddr(v);
  }, [domains]);

  /* handlers */
  const closeIfMobile = () => {
    if (!isDesktop) setShow(false);
  };
  const toggleSetVal = (setName, val) =>
    setFilters((f) => {
      const s = new Set(f[setName]);
      s.has(val) ? s.delete(val) : s.add(val);
      return { ...f, [setName]: s };
    });
  const onRadio = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    closeIfMobile();
  };

  /*──── UI body ───────────────────────────────────────────*/
  const body = (
    <Panel>
      <Section>
        <legend>Authors</legend>
        {[...authSet]
          .sort((a, b) => a.localeCompare(b))
          .map((a) => (
            <label key={a}>
              <input
                type="checkbox"
                checked={filters.authors.has(a)}
                onChange={() => {
                  toggleSetVal('authors', a);
                  closeIfMobile();
                }}
              />
              {formatAuthor(a)}
            </label>
          ))}
      </Section>

      <Section>
        <legend>MIME Type</legend>
        {[...mimeSet]
          .sort((a, b) => a.localeCompare(b))
          .map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={filters.mime.has(m)}
                onChange={() => {
                  toggleSetVal('mime', m);
                  closeIfMobile();
                }}
              />
              {m}
            </label>
          ))}
      </Section>

      <Section>
        <legend>Tags</legend>
        {[...tagSet]
          .sort((a, b) => a.localeCompare(b))
          .map((tg) => (
            <label key={tg}>
              <input
                type="checkbox"
                checked={filters.tags.has(tg)}
                onChange={() => {
                  toggleSetVal('tags', tg);
                  closeIfMobile();
                }}
              />
              {tg}
            </label>
          ))}
      </Section>

      <Section>
        <legend>Edition Type</legend>
        {['all', '1of1', 'editions'].map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="edType"
              checked={filters.type === v || (!filters.type && v === 'all')}
              onChange={() => onRadio('type', v === 'all' ? '' : v)}
            />
            {v}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Mature</legend>
        {['include', 'exclude', 'only'].map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="mature"
              checked={filters.mature === v}
              onChange={() => onRadio('mature', v)}
            />
            {v}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Flashing</legend>
        {['include', 'exclude', 'only'].map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="flash"
              checked={filters.flash === v}
              onChange={() => onRadio('flash', v)}
            />
            {v}
          </label>
        ))}
      </Section>
    </Panel>
  );

  return (
    <>
      {/* desktop sidebar */}
      <Side>{body}</Side>

      {/* mobile toggle */}
      {!isDesktop && (
        renderToggle ? (
          renderToggle(() => setShow(true))
        ) : (
          <PixelButton
            size="sm"
            style={buttonStyle || { position: 'fixed', bottom: 10, right: 10, zIndex: 8 }}
            onClick={() => setShow(true)}
          >
            FILTERS
          </PixelButton>
        )
      )}

      {/* mobile modal overlay */}
      {!isDesktop && show && (
        <ModalWrap onClick={() => setShow(false)}>
          {/* stop propagation to prevent closing when clicking inside */}
          <div onClick={(e) => e.stopPropagation()}>
            {body}
          </div>
        </ModalWrap>
      )}
    </>
  );
}

FiltersPanel.propTypes = {
  tokens     : PropTypes.arrayOf(PropTypes.object),
  filters    : PropTypes.shape({
    authors: PropTypes.instanceOf(Set),
    mime   : PropTypes.instanceOf(Set),
    tags   : PropTypes.instanceOf(Set),
    type   : PropTypes.string,
    mature : PropTypes.string,
    flash  : PropTypes.string,
  }).isRequired,
  setFilters: PropTypes.func.isRequired,
  renderToggle: PropTypes.func,
  buttonStyle: PropTypes.object,
};