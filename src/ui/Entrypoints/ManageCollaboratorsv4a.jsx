/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/ManageCollaboratorsv4a.jsx
  Rev :    r732   2025-07-12
  Summary: HelpBox and minor UI tweaks
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import styledPkg             from 'styled-components';
import PixelHeading          from '../PixelHeading.jsx';
import PixelButton           from '../PixelButton.jsx';
import LoadingSpinner        from '../LoadingSpinner.jsx';
import { TZKT_API }          from '../../config/deployTarget.js';
import { useWalletContext }  from '../../contexts/WalletContext.js';
import { jFetch }            from '../../core/net.js';

const API     = `${TZKT_API}/v1`;
const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────*/
const Wrap = styled.section`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const Box  = styled.div`display:flex;flex-direction:column;gap:.9rem;`;
const List = styled.div`
  max-height:40vh;overflow:auto;border:2px solid var(--zu-fg);
  padding:.5rem;background:var(--zu-bg-alt);
  font-size:.72rem;line-height:1.25;
`;
const Row = styled.div`
  display:flex;justify-content:space-between;align-items:center;gap:.5rem;
  padding:.25rem 0;border-bottom:1px dashed var(--zu-fg);
  &:last-child{border-bottom:none;}
`;
const Del = styled(PixelButton)`
  font-size:.6rem;padding:0 .4rem;background:var(--zu-accent-sec);
`;

/*──────── helpers ─────*/
const isTz = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

/*════════ component ════════════════════════════════════════*/
export default function ManageCollaboratorsv4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'warning') =>
    setSnackbar({ open: true, message: m, severity: s });

  /* fetch helpers */
  const fetchKeys = async (ptr) => {
    const id =
      typeof ptr === 'number'
        ? ptr
        : typeof ptr === 'object' && Number.isInteger(ptr.id)
        ? ptr.id
        : null;
    if (id == null) return [];
    return jFetch(`${API}/bigmaps/${id}/keys?limit=10000&select=key`).catch(() => []);
  };

  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!toolkit) return;
    try {
      setBusy(true);
      const c  = await toolkit.contract.at(contractAddress);
      const st = await c.storage();

      if (Array.isArray(st.collaborators))      return setList(st.collaborators);
      if (typeof st.collaborators?.forEach === 'function') {
        const tmp = [];
        st.collaborators.forEach((a) => tmp.push(a));
        return setList(tmp);
      }
      if (st.collaborators != null) return setList(await fetchKeys(st.collaborators));
      setList([]);
    } catch (e) { snack(`Fetch fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  }, [toolkit, contractAddress]);

  useEffect(() => { load(); }, [load]);

  const remove = async (addr) => {
    if (!toolkit?.wallet) return snack('Connect wallet first', 'error');
    if (!isTz(addr))      return snack('Bad address', 'error');
    try {
      setBusy(true);
      const c  = await toolkit.wallet.at(contractAddress);
      /* remove_collaborators expects set<address> */
      const op = await c.methods.remove_collaborators([addr]).send();
      snack('Removing…', 'info');
      await op.confirmation();
      snack('Removed', 'success');
      onMutate(); load();
    } catch (e) { snack(`Fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  };

  /*──────── JSX ─────────*/
  return (
    <Wrap $level={$level}>
      <Box>
        <PixelHeading level={4}>Manage Collaborators (v4a)</PixelHeading>
        <HelpBox>
          Lists current collaborators from the on-chain <code>set&lt;address&gt;</code>.
          Click **✖** to remove instantly. Add new ones via the “v4a plural” entrypoint.
        </HelpBox>

        {busy && (
          <p style={{ fontSize: '.7rem' }}>
            ⏳ Loading… <LoadingSpinner size={16} style={{ marginLeft: 4 }} />
          </p>
        )}

        {!busy && (
          list.length === 0
            ? <p style={{ fontSize: '.7rem' }}>No collaborators</p>
            : (
              <List>
                {list.map((a) => (
                  <Row key={a}>
                    <span style={{ wordBreak: 'break-all' }}>{a}</span>
                    <Del size="xs" onClick={() => remove(a)}>✖</Del>
                  </Row>
                ))}
              </List>
            )
        )}
      </Box>
    </Wrap>
  );
}
/* What changed & why:
   • Unified HelpBox style + description.
   • Busy indicator re-uses LoadingSpinner.
   • Minor wording & lint fixes. */
/* EOF */
