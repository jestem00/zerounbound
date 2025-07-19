/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues with love for the Tezos community
  File:    src/contexts/WalletContext.js
  Rev :    r530   2025‑07‑19
  Summary: enable default P2P matrix nodes (fix Temple wallet)

  A simplified wallet context for ZeroUnbound.  It removes the
  explicit matrixNodes override, allowing Beacon to select the
  appropriate transport (extension or matrix relay).  The context
  manages the TezosToolkit and BeaconWallet instances, restores
  existing sessions, and exposes connect/disconnect and reveal
  helpers.  No secret‑key override is supported.
────────────────────────────────────────────────────────────*/

import React, {
  createContext, useContext, useEffect, useState, useRef,
  useCallback, useMemo,
} from 'react';
import { TezosToolkit } from '@taquito/taquito';
import { BeaconWallet }  from '@taquito/beacon-wallet';
import { DEFAULT_NETWORK } from '../config/deployTarget.js';
import { chooseFastestRpc } from '../utils/chooseFastestRpc.js';

/*──────── constants ─────────*/
const APP_NAME      = 'ZeroUnbound.art';
const BALANCE_FLOOR = 500_000;     /* 0.5 ꜩ mutez */

/*──────── context helpers ─────────*/
const WalletCtx = createContext(null);
export const useWalletContext = () => useContext(WalletCtx);
export const useWallet = useWalletContext;

/*──────── provider ─────────*/
export function WalletProvider({ children, initialNetwork = DEFAULT_NETWORK }) {
  const tkRef     = useRef(null);
  const walletRef = useRef(null);
  const rpcRef    = useRef('');
  const initRef   = useRef(null);

  const [network]        = useState(initialNetwork);
  const [address, setAddr]    = useState('');
  const [connected, setConn]   = useState(false);
  const [mismatch, setMis]     = useState(false);
  const [needsReveal, setRev]  = useState(false);
  const [needsFunds, setFunds] = useState(false);

  /* sync the wallet state from Beacon */
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

  /* initialize toolkit & wallet */
  const init = useCallback(async () => {
    if (initRef.current) return initRef.current;
    const p = (async () => {
      const rpc = await chooseFastestRpc().catch(() => '');
      rpcRef.current = rpc;
      const tk = new TezosToolkit(rpc);
      tk.setProvider({ config:{
        confirmationPollingIntervalSecond: 5,
        confirmationPollingTimeoutSecond : 300,
      }});
      tkRef.current = tk;

      walletRef.current = new BeaconWallet({
        name            : APP_NAME,
        preferredNetwork: network,
        colorMode       : 'dark',
      });
      // no metrics
      walletRef.current.client.sendMetrics = async () => {};
      walletRef.current.client.updateMetricsStorage = async () => {};
      tkRef.current.setWalletProvider(walletRef.current);

      // silent restore
      const acc = await walletRef.current.client.getActiveAccount().catch(() => null);
      if (acc) await sync();
    })();
    initRef.current = p;
    await p;
  }, [network, sync]);

  useEffect(() => {
    init().catch(() => {});
  }, [init]);

  const disconnect = useCallback(async () => {
    if (!walletRef.current) return;
    try { await walletRef.current.clearActiveAccount(); } catch {}
    await sync();
  }, [sync]);

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
  }, [network, sync, init, disconnect]);

  const revealAccount = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');
    if (needsFunds) throw new Error('Insufficient balance');
    const mgrKey = await tkRef.current.rpc.getManagerKey(address).catch(() => null);
    if (mgrKey) {
      setRev(false);
      return;
    }
    const op = await tkRef.current.wallet
      .transfer({ to: address, amount: 0.000001 })
      .send();
    await op.confirmation();
    setRev(false);
    return op.opHash;
  }, [address, needsFunds]);

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

/* What changed & why: Removed matrixNodes override to allow Beacon’s
   default transport selection (P2P or extension).  This fixes
   Temple Wallet injection errors.  Simplified the provider for
   clarity and updated revision. */