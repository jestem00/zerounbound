/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/ManageParentChild.jsx
  Summary: Manage parents/children – wallet ctx aware */

import React, { useEffect, useState, useCallback } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import PixelButton from '../PixelButton.jsx';
import { TZKT_API } from '../../config/deployTarget.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const API = `${TZKT_API}/v1`;
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Tabs = styled('div')`display:flex;gap:.5rem;`;
const Tab = styled(PixelButton).withConfig({ shouldForwardProp: (p) => p !== '$sel' })`
  opacity:${(p) => (p.$sel ? 1 : 0.55)};
`;
const List = styled('div')`
  max-height:40vh;overflow:auto;border:2px solid var(--zu-fg);
  padding:.5rem;background:var(--zu-bg-alt);font-size:.72rem;line-height:1.25;
`;
const Row = styled('div')`
  display:flex;justify-content:space-between;align-items:center;gap:.5rem;
  padding:.25rem 0;border-bottom:1px dashed var(--zu-fg);
  &:last-child{border-bottom:none;}
`;
const Del = styled(PixelButton)`font-size:.6rem;padding:0 .4rem;background:var(--zu-accent-sec);`;

export default function ManageParentChild({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit = tezos || ctxToolkit || window.tezosToolkit;
  const snack = (m, s = 'warning') => setSnackbar({ open: true, message: m, severity: s });

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

  const [tab, setTab] = useState('parent');
  const [parents, setPs] = useState([]);
  const [children, setCs] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const c = await kit.contract.at(contractAddress);
      const st = await c.storage();

      const pull = async (src) => {
        if (Array.isArray(src)) return src;
        if (typeof src?.forEach === 'function') {
          const t = [];
          src.forEach((a) => t.push(a));
          return t;
        }
        if (src != null) return fetchKeys(src);
        return [];
      };

      setPs(await pull(st.parents));
      setCs(await pull(st.children));
    } catch (e) {
      snack(`Fetch fail: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [kit, contractAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (addr, type) => {
    if (!kit?.wallet) return snack('Connect wallet first', 'error');
    try {
      setBusy(true);
      const c = await kit.wallet.at(contractAddress);
      const ep = type === 'parent' ? 'remove_parent' : 'remove_child';
      const op = await c.methods[ep](addr).send();
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

  const data = tab === 'parent' ? parents : children;

  return (
    <div $level={$level}>
      <PixelHeading level={4}>Manage {tab === 'parent' ? 'Parents' : 'Children'}</PixelHeading>

      <Tabs>
        <Tab $sel={tab === 'parent'} size="xs" onClick={() => setTab('parent')}>
          Parents ({parents.length})
        </Tab>
        <Tab $sel={tab === 'child'} size="xs" onClick={() => setTab('child')}>
          Children ({children.length})
        </Tab>
      </Tabs>

      {busy && <p style={{ fontSize: '.7rem' }}>⏳ Loading…</p>}
      {!busy &&
        (data.length === 0 ? (
          <p style={{ fontSize: '.7rem', marginTop: '.5rem' }}>None</p>
        ) : (
          <List>
            {data.map((a) => (
              <Row key={a}>
                <span style={{ wordBreak: 'break-all' }}>{a}</span>
                <Del size="xs" onClick={() => remove(a, tab)}>
                  ✖
                </Del>
              </Row>
            ))}
          </List>
        ))}
    </div>
  );
}
/* What changed & why: toolkit via WalletContext; wallet guard */
