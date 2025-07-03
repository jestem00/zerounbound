/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/TokenIdSelect.jsx
  Rev :    r1     2025‑08‑24
  Summary: dropdown of live token‑ids with names
──────────────────────────────────────────────────────────────*/
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Sel = styled.select`
  font-family: inherit;
  padding: 4px 6px;
  min-width: 140px;
`;

export default function TokenIdSelect({
  options = [],
  value   = '',
  onChange = () => {},
}) {
  return (
    <Sel value={value} onChange={(e)=>onChange(e.target.value)}>
      <option value="">All tokens</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} · #{o.id}
        </option>
      ))}
    </Sel>
  );
}

TokenIdSelect.propTypes = {
  options : PropTypes.arrayOf(PropTypes.shape({
    id  : PropTypes.oneOfType([PropTypes.string,PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
  })),
  value   : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
  onChange: PropTypes.func,
};
/* EOF */
