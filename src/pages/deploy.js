/*─────────────────────────────────────────────────────────────────
      Deploy Page for Zero Unbound (Factory v4e)

      This module implements a single–stage deployment flow that
      interacts with the registry‑aware contract factory.  The
      factory’s only entrypoint is `%deploy` and it expects a single
      bytes parameter.  The parameter is ignored by the Michelson
      code; sending an empty byte string (`0x`) satisfies the type
      checker.  The deployment sequence mirrors the legacy flow but
      updates the wallet connection and contract address resolution
      logic to work with the new factory.

      The sequence of actions:
        • Collect metadata via DeployCollectionForm and build an
          ordered metadata object conforming to the TZIP invariants
          (TZIP‑16 contract metadata + off‑chain views + imageUri).
        • Encode the full metadata JSON into a bytes value using
          char2Bytes().  The factory builds the storage itself, so
          only metadata is sent as the parameter; no storage pairs
          are included in this payload.
        • Call the factory’s `%deploy` entrypoint (or its
          equivalent) with the encoded metadata bytes.  Taquito
          dynamically resolves the correct entrypoint whether
          compiled in legacy or modern syntax.
        • Wait for confirmation and resolve the newly originated
          contract address using the on‑chain view `get_last`, RPC
          parsing, block scanning and a TzKT API fallback.  This
          resolution logic mirrors the robust implementation from
          the legacy deploy page.
        • Display progress, errors and the final contract address via
          OperationOverlay.

      The component preserves the multi‑step progress overlay and
      retry/cancel mechanics from earlier revisions.  It also
      supports direct origination when the factory address is
      undefined, falling back to `wallet.originate()` with the full
      contract code and storage.
    ──────────────────────────────────────────────────────────────────*/

    import React, { useRef, useState } from 'react';
    import { MichelsonMap } from '@taquito/michelson-encoder';
    import { char2Bytes } from '@taquito/utils';

    // UI components
    import DeployCollectionForm from '../ui/DeployCollectionForm.jsx';
    import OperationOverlay     from '../ui/OperationOverlay.jsx';

    // Styled container – centre the page content and provide an opaque
    // background.  Without this wrapper the deploy form would sit
    // directly on the page background, causing the decorative zeros to
    // bleed through.  We mimic the layout used on other pages by
    // setting a max‑width, centring with margin auto and applying
    // padding.  The z‑index ensures overlays appear above background
    // graphics.
    import styledPkg from 'styled-components';
    const styled = typeof styledPkg === 'function' ? styledPkg : 
