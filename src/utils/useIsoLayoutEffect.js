/*Developed by @jams2blues with love for the Tezos community
  File: src/utils/useIsoLayoutEffect.js
  Summary: isomorphic drop-in that maps to useLayoutEffect only
           on the client to silence React 18 SSR warnings. */
import { useEffect, useLayoutEffect } from 'react';

const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default useIsoLayoutEffect;
/* What changed & why: tiny helper so headers can safely measure
   themselves without throwing hydration warnings on Next.js. */
