/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/dev/generative/p5-wizard.jsx
  Rev :    r1   2025-09-07
  Summary: Standalone route for GeneratorWizard.
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import GeneratorWizard from '../../../ui/Generative/GeneratorWizard.jsx';

export default function P5WizardPage() {
  const [result, setResult] = useState(null);
  return (
    <div style={{ padding: 16 }}>
      <GeneratorWizard onExport={setResult} />
      {result && (
        <div style={{ marginTop: 24 }}>
          <h4>Token metadata</h4>
          <textarea
            readOnly
            value={JSON.stringify(result.tokenMeta, null, 2)}
            rows={12}
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: '0.9em' }}>
            Copy the fields above into the mint form when you are ready to test a
            ghostnet mint.
          </p>
        </div>
      )}
    </div>
  );
}

/* What changed & why: expose wizard at /dev/generative/p5-wizard. */
