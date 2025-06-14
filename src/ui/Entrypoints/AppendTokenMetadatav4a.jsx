/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendTokenMetadatav4a.jsx
  Rev :    r716   2025-06-27
  Summary: renamed file/component to *v4a*
──────────────────────────────────────────────────────────────*/
import React, { useState, useEffect } from 'react';
import styledPkg                       from 'styled-components';
import { char2Bytes }                  from '@taquito/utils';
import { OpKind }                      from '@taquito/taquito';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';

import listLiveTokenIds    from '../../utils/listLiveTokenIds.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.5rem;`;

export default function AppendTokenMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit, network='ghostnet' } = useWalletContext() || {};
  const snack = (m,s='info')=>setSnackbar({ open:true,message:m,severity:s });

  const [tokOpts,setTokOpts] = useState([]);
  const [loading,setLoading] = useState(false);
  const [tokenId,setTokenId] = useState('');

  useEffect(()=>{
    (async()=>{
      if(!contractAddress) return;
      setLoading(true);
      setTokOpts(await listLiveTokenIds(contractAddress,network,true));
      setLoading(false);
    })();
  },[contractAddress,network]);

  const [key,setKey]       = useState('');
  const [value,setValue]   = useState('');
  const [busy,setBusy]     = useState(false);
  const [estimate,setEstimate]=useState(null);
  const [confirm,setConfirm]=useState(false);
  const [ov,setOv]         = useState({open:false});

  const disabled = !tokenId || !key.trim() || !value.trim() || busy;

  const doEstimate = async ()=>{
    if(!toolkit) return snack('Connect wallet','error');
    try{
      setBusy(true);
      const c = await toolkit.wallet.at(contractAddress);
      const params=[{
        kind:OpKind.TRANSACTION,
        ...c.methods.append_token_metadata(
          key.trim(),
          +tokenId,
          `0x${char2Bytes(value)}`,
        ).toTransferParams(),
      }];
      const [e]=await toolkit.estimate.batch(params);
      setEstimate({
        feeTez:(e.suggestedFeeMutez/1e6).toFixed(6),
        storageTez:(e.burnFeeMutez/1e6).toFixed(6),
      });
      setConfirm(true);
    }catch(err){ snack(err.message,'error'); }
    finally{ setBusy(false); }
  };

  const execute = async ()=>{
    try{
      setConfirm(false);
      setOv({open:true,status:'Waiting for signature…',current:1,total:1});
      const c = await toolkit.wallet.at(contractAddress);
      const op=await c.methods.append_token_metadata(
        key.trim(),
        +tokenId,
        `0x${char2Bytes(value)}`,
      ).send();
      setOv({open:true,status:'Broadcasting…',current:1,total:1});
      await op.confirmation();
      setOv({open:true,opHash:op.opHash});
      snack('Metadata key appended','success');
      onMutate(); setKey(''); setValue('');
    }catch(e){ setOv({open:false}); snack(e.message,'error'); }
  };

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Token Metadata (v4a)</PixelHeading>

      <PixelInput
        placeholder="Token-ID"
        value={tokenId}
        onChange={e=>setTokenId(e.target.value.replace(/\D/g,''))}
      />

      <PixelInput
        placeholder="Metadata Key"
        style={{marginTop:'.6rem'}}
        value={key}
        onChange={e=>setKey(e.target.value)}
      />
      <PixelInput
        as="textarea"
        rows={3}
        placeholder="Value"
        style={{marginTop:'.4rem'}}
        value={value}
        onChange={e=>setValue(e.target.value)}
      />

      <div style={{display:'flex',gap:'.6rem',alignItems:'center',marginTop:'.8rem'}}>
        <PixelButton disabled={disabled} onClick={doEstimate}>
          {busy?'Estimating…':'APPEND'}
        </PixelButton>
        {busy&&<LoadingSpinner size={16}/>}
      </div>

      {confirm&&(
        <OperationConfirmDialog
          open
          slices={1}
          estimate={estimate}
          onOk={execute}
          onCancel={()=>setConfirm(false)}
        />
      )}

      {ov.open&&(
        <OperationOverlay {...ov} onCancel={()=>setOv({open:false})}/>
      )}
    </Wrap>
  );
}
/* EOF */
