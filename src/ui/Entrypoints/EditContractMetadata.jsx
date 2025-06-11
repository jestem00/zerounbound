/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/EditContractMetadata.jsx
  Summary: v4 edit_contract_metadata helper */

import React,{useState} from 'react';
import PixelHeading from '../PixelHeading.jsx';
import PixelInput   from '../PixelInput.jsx';
import PixelButton  from '../PixelButton.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';

export default function EditContractMetadata({
  contractAddress, tezos, setSnackbar=()=>{}, onMutate=()=>{}, $level
}){
  const { toolkit:ctxToolkit } = useWalletContext()||{};
  const kit = tezos||ctxToolkit||window.tezosToolkit;
  const snack=(m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  const [hex,setHex]=useState('');
  const [busy,setBusy]=useState(false);

  const run = async ()=>{
    if(!hex.startsWith('0x')) return snack('Hex must start 0x','error');
    if(!kit?.wallet) return snack('Connect wallet','error');
    try{
      setBusy(true);
      const c = await kit.wallet.at(contractAddress);
      const op = await c.methods.edit_contract_metadata(hex).send();
      snack('Waiting…','info'); await op.confirmation();
      snack('Done','success'); setHex(''); onMutate();
    }catch(e){snack(e.message,'error');}finally{setBusy(false);}
  };

  return(
    <div $level={$level}>
      <PixelHeading level={3}>Edit Contract Metadata</PixelHeading>
      <PixelInput placeholder="metadata bytes hex (0x…)" value={hex} onChange={e=>setHex(e.target.value)}/>
      <PixelButton style={{marginTop:'.8rem'}} disabled={busy} onClick={run}>
        {busy?'Processing…':'Send'}
      </PixelButton>
    </div>
  );
}

/* What changed & why: new functional component for v4 */