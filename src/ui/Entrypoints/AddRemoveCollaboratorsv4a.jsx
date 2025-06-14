/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AddRemoveCollaboratorsv4a.jsx
  Rev :    r715   2025-06-27
  Summary: v4a plural collaborator helper (set<address>)
──────────────────────────────────────────────────────────────*/
import React, { useState }       from 'react';
import PixelHeading              from '../PixelHeading.jsx';
import PixelInput                from '../PixelInput.jsx';
import PixelButton               from '../PixelButton.jsx';
import { useWalletContext }      from '../../contexts/WalletContext.js';

const isTz = (a)=>/^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export default function AddRemoveCollaboratorsv4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);

  const run = async (ep)=>{
    if(!toolkit) return snack('Connect wallet','error');
    const addrs=Array.from(
      new Set(
        input.split(/[\s,]/).map(t=>t.trim()).filter(Boolean),
      ),
    );
    if(!addrs.length) return snack('No addresses','warning');
    if(addrs.some(a=>!isTz(a))) return snack('Invalid address present','error');
    try{
      setBusy(true);
      const c=await toolkit.wallet.at(contractAddress);
      /* Michelson set<address> → pass JS array → Taquito handles */
      const op=await c.methods[ep](addrs).send();
      snack('Waiting for confirmation…');
      await op.confirmation();
      snack('Done','success'); onMutate();
      setInput('');
    }catch(e){ snack(e.message,'error'); }
    finally{ setBusy(false); }
  };

  return (
    <section style={{marginTop:'1.5rem'}} $level={$level}>
      <PixelHeading level={3}>Collaborators (v4a)</PixelHeading>
      <PixelInput
        as="textarea"
        rows={3}
        placeholder="tz1… KT1… — comma/space/new-line separated"
        value={input}
        onChange={e=>setInput(e.target.value)}
      />
      <div style={{display:'flex',gap:'.8rem',marginTop:'.8rem'}}>
        <PixelButton disabled={busy} onClick={()=>run('add_collaborators')}>
          {busy?'…':''}ADD
        </PixelButton>
        <PixelButton disabled={busy} onClick={()=>run('remove_collaborators')}>
          {busy?'…':''}REMOVE
        </PixelButton>
      </div>
    </section>
  );
}
/* EOF */
