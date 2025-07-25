/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FiltersPanel.jsx
  Rev :    r3     2025‑07‑25 UTC
  Summary: Responsive filters panel for the explore pages.  This
           component renders a sidebar on desktop and a modal on
           mobile, allowing users to filter tokens by authors,
           MIME type, tags, edition type, mature content and
           flashing content.  Accepts the current token list
           and filter state as props, and updates the state via
           callbacks.  This revision hardens the author and tag
           derivation logic to handle non-array metadata fields,
           preventing runtime errors when a token’s metadata
           contains a string instead of an array.
──────────────────────────────────────────────────────────────*/

import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import { useState, useEffect } from 'react';
import PixelButton from './PixelButton.jsx';

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
  label { display: block; margin: 2px 0; }
  input[type='checkbox'] { margin-right: 4px; }
`;

export default function FiltersPanel({ tokens = [], filters, setFilters, renderToggle, buttonStyle }) {
  const [show, setShow] = useState(false);
  const [isDesktop, setDesktop] = useState(false);

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
    authors.forEach((a) => { if (a) authSet.add(a); });
    // Normalize tags to an array as well
    let tags = m.tags || [];
    if (!Array.isArray(tags)) {
      tags = tags ? [tags] : [];
    }
    tags.forEach((tg) => { if (tg) tagSet.add(tg); });
    if (m.mimeType) mimeSet.add(m.mimeType);
  });

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
              {a}
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

/* What changed & why: Added a brand-new FiltersPanel component.  This
   implementation is adapted from the explore bundle (r2) and
   includes robustness improvements.  In particular, the derivation
   of authors and tags now normalizes metadata fields that may be
   strings into arrays, preventing runtime errors when using
   `.forEach()` on a non-array.  The component renders a desktop
   sidebar and a mobile pop‑up, integrates with PixelButton for the
   Filters toggle, and exposes callbacks to update filter state. */
/* EOF */