/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MakeOfferBtn.jsx
  Rev :    r2     2025‑09‑16
  Summary: XS size + teal accent so CTA pops
──────────────────────────────────────────────────────────────*/
import PropTypes  from 'prop-types';
import PixelButton from './PixelButton.jsx';

const STYLE = {
  background      : '#009e7a',        /* teal – distinct from accent */
  borderColor     : '#00d3a1',
  color           : '#fff',
  fontSize        : '.65rem',
  padding         : '2px 6px',
  lineHeight      : 1,
};

export default function MakeOfferBtn({ contract, tokenId }) {
  const fire = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('zu:makeOffer', {
      detail: { contract, tokenId },
    }));
  };

  return (
    <PixelButton
      size="xs"
      style={STYLE}
      onClick={fire}
      title="Make an offer"
    >
      OFFER
    </PixelButton>
  );
}

MakeOfferBtn.propTypes = {
  contract: PropTypes.string.isRequired,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
/* EOF */
