/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FiltersPanel.jsx
  Rev :    r2     2025‑10‑05
  Summary: responsive token filter sidebar / mobile modal
──────────────────────────────────────────────────────────────*/
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import { useState, useEffect } from 'react';
import PixelButton from './PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Side = styled.aside`
  background:var(--zu-bg-dim,#111);
  border:2px solid var(--zu-accent,#00c8ff);
  padding:10px;
  font-size:.75rem;
  display:none;                 /* default – shown via media */
  @media(min-width:1100px){ display:block; }
`;

const ModalWrap = styled.div`
  position:fixed;left:0;right:0;bottom:0;top:var(--hdr,0);
  background:rgba(0,0,0,.9);
  z-index:9;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:1rem;
`;

const Panel = styled.div`
  max-width:320px;width:100%;background:var(--zu-bg,#000);
  border:2px solid var(--zu-accent);padding:12px;display:flex;
  flex-direction:column;gap:8px;max-height:85vh;overflow:auto;
`;

const Section = styled.fieldset`
  border:1px solid var(--zu-fg);padding:6px;
  legend{padding:0 4px;font-family:'Pixeloid Sans',monospace;}
  label{display:block;margin:2px 0;}
  input[type="checkbox"]{margin-right:4px;}
`;

export default function FiltersPanel({ tokens = [], filters, setFilters, renderToggle, buttonStyle }) {
  const [show, setShow] = useState(false);

  /* derive quick filter lists */
  const authSet = new Set();
  const tagSet  = new Set();
  const mimeSet = new Set();
  tokens.forEach((t) => {
    const m = t.metadata || {};
    const as = m.authors || m.artists || m.creators || [];
    as.forEach((a) => authSet.add(a));
    (m.tags || []).forEach((tg) => tagSet.add(tg));
    if (m.mimeType) mimeSet.add(m.mimeType);
  });

  /* handlers */
  const toggleSetVal = (setName, val) => {
    setFilters((f) => {
      const s = new Set(f[setName]);
      s.has(val) ? s.delete(val) : s.add(val);
      return { ...f, [setName]: s };
    });
    if (window.innerWidth < 1100) setShow(false);
  };

  const onRadio = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    if (window.innerWidth < 1100) setShow(false);
  };

  /* auto-close mobile modal on resize or change */
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1100) setShow(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const body = (
    <Panel>
      <Section>
        <legend>Authors</legend>
        {[...authSet].sort().map((a) => (
          <label key={a}>
            <input type="checkbox"
              checked={filters.authors.has(a)}
              onChange={() => toggleSetVal('authors', a)} />
            {a}
          </label>
        ))}
      </Section>

      <Section>
        <legend>MIME Type</legend>
        {[...mimeSet].sort().map((m) => (
          <label key={m}>
            <input type="checkbox"
              checked={filters.mime.has(m)}
              onChange={() => toggleSetVal('mime', m)} />
            {m}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Tags</legend>
        {[...tagSet].sort().map((tg) => (
          <label key={tg}>
            <input type="checkbox"
              checked={filters.tags.has(tg)}
              onChange={() => toggleSetVal('tags', tg)} />
            {tg}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Edition Type</legend>
        {['all','1of1','editions'].map((v) => (
          <label key={v}>
            <input type="radio" name="edType"
              checked={filters.type===v||(!filters.type&&v==='all')}
              onChange={()=>onRadio('type', v==='all'?'':v)} />
            {v}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Mature</legend>
        {['include','exclude','only'].map((v)=>(
          <label key={v}>
            <input type="radio" name="mature"
              checked={filters.mature===v}
              onChange={()=>onRadio('mature', v)} />
            {v}
          </label>
        ))}
      </Section>

      <Section>
        <legend>Flashing</legend>
        {['include','exclude','only'].map((v)=>(
          <label key={v}>
            <input type="radio" name="flashing"
              checked={filters.flash===v}
              onChange={()=>onRadio('flash', v)} />
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
      {renderToggle
        ? renderToggle(() => setShow(true))
        : (
          <PixelButton size="sm"
            style={buttonStyle || { position:'fixed',bottom:10,right:10,zIndex:8 }}
            onClick={()=>setShow(true)}
          >FILTERS</PixelButton>
        )}

      {show && (
        <ModalWrap onClick={()=>setShow(false)}>
          {body}
        </ModalWrap>
      )}
    </>
  );
}

FiltersPanel.propTypes = {
  tokens    : PropTypes.array,
  filters   : PropTypes.object.isRequired,
  setFilters: PropTypes.func.isRequired,
  renderToggle: PropTypes.func,
  buttonStyle: PropTypes.object,
};
/* What changed & why: removed apply button; auto-close after change */
/* EOF */