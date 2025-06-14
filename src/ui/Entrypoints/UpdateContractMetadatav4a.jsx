/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateContractMetadatav4a.jsx
  Rev :    r716   2025-06-27
  Summary: renamed file/component to *v4a*
──────────────────────────────────────────────────────────────*/
import React, { useState } from 'react';
import { char2Bytes }      from '@taquito/utils';
import { OpKind }          from '@taquito/taquito';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';

export default function UpdateContractMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  const [json,setJson]  = useState('');
  const [est,setEst]    = useState(null);
  const [confirm,setConfirm]=useState(false);
  const [ov,setOv]      = useState({open:false});

  const disabled = !json.trim();

  const estimate = async ()=>{
    if(!toolkit) return snack('Connect wallet','error');
    try{
      const c=await toolkit.wallet.at(contractAddress);
      const params=[{
        kind:OpKind.TRANSACTION,
        ...c.methods.update_contract_metadata(`0x${char2Bytes(json)}`).toTransferParams(),
      }];
      const [e]=await toolkit.estimate.batch(params);
      setEst({
        feeTez:(e.suggestedFeeMutez/1e6).toFixed(6),
        storageTez:(e.burnFeeMutez/1e6).toFixed(6),
      });
      setConfirm(true);
    }catch(err){ snack(err.message,'error'); }
  };

  const send = async ()=>{
    try{
      setConfirm(false);
      setOv({open:true,status:'Waiting for signature…'});
      const c=await toolkit.wallet.at(contractAddress);
      const op=await c.methods.update_contract_metadata(`0x${char2Bytes(json)}`).send();
      setOv({open:true,status:'Broadcasting…'});
      await op.confirmation();
      setOv({open:true,opHash:op.opHash});
      snack('Contract metadata updated','success');
      onMutate(); setJson('');
    }catch(e){ setOv({open:false}); snack(e.message,'error'); }
  };

  return (
    <section style={{marginTop:'1.5rem'}} $level={$level}>
      <PixelHeading level={3}>Update Contract Metadata (v4a)</PixelHeading>
      <PixelInput
        as="textarea"
        rows={6}
        placeholder="Full metadata JSON"
        value={json}
        onChange={e=>setJson(e.target.value)}
      />

      <PixelButton style={{marginTop:'.8rem'}} disabled={disabled} onClick={estimate}>
        UPDATE
      </PixelButton>

      {confirm&&(
        <OperationConfirmDialog
          open
          slices={1}
          estimate={est}
          onOk={send}
          onCancel={()=>setConfirm(false)}
        />
      )}

      {ov.open&&(
        <OperationOverlay {...ov} onCancel={()=>setOv({open:false})}/>
      )}
    </section>
  );
}
/* EOF */
