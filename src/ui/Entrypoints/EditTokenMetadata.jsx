/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/EditTokenMetadata.jsx
  Summary: v4 edit_token_metadata helper (basic string→bytes map) */

import React,{useState} from 'react';
import PixelHeading from '../PixelHeading.jsx';
import PixelInput   from '../PixelInput.jsx';
import PixelButton  from '../PixelButton.jsx';
import { char2Bytes } from '@taquito/utils';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { useWalletContext } from '../../contexts/WalletContext.js';

export default function EditTokenMetadata({
  contractAddress, tezos, setSnackbar=()=>{}, onMutate=()=>{}, $level
}){
  const { toolkit:ctxToolkit } = useWalletContext()||{};
  const kit = tezos||ctxToolkit||window.tezosToolkit;
  const snack=(m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  const [id,setId] = useState('');
  const [k,setK]   = useState('');
  const [v,setV]   = useState('');
  const [busy,setBusy]=useState(false);

  const run = async ()=>{
    const tid=Number(id);
    if(!Number.isFinite(tid)||!k||!v) return snack('Fill fields','error');
    if(!kit?.wallet) return snack('Connect wallet','error');
    try{
      setBusy(true);
      const m = new MichelsonMap();
      m.set(k,'0x'+char2Bytes(v));
      const c = await kit.wallet.at(contractAddress);
      const op = await c.methods.edit_token_metadata(m,tid).send();
      snack('Waiting…','info'); await op.confirmation();
      snack('Done','success'); setId('');setK('');setV(''); onMutate();
    }catch(e){snack(e.message,'error');}finally{setBusy(false);}
  };

  return(
    <div $level={$level}>
      <PixelHeading level={3}>Edit Token Metadata</PixelHeading>
      <PixelInput type="number" placeholder="token id" value={id} onChange={e=>setId(e.target.value)}/>
      <PixelInput placeholder="key" value={k} onChange={e=>setK(e.target.value)}/>
      <PixelInput placeholder="value" value={v} onChange={e=>setV(e.target.value)}/>
      <PixelButton style={{marginTop:'.8rem'}} disabled={busy} onClick={run}>
        {busy?'Processing…':'Send'}
      </PixelButton>
    </div>
  );
}

/* What changed & why: new functional component for v4 */