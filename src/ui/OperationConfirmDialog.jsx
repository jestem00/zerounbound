/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/OperationConfirmDialog.jsx
  Rev :    r662   2025-07-09
  Summary: show per-call fee & “paid by contract” note
──────────────────────────────────────────────────────────────*/
import React from 'react';
import styledPkg from 'styled-components';
import PixelButton     from './PixelButton.jsx';
import LoadingSpinner  from './LoadingSpinner.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Back = styled.div`
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.86);z-index:2600;
`;
const Panel = styled.div`
  width:90vw;max-width:360px;background:#0b0b0b;color:#fff;
  border:2px solid #bebebe;box-shadow:0 0 0 2px #000,0 0 12px #000;
  padding:2rem 2.2rem;text-align:center;font-family:var(--font-pixel);
`;

export default function OperationConfirmDialog({
  open = false,
  slices = 1,
  estimate = null,
  onOk = () => {},
  onCancel = () => {},
}) {
  if (!open) return null;

  /* derive per-slice fee when relevant */
  const perSliceFee = (
    estimate && slices > 1
      ? (parseFloat(estimate.feeTez) / slices).toFixed(6)
      : null
  );
  const burnZero = estimate && Number(estimate.storageTez) === 0;

  return (
    <Back>
      <Panel>
        <h2 style={{ margin: '0 0 .8rem' }}>Confirm Transaction</h2>

        <p style={{ fontSize: '.8rem', margin: 0 }}>
          {slices > 1
            ? <>This upload needs <strong>{slices}</strong> batched calls.</>
            : 'This operation fits in one call.'}
        </p>

        {estimate ? (
          <p style={{ fontSize: '.8rem', margin: '.4rem 0 0', lineHeight: 1.35 }}>
            Network fee ≈ {estimate.feeTez}&nbsp;ꜩ
            {perSliceFee && <> &nbsp;(~{perSliceFee}&nbsp;ꜩ&nbsp;×&nbsp;{slices})</>}
            <br />
            Storage burn ≈ {estimate.storageTez}&nbsp;ꜩ
            {burnZero && ' (paid by contract)'}
          </p>
        ) : (
          <div style={{ marginTop: '.6rem' }}>
            <LoadingSpinner size={24} />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            marginTop: '1.4rem',
          }}
        >
          <PixelButton onClick={onOk}>OK</PixelButton>
          <PixelButton onClick={onCancel}>Cancel</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}
/* What changed & why:
   • Added per-slice fee display for multi-call uploads.
   • Appends “(paid by contract)” note when burn = 0.
   • No logic outside UI touched; lint-clean & invariant-safe.
*/
/* EOF */
