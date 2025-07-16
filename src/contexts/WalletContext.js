/*  Developed by @jams2blues with love for the Tezos community
    File:   src/contexts/WalletContext.js
    Rev :   r529
    Summary:
      • Restore silent session on mount via useEffect calling init
      • Handle init errors silently to avoid blocking  */

import React, {
  createContext, useContext, useEffect, useState, useRef,
  useCallback, useMemo,
} from 'react';
import { TezosToolkit } from '@taquito/taquito';
import { BeaconWallet }  from '@taquito/beacon-wallet';
import { BeaconEvent }   from '@airgap/beacon-sdk';
import {
  DEFAULT_NETWORK,
  selectFastestRpc,
} from '../config/deployTarget.js';

/*──────── constants ─────*/
const APP_NAME      = 'ZeroUnbound.art';
const BALANCE_FLOOR = 500_000;     /* 0.5 ꜩ mutez */
const SPAM_RX       = /\/_synapse\/client\/beacon\/info|Syncing stopped manually|ERR_NAME_NOT_RESOLVED/i;

/*──────── console noise-gate ─────*/
if (typeof window !== 'undefined' && !window.__ZU_SPAM_LOCK__) {
  window.__ZU_SPAM_LOCK__ = true;
  const mute = x => SPAM_RX.test(typeof x === 'string' ? x : x?.message || '');
  ['warn','error'].forEach(k => {
    const orig = console[k].bind(console);
    console[k] = (...args) => { if (!mute(args[0])) orig(...args); };
  });
  window.addEventListener('unhandledrejection', e => {
    if (mute(e.reason)) e.preventDefault();
  });
}

/*──────── RPC helper ─────*/
async function pickRpc() {
  return selectFastestRpc().catch(() => {
    throw new Error('No reachable RPC for active network');
  });
}

/*──────── factories ─────*/
const makeToolkit = rpc => {
  const tk = new TezosToolkit(rpc);
  tk.setProvider({ config:{
    confirmationPollingIntervalSecond: 5,
    confirmationPollingTimeoutSecond : 300,
  }});
  return tk;
};

/*──────── context ─────*/
const WalletCtx = createContext(null);
export const useWalletContext = () => useContext(WalletCtx);
export const useWallet = useWalletContext;

/*════════ provider ════════════════════════════════════════*/
export function WalletProvider({ children, initialNetwork = DEFAULT_NETWORK }) {
  const tkRef     = useRef(null);
  const walletRef = useRef(null);
  const rpcRef    = useRef('');
  const initRef   = useRef(null);  // promise for init

  const [network]        = useState(initialNetwork);
  const [address, setAddr]    = useState('');
  const [connected, setConn]   = useState(false);
  const [mismatch, setMis]     = useState(false);
  const [needsReveal, setRev]  = useState(false);
  const [needsFunds, setFunds] = useState(false);

  /*── init ────────────────────────────────────────────────*/
  const init = useCallback(async () => {
    if (initRef.current) return initRef.current;

    const p = (async () => {
      const rpc = await pickRpc();
      rpcRef.current = rpc;
      tkRef.current  = makeToolkit(rpc);

      walletRef.current = new BeaconWallet({
        name            : APP_NAME,
        preferredNetwork: network,
        matrixNodes     : [],    // disable P2P
        colorMode       : 'dark',
      });
      walletRef.current.client.sendMetrics = async () => {};
      walletRef.current.client.updateMetricsStorage = async () => {};
      tkRef.current.setWalletProvider(walletRef.current);
      walletRef.current.client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, sync);

      // silent restore
      const acc = await walletRef.current.client.getActiveAccount().catch(() => null);
      if (acc) await sync();

    })();

    initRef.current = p;
    await p;
  }, [network]);

  /*── state sync ─────────────────────────────────────────*/
  const sync = useCallback(async () => {
    const acc = await walletRef.current?.client.getActiveAccount();
    if (!acc) {
      setAddr(''); setConn(false); setMis(false); setRev(false); setFunds(false);
      return;
    }
    setAddr(acc.address);
    setConn(true);
    const netType = (acc.network?.type || '').toLowerCase();
    setMis(netType !== network);
    try {
      const [mgrKey, balance] = await Promise.all([
        tkRef.current.rpc.getManagerKey(acc.address).catch(() => null),
        tkRef.current.tz.getBalance(acc.address).catch(() => 0),
      ]);
      setRev(!mgrKey);
      setFunds(balance.toNumber() < BALANCE_FLOOR);
    } catch {}
  }, [network]);

  /* silent restore on mount */
  useEffect(() => {
    init().catch(() => {});  // silent error
  }, [init]);

  /*── actions ────────────────────────────────────────────*/
  const connect = useCallback(async () => {
    await init();

    let acc = await walletRef.current.client.getActiveAccount().catch(() => null);
    if (acc) {
      const netType = (acc.network?.type || '').toLowerCase();
      if (netType !== network) {
        await disconnect();
        acc = null;
      }
    }
    if (!acc) {
      await walletRef.current.requestPermissions({
        network: { type: network, rpcUrl: rpcRef.current },
      });
    }
    await sync();
  }, [network, sync, init]);

  const disconnect = useCallback(async () => {
    if (!walletRef.current) return;
    try { await walletRef.current.clearActiveAccount(); } catch {}
    await sync();
  }, [sync]);

  const revealAccount = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');
    if (needsFunds) throw new Error('Insufficient balance');

    // skip if already revealed
    const mgrKey = await tkRef.current.rpc.getManagerKey(address).catch(() => null);
    if (mgrKey) {
      setRev(false);
      return;
    }

    // explicit 1 mutez self-transfer to reveal
    const op = await tkRef.current.wallet
      .transfer({ to: address, amount: 0.000001 })
      .send();
    await op.confirmation();
    setRev(false);
    return op.opHash;
  }, [address, needsFunds]);

  /*── context value ──────────────────────────────────────*/
  const value = useMemo(() => ({
    tezos:             tkRef.current,
    toolkit:           tkRef.current,
    wallet:            walletRef.current,
    rpcUrl:            rpcRef.current,
    network, address,
    isWalletConnected: connected,
    connect, disconnect,
    networkMismatch:   mismatch,
    needsReveal, needsFunds,
    revealAccount,
  }), [
    network, address, connected, mismatch,
    needsReveal, needsFunds, connect,
    disconnect, revealAccount,
  ]);

  return (
    <WalletCtx.Provider value={value}>
      {children}
    </WalletCtx.Provider>
  );
}

export default WalletProvider;

/* What changed & why: Added useEffect to call init() on mount for silent restore; catch init errors silently; rev r529; Compile-Guard passed. */
/* EOF */