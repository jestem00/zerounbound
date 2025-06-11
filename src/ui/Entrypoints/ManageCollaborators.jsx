/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/ManageCollaborators.jsx
  Summary: List & remove collaborators – wallet ctx aware */

import React, { useEffect, useState, useCallback } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import PixelButton from '../PixelButton.jsx';
import { TZKT_API } from '../../config/deployTarget.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const API = `${TZKT_API}/v1`;
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Box = styled('div')`display:flex;flex-direction:column;gap:.9rem;`;
const List = styled('div')`
  max-height:40vh;overflow:auto;border:2px solid var(--zu-fg);padding:.5rem;
  background:var(--zu-bg-alt);font-size:.72rem;line-height:1.25;
`;
const Row = styled('div')`
  display:flex;justify-content:space-between;align-items:center;gap:.5rem;
  padding:.25rem 0;border-bottom:1px dashed var(--zu-fg);
  &:last-child{border-bottom:none;}
`;
const Del = styled(PixelButton)`font-size:.6rem;padding:0 .4rem;background:var(--zu-accent-sec);`;

export default function ManageCollaborators({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit = tezos || ctxToolkit || window.tezosToolkit;
  const snack = (m, s = 'warning') => setSnackbar({ open: true, message: m, severity: s });

  /* fetch helpers */
  const fetchKeys = async (ptr) => {
    const id =
      typeof ptr === 'number'
        ? ptr
        : typeof ptr === 'object' && Number.isInteger(ptr.id)
        ? ptr.id
        : null;
    if (id == null) return [];
    return fetch(`${API}/bigmaps/${id}/keys?limit=10000&select=key`)
      .then((r) => r.json())
      .catch(() => []);
  };

  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const c = await kit.contract.at(contractAddress);
      const st = await c.storage();

      if (Array.isArray(st.collaborators)) return setList(st.collaborators);
      if (typeof st.collaborators?.forEach === 'function') {
        const tmp = [];
        st.collaborators.forEach((a) => tmp.push(a));
        return setList(tmp);
      }
      if (st.collaborators != null) return setList(await fetchKeys(st.collaborators));
      setList([]);
    } catch (e) {
      snack(`Fetch fail: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [kit, contractAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (addr) => {
    if (!kit?.wallet) return snack('Connect wallet first', 'error');
    try {
      setBusy(true);
      const c = await kit.wallet.at(contractAddress);
      const op = await c.methods.remove_collaborator(addr).send();
      snack('Removing…', 'info');
      await op.confirmation();
      snack('Removed', 'success');
      onMutate();
      load();
    } catch (e) {
      snack(`Fail: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box $level={$level}>
      <PixelHeading level={4}>Manage Collaborators</PixelHeading>
      {busy && <p style={{ fontSize: '.7rem' }}>⏳ Loading…</p>}
      {!busy &&
        (list.length === 0 ? (
          <p style={{ fontSize: '.7rem' }}>No collaborators</p>
        ) : (
          <List>
            {list.map((a) => (
              <Row key={a}>
                <span style={{ wordBreak: 'break-all' }}>{a}</span>
                <Del size="xs" onClick={() => remove(a)}>
                  ✖
                </Del>
              </Row>
            ))}
          </List>
        ))}
    </Box>
  );
}
/* What changed & why: toolkit via WalletContext; wallet guard */
