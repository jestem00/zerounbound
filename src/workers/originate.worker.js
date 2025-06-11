/*Developed by @jams2blues with love for the Tezos community
  File: src/workers/originate.worker.js
  Summary: same interfaces-dedupe helper as deploy.js */

import { char2Bytes } from '@taquito/utils';
import viewsJson      from '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type:'json' };

/* helpers */
const uniqInterfaces = src => {
  const base = ['TZIP-012', 'TZIP-016'];
  const map  = new Map();
  [...(src || []), ...base].forEach(i => {
    const k = String(i ?? '').trim();
    if (!k) return;
    map.set(k.toUpperCase(), k);
  });
  return Array.from(map.values());
};

const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);
const utf8ToHex = str => {
  const bytes=new TextEncoder().encode(str);
  return '0x'+bytes.reduce((acc,b)=>acc+HEX[b],'');
};

/*──────── worker ───────*/
self.onmessage = ({ data }) => {
  const { meta, taskId='orig' } = data;

  const ordered = {
    name:          meta.name,
    description:   meta.description,
    version:       'ZeroContractV4',
    license:       meta.license,
    authors:       meta.authors,
    homepage:      meta.homepage,
    authoraddress: meta.authoraddress,
    creators:      meta.creators,
    type:          meta.type,
    interfaces:    uniqInterfaces(meta.interfaces),
    imageUri:      meta.imageUri,
    views:         viewsJson.views,
  };
  Object.keys(ordered).forEach(k => ordered[k] === undefined && delete ordered[k]);

  const header = '0x' + char2Bytes('tezos-storage:content');
  const body   = utf8ToHex(JSON.stringify(ordered));

  self.postMessage({
    taskId,
    header,
    body,
  });
};

/* What changed & why: shared uniqInterfaces ensures metadata emitted by
   worker also has single “TZIP-012/016” entries. */
