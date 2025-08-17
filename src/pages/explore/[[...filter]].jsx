/*Developed by @jams2blues
  File: src/pages/explore/[[...filter]].jsx
  Rev:  r17
  Summary: Back‑compat redirect shim to /explore/tokens or /explore/collections; preserves filters. */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ExploreCompatRouter() {
  const router = useRouter();
  const { filter, cmd, admin, contract } = router.query;

  useEffect(() => {
    // Determine destination route
    const seg0 = Array.isArray(filter) ? String(filter[0] || '') : '';
    let dest = '/explore/collections'; // default
    const c = typeof cmd === 'string' ? cmd.toLowerCase() : '';

    if (seg0 === 'tokens' || c === 'tokens') dest = '/explore/tokens';
    if (seg0 === 'collections' || c === 'collections') dest = '/explore/collections';

    const q = {};
    if (typeof admin === 'string' && admin)     q.admin = admin;
    if (typeof contract === 'string' && contract) q.contract = contract;

    // Avoid infinite loop if already on target (Next will no-op if same)
    router.replace({ pathname: dest, query: q }).catch(() => {});
  }, [router, filter, cmd, admin, contract]);

  return null;
}

/* What changed & why:
   • Converts legacy /explore, /explore/[tokens|collections], ?cmd=…, into new dedicated pages.
   • Preserves admin/contract filters to avoid breaking shared links. */
