/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FiltersPanel.jsx
  Rev :    r5    2025‑10‑12 UTC
  Summary: Responsive filters panel for the explore pages. Adds a
           dropdown tag selector and attribute‑based rarity
           filters with counts and percentages alongside the
           existing author, MIME, edition and safety filters.  It
           still resolves Tezos domains and word‑wraps long
           labels, using a domains cache with async lookups.
──────────────────────────────────────────────────────────────*/

import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
 
// Simple drawer header used to collapse/expand attributes list
const DrawerHead = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 6px;
  margin: 4px 0 2px;
  background: transparent;
  border: 1px dashed var(--zu-fg);
  color: inherit;
  cursor: pointer;
  font-family: 'Pixeloid Sans', monospace;
`;

export default function FiltersPanel({ tokens = [], filters, setFilters, renderToggle, buttonStyle }) {
  const [show, setShow] = useState(false);
  const [isDesktop, setDesktop] = useState(false);
  const [attrsOpen, setAttrsOpen] = useState(false);

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
  const mimeSet = new Set();
  const tagCounts = new Map();
  const attrMap = new Map(); // name -> Map(value -> count)
  tokens.forEach((t) => {
    const m = t.metadata || {};
    // authors/creators/artists normalize to array
    let authors = m.authors || m.artists || m.creators || [];
    if (!Array.isArray(authors)) authors = authors ? [authors] : [];
    authors.forEach((a) => { if (a) authSet.add(String(a)); });

    // tags
    let tags = m.tags || [];
    if (!Array.isArray(tags)) tags = tags ? [tags] : [];
    tags.forEach((tg) => {
      if (!tg) return;
      const key = String(tg);
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    });

    // attributes
    const attrs = Array.isArray(m.attributes) ? m.attributes : [];
    attrs.forEach(({ name, value }) => {
      if (!name) return;
      const n = String(name);
      const v = String(value);
      if (!attrMap.has(n)) attrMap.set(n, new Map());
      const valMap = attrMap.get(n);
      valMap.set(v, (valMap.get(v) || 0) + 1);
    });

    if (m.mimeType) mimeSet.add(m.mimeType);
  });

  // Track how many attribute values are currently selected
  const selectedAttrCount = useMemo(() => {
    const obj = filters?.attributes || {};
    let n = 0;
    for (const k of Object.keys(obj)) {
      const s = obj[k];
      if (s && typeof s.size === 'number') n += s.size;
    }
    return n;
  }, [filters]);

  // Restore drawer state from localStorage and auto-open when filters active
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem('zu:filters:attrsOpen');
        if (saved === '1') setAttrsOpen(true);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (selectedAttrCount > 0) setAttrsOpen(true);
  }, [selectedAttrCount]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('zu:filters:attrsOpen', attrsOpen ? '1' : '0');
      }
    } catch {}
  }, [attrsOpen]);

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
  const onTag = (val) => {
    setFilters((f) => ({ ...f, tag: val }));
    closeIfMobile();
  };
  const toggleAttr = (name, val) =>
    setFilters((f) => {
      const attrs = { ...f.attributes };
      const set = new Set(attrs[name] || []);
      set.has(val) ? set.delete(val) : set.add(val);
      if (set.size) attrs[name] = set; else delete attrs[name];
      return { ...f, attributes: attrs };
    });

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
        <select
          value={filters.tag}
          onChange={(e) => onTag(e.target.value)}
          style={{ fontFamily: 'inherit', width: '100%', padding: '4px 6px' }}
        >
          <option value="">All Tags</option>
          {[...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tg, count]) => (
              <option key={tg} value={tg}>
                {tg} ({count})
              </option>
            ))}
        </select>
      </Section>

      <Section>
        <legend>Attributes</legend>
        <DrawerHead type="button" onClick={() => setAttrsOpen((v) => !v)} aria-expanded={attrsOpen}>
          <span>
            Attributes{selectedAttrCount ? ` (${selectedAttrCount})` : ''}
          </span>
          <span>{attrsOpen ? '▴' : '▾'}</span>
        </DrawerHead>
        {attrsOpen && (
          <div>
            {[...attrMap.entries()].map(([name, map]) => (
              <Section key={name}>
                <legend>{name}</legend>
                {[...map.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([val, count]) => {
                    const pct = ((count / tokens.length) * 100).toFixed(1);
                    const set = filters.attributes[name] || new Set();
                    return (
                      <label key={val}>
                        <input
                          type="checkbox"
                          checked={set.has(val)}
                          onChange={() => {
                            toggleAttr(name, val);
                            closeIfMobile();
                          }}
                        />
                        {val} ({count} • {pct}%)
                      </label>
                    );
                  })}
              </Section>
            ))}
          </div>
        )}
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
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
            >
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
    tag    : PropTypes.string,
    type   : PropTypes.string,
    mature : PropTypes.string,
    flash  : PropTypes.string,
    attributes: PropTypes.objectOf(PropTypes.instanceOf(Set)),
  }).isRequired,
  setFilters: PropTypes.func.isRequired,
  renderToggle: PropTypes.func,
  buttonStyle: PropTypes.object,
};

/* What changed & why (r5):
   • Replaced tag checkboxes with a dropdown selector.
   • Added attribute rarity filters with counts and percentages.
*/