styledPkg.default;

    const Wrap = styled.div`
      position: relative;
      z-index: 2;
      background: var(--zu-bg);
      width: 100%;
      max-width: min(90vw, 1920px);
      margin: 0 auto;
      min-height: calc(var(--vh) - var(--hdr, 0));
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: 0.8rem clamp(0.4rem, 1.5vw, 1.2rem) 1.8rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: clamp(0.2rem, 0.45vh, 0.6rem);
    `;

    // Wallet context.  Destructure both `connect` and `retryConnect` to
    // support legacy and modern wallet flows.  The wallet hook may
    // expose only one of these functions depending on the version.
    import { useWallet } from '../contexts/WalletContext.js';

    // Off‑chain view definitions.  These views are included in the
    // metadata to satisfy TZIP‑16 and TZIP‑12 requirements.  The
    // assert type directive ensures that the JSON is imported as an
    // object rather than compiled by Next.js.
    import viewsJson from 
    '../../contracts/metadata/views/Zero_Contract_v4_views.json' assert { type: 
    'json' };

    // Import the full contract code.  This is used for direct
    // origination when the factory is unavailable.  See
    // originateViaDirect() for usage.
    import contractCode from '../../contracts/Zero_Contract_v4e.tz';

    // Network helper for throttled sleep.  Used when polling for the
    // contract address if Taquito fails to populate it.
    import { sleep } from '../core/net.js';

    // Factory address and API endpoint for the current network.  See
    // deployTarget.js for definitions.  When FACTORY_ADDRESS is defined,
    // origination is routed through the factory; otherwise direct
    // origination is used.
    import { FACTORY_ADDRESS, TZKT_API } from '../config/deployTarget.js';

    /*──────── helper functions ─────────────────────────────────────────*/

    /**
     * Normalise and deduplicate interface strings.  Always includes
     * TZIP‑012 and TZIP‑016, trimming user‑supplied values and
     * upper‑casing for canonical ordering.
     *
     * @param {string[]} src User‑supplied interface list
     * @returns {string[]} Normalised interface list
     */
    const uniqInterfaces = (src = []) => {
      const base = ['TZIP-012', 'TZIP-016'];
      const map  = new Map();
      [...src, ...base].forEach((i) => {
        const k = String(i ?? '').trim();
        if (k) map.set(k.toUpperCase(), k);
      });
      return Array.from(map.values());
    };

    // Precompute hex table for fast string encoding
    const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2,
  '0'));

    /**
     * Convert UTF‑8 string to hex with an optional progress callback.
     * The result is prefixed with `0x` for compatibility with Taquito.
     *
     * @param {string} str UTF‑8 string
     * @param {function(number):void} cb progress callback
     * @returns {string} Hex string prefixed with 0x
     */
    function utf8ToHex(str, cb = () => {}) {
      const bytes = new TextEncoder().encode(str);
      let hex     = '';
      const length = bytes.length;
      const STEP   = 16;
      for (let i = 0; i < length; i += 1) {
        hex += HEX[bytes[i]];
        if ((i & (STEP - 1)) === 0) cb((i / length) * 100);
      }
      cb(100);
      return `0x${hex}`;
    }

    /**
     * Template for initial storage fields.  Only the admin and
     * metadata fields will be populated; all other maps and sets
     * remain empty.  contract_id encodes the human‑readable label
     * “ZeroContract” as a byte sequence.
     */
    export const STORAGE_TEMPLATE = {
      active_tokens    : [],
      admin            : '',
      burn_address     : 'tz1burnburnburnburnburnburnburjAYjjX',
      children         : [],
      collaborators    : [],
      contract_id      : `0x${char2Bytes('ZeroContract')}`,
      destroyed_tokens : [],
      extrauri_counters: new MichelsonMap(),
      ledger           : new MichelsonMap(),
      lock             : false,
      metadata         : new MichelsonMap(),
      next_token_id    : 0,
      operators        : new MichelsonMap(),
      parents          : [],
      token_metadata   : new MichelsonMap(),
      total_supply     : new MichelsonMap(),
    };

    /**
     * Build the v4 storage object.  This helper constructs a fresh
     * copy of STORAGE_TEMPLATE and fills in the admin and metadata
     * fields.  It does not mutate the original template.
     *
     * @param {string} admin Connected wallet address
     * @param {MichelsonMap} md MichelsonMap with metadata entries
     * @returns {Object} Full storage object
     */
    function buildStorage(admin, md) {
      return { ...STORAGE_TEMPLATE, admin, metadata: md };
    }

    /**
     * Encode the collection metadata with required fields and views.
     * Accepts arrays or comma‑separated strings for authors,
     * authoraddress, creators and tags.  Removes undefined values
     * and empty arrays from the final object.  Always normalises
     * interfaces to include TZIP‑012 and TZIP‑016.
     *
     * @param {Object} meta Metadata from the form
     * @returns {Object} Encoded metadata object
     */
    function buildMetaObject(meta) {
      const {
        name,
        symbol,
        description,
        authors,
        authoraddress,
        creators,
        license,
        homepage,
        type,
        interfaces = [],
        imageUri,
        tags,
      } = meta;
      // Normalise values into arrays of trimmed strings.  Accept
      // comma‑separated strings or arrays.
      const normArray = (val) => {
        if (Array.isArray(val)) {
          return val.map((x) => String(x).trim()).filter(Boolean);
        }
        if (typeof val === 'string') {
          return val
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        }
        return undefined;
      };
      // Construct metadata object in the order required by the
      // TZIP invariants (name, symbol, description, version,
      // license, authors, homepage, authoraddress, creators, type,
      // interfaces, imageUri, tags).  Undefined or empty values
      // will be pruned below.
      const md = {};
      md.name        = name;
      md.symbol      = symbol;
      md.description = description;
      md.version     = 'ZeroContractV4';
      md.license     = license;
      md.authors     = normArray(authors);
      md.homepage    = homepage;
      md.authoraddress = normArray(authoraddress);
      md.creators    = normArray(creators);
      md.type        = type;
      md.interfaces  = uniqInterfaces(interfaces);
      md.imageUri    = imageUri;
      // Tags are optional and appended after required keys
      md.tags        = normArray(tags);
      // Remove undefined or empty array properties to avoid
      // serialising empty fields
      Object.keys(md).forEach((k) => {
        if (md[k] === undefined || (Array.isArray(md[k]) && md[k].length === 0))
  {
          delete md[k];
        }
      });
      return md;
    }

    /*──────── main component ─────────────────────────────────────────*/

    export default function Deploy() {
      // Extract wallet properties.  Some versions of the wallet hook
      // expose `connect`, others expose `retryConnect`; we attempt to
      // destructure both.  The toolkit (TezosToolkit) and current
      // address are always present.
      const {
        toolkit,
        address,
        connect: connectWallet,
        retryConnect,
      } = useWallet();

      // Component state: step/progress, label/status, error message and
      // resulting contract address.  Step begins at -1 (idle).
      const [step, setStep]     = useState(-1);
      const [pct, setPct]       = useState(0);
      const [label, setLabel]   = useState('');
      const [err, setErr]       = useState('');
      const [kt1, setKt1]       = useState('');
      // Save the latest metadata for retry; resets on success or cancel.
      const metaRef = useRef(null);

      /**
       * Reset the component to its initial state.  Clears the stored
       * metadata and hides the overlay.
       */
      function reset() {
        setStep(-1);
        setPct(0);
        setLabel('');
        setErr('');
        setKt1('');
        metaRef.current = null;
      }

      /**
       * Ensure that a wallet connection is established.  If the
       * `retryConnect` function is available, use it (legacy wallet
       * behaviour).  Otherwise fall back to `connect`.  If no
       * connection method is available, throw an error.
       */
      async function ensureConnected() {
        if (address) return;
        if (typeof retryConnect === 'function') {
          await retryConnect();
        } else if (typeof connectWallet === 'function') {
          await connectWallet();
        } else {
          throw new Error('Wallet connection function not available');
        }
      }

      /**
       * Originate via the contract factory.  Accepts metadata from the
       * deployment form, constructs storage and calls the factory’s
       * `deploy` entrypoint with an empty bytes parameter.  Resolves
       * the newly originated contract address using on‑chain views,
       * RPC parsing and TzKT fallback.  Updates progress and error
       * state accordingly.
       *
       * @param {Object} meta Metadata collected from the form
       */
      async function originateViaFactory(meta) {
        metaRef.current = meta;
        try {
          await ensureConnected();
        } catch (e) {
          setErr(e.message || String(e));
          setLabel(e.message || String(e));
          return;
        }
        if (!address) return;
        // Build metadata object and inject views.  For the
        // registry‑aware factory, the parameter must be the full
        // contract metadata JSON (including off‑chain views and
        // imageUri) encoded as a bytes string.  The factory builds
        // storage internally, so we do not include the storage in
        // this payload.
        const mdObj       = buildMetaObject(meta);
        const mdObjWithViews = { ...mdObj, views: viewsJson.views };
        const paramBytes  = '0x' + char2Bytes(JSON.stringify(mdObjWithViews));
        // Begin origination via factory
        setErr('');
        setStep(1);
        setLabel('Origination (factory call)');
        setPct(0.25);
        try {
          const factory = await toolkit.wallet.at(FACTORY_ADDRESS);
          // Send call to the factory’s deploy entrypoint.  Use
          // whichever method is available: deploy, default or the
          // first entrypoint.  This guards against differences in
          // contract compilation (legacy vs modern syntax).
          let method;
          if (factory.methods && typeof factory.methods.deploy === 'function') {
            method = factory.methods.deploy(paramBytes);
          } else if (factory.methods && typeof factory.methods.default === 
 'function') {
            method = factory.methods.default(paramBytes);
          } else if (factory.methods) {
            const keys = Object.keys(factory.methods);
            if (keys.length > 0) {
              method = factory.methods[keys[0]](paramBytes);
            } else {
              throw new Error('No callable entrypoints found on factory');
            }
          } else {
            throw new Error('Factory contract methods unavailable');
          }
          const op = await method.send();
          setStep(2);
          setLabel('Waiting for confirmation');
          setPct(0.5);
          // Wait for the operation to be included.  Ignore errors
          // during confirmation (Taquito may throw on timeouts but the
          // operation might still be injected).
          try { await op.confirmation(); } catch {}
          let contractAddr;
          // First attempt: query the factory’s on‑chain view `get_last`.
          try {
            const fContract = await toolkit.contract.at(FACTORY_ADDRESS);
            const last = await fContract.contractViews.get_last().executeView({ 
    viewCaller: FACTORY_ADDRESS });
            if (last) {
              if (typeof last === 'string') {
                contractAddr = last;
              } else if (last.string) {
                contractAddr = last.string;
              } else if (last.some) {
                const entry = last.some;
                if (entry && typeof entry.contract_address === 'string') {
                  contractAddr = entry.contract_address;
                } else if (typeof entry === 'string') {
                  contractAddr = entry;
                }
              }
            }
          } catch {
            /* Ignore view errors; fall back to RPC parsing */
          }
          // Second attempt: parse the operation result from RPC
          if (!contractAddr) {
            try {
              const opHash   = op.opHash || op.hash || op.operationHash || 
 op.operation_hash;
              const opResult = await toolkit.rpc.getOperation(opHash);
              const contents = opResult.contents || [];
              outer: for (const c of contents) {
                const arrays = [];
                const md = c.metadata || {};
                if (Array.isArray(md.internal_operation_results)) {
                  arrays.push(md.internal_operation_results);
                }
                const opRes = md.operation_result;
                if (opRes && Array.isArray(opRes.internal_operation_results)) {
                  arrays.push(opRes.internal_operation_results);
                }
                for (const arr of arrays) {
                  for (const res of arr) {
                    const origin = res?.result?.originated_contracts;
                    if (Array.isArray(origin) && origin.length > 0) {
                      contractAddr = origin[0];
                      break outer;
                    }
                  }
                }
              }
            } catch {
              /* ignore errors in RPC parsing */
            }
          }
          // Third attempt: scan recent blocks for the operation hash
          if (!contractAddr) {
            let resolved = '';
            const opHash = op.opHash || op.hash || op.operationHash || 
 op.operation_hash;
            for (let i = 0; i < 20 && !resolved; i += 1) {
              await sleep(3000);
              try {
                const block = await toolkit.rpc.getBlock();
                for (const opGroup of block.operations.flat()) {
                  if (opGroup.hash === opHash) {
                    for (const c of opGroup.contents) {
                      const md = c.metadata || {};
                      const arrays = [];
                      if (Array.isArray(md.internal_operation_results)) {
                        arrays.push(md.internal_operation_results);
                      }
                      const opRes = md.operation_result;
                      if (opRes && 
 Array.isArray(opRes.internal_operation_results)) {
                        arrays.push(opRes.internal_operation_results);
                      }
                      for (const arr of arrays) {
                        for (const ir of arr) {
                          const origin = ir?.result?.originated_contracts;
                          if (Array.isArray(origin) && origin.length > 0) {
                            resolved = origin[0];
                            break;
                          }
                        }
                        if (resolved) break;
                      }
                      if (resolved) break;
                    }
                  }
                  if (resolved) break;
                }
              } catch {
                /* ignore block polling errors */
              }
            }
            contractAddr = resolved || contractAddr;
          }
          // Final fallback: query TzKT API for the operation
          if (!contractAddr) {
            const opHash = op.opHash || op.hash || op.operationHash || 
 op.operation_hash;
            let resolved = '';
            try {
              const apiUrl = `${TZKT_API}/v1/operations/${opHash}`;
              const res = await fetch(apiUrl);
              if (res.ok) {
                const ops = await res.json();
                const findOrigin = (opsList) => {
                  for (const item of opsList) {
                    // Direct origination
                    if (
                      item.type === 'origination' &&
                      item.originatedContract &&
                      item.originatedContract.address
                    ) {
                      return item.originatedContract.address;
                    }
                    // Internal operations may be nested under 'internals'
                    if (Array.isArray(item.internals)) {
                      for (const inner of item.internals) {
                        if (
                          inner.type === 'origination' &&
                          inner.originatedContract &&
                          inner.originatedContract.address
                        ) {
                          return inner.originatedContract.address;
                        }
                      }
                    }
                  }
                  return '';
                };
                const tzktAddress = findOrigin(ops);
                if (tzktAddress) {
                  resolved = tzktAddress;
                }
              }
            } catch {
              /* ignore errors from TzKT fallback */
            }
            contractAddr = resolved || contractAddr;
          }
          if (!contractAddr) {
            const msg = 'Could not resolve contract address after origination.';
            setErr(msg);
            setLabel(msg);
            return;
          }
          // Success: update final state
          setKt1(contractAddr);
          setErr('');
          setStep(5);
          setPct(1);
          setLabel('Origination confirmed');
        } catch (err2) {
          const msg = err2.message || String(err2);
          setErr(msg);
          setLabel(msg);
        }
      }

      /**
       * Originate directly via wallet.originate().  This function is
       * retained for completeness and mirrors the legacy flow.  It
       * originates the contract without using the factory, embedding
       * the full contract code.  This path is executed when
       * FACTORY_ADDRESS is undefined.
       *
       * @param {Object} meta Metadata from the form
       */
      async function originateViaDirect(meta) {
        metaRef.current = meta;
        try {
          await ensureConnected();
        } catch (e) {
          setErr(e.message || String(e));
          setLabel(e.message || String(e));
          return;
        }
        if (!address) return;
        // Build metadata object and inject views
        const mdObj       = buildMetaObject(meta);
        const mdViews     = { ...viewsJson };
        const mdObjWithViews = { ...mdObj, views: mdViews.views };
        const headerBytes = '0x' + char2Bytes('tezos-storage:content');
        const bodyHex     = utf8ToHex(JSON.stringify(mdObjWithViews), () => {});
        const md          = new MichelsonMap();
        md.set('', headerBytes);
        md.set('content', bodyHex);
        const storage = buildStorage(address, md);
        // Begin direct origination
        setErr('');
        setStep(1);
        setLabel('Origination (wallet)');
        setPct(0.25);
        try {
          const op = await toolkit.wallet.originate({ code: contractCode, 
 storage }).send();
          setStep(2);
          setLabel('Waiting for confirmation');
          setPct(0.5);
          try { await op.confirmation(); } catch {}
          let contractAddr = op.contractAddress;
          if (!contractAddr) {
            try {
              const c = await (op.contract?.());
              if (c && c.address) {
                contractAddr = c.address;
              }
            } catch {}
          }
          if (!contractAddr) {
            try {
              const arr = op.getOriginatedContractAddresses?.();
              if (arr && arr.length) {
                contractAddr = arr[0];
              }
            } catch {}
          }
          if (!contractAddr) {
            let resolved = '';
            const opHash = op.opHash || op.hash || op.operationHash || 
 op.operation_hash;
            for (let i = 0; i < 20 && !resolved; i += 1) {
              await sleep(3000);
              try {
                const block = await toolkit.rpc.getBlock();
                for (const opGroup of block.operations.flat()) {
                  if (opGroup.hash === opHash) {
                    const res = opGroup.contents.find((c) => c.kind === 
 'origination');
                    if 
 (res?.metadata?.operation_result?.originated_contracts?.length) {
                      resolved = 
 res.metadata.operation_result.originated_contracts[0];
                      break;
                    }
                  }
                }
              } catch {}
              if (resolved) break;
            }
            if (!resolved) {
              const msg = 'Could not resolve contract address after origination.';
              setErr(msg);
              setLabel(msg);
              return;
            }
            contractAddr = resolved;
          }
          setKt1(contractAddr);
          setErr('');
          setStep(5);
          setPct(1);
          setLabel('Origination confirmed');
        } catch (err2) {
          const msg = err2.message || String(err2);
          setErr(msg);
          setLabel(msg);
        }
      }

      /**
       * Choose origination method based on factory availability.  If
       * FACTORY_ADDRESS is defined, route through the factory;
       * otherwise perform a direct origination.
       *
       * @param {Object} meta Metadata from the form
       */
      async function originate(meta) {
        if (FACTORY_ADDRESS) {
          await originateViaFactory(meta);
        } else {
          await originateViaDirect(meta);
        }
      }

      /*──────── render ─────────────────────────────────────────*/
      return (
        <Wrap>
          {/* Deploy form collects metadata and triggers origination.  Use
              the expected onDeploy prop instead of onSubmit; the
              DeployCollectionForm invokes this callback with the user’s
              metadata when the form submits. */}
          <DeployCollectionForm onDeploy={originate} />
          {/* Show the overlay whenever a step is in progress or an error
              has occurred.  The overlay will cover the parent wrapper and
              report progress, errors and the resulting contract address. */}
          {(step !== -1 || err) && (
            <OperationOverlay
              status={label}
              progress={pct}
              error={!!err}
              kt1={kt1}
              onCancel={reset}
              onRetry={metaRef.current ? () => {
                reset();
                originate(metaRef.current);
              } : undefined}
              step={step}
              total={1}
            />
          )}
        </Wrap>
      );
    }

    /* What changed & why:
       • Integrated support for v4e contracts by importing the new
         Michelson source file (`Zero_Contract_v4e.tz`) in place of the
         previous v4 contract.  This ensures that direct originations
         embed the corrected update_operators parameter order while
         maintaining full backwards compatibility with the existing
         deployment flow.
       • Updated the module header to reflect the factory version (v4e).
       All other logic remains identical to the prior revision. */