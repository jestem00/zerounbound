/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/index.js
  Summary: export v4 metadata-operation components */

export { default as AddRemoveCollaborator } from './AddRemoveCollaborator.jsx';
export { default as AddRemoveParentChild }  from './AddRemoveParentChild.jsx';
export { default as BalanceOf }             from './BalanceOf.jsx';
export { default as Burn }                  from './Burn.jsx';
export { default as Destroy }               from './Destroy.jsx';
export { default as ManageCollaborators }   from './ManageCollaborators.jsx';
export { default as ManageParentChild }     from './ManageParentChild.jsx';
export { default as Transfer }              from './Transfer.jsx';
export { default as Mint }                  from './Mint.jsx';
export { default as MintPreview }           from './MintPreview.jsx';
export { default as MintUpload }            from './MintUpload.jsx';
export { default as UpdateOperators }       from './UpdateOperators.jsx';
/* new v4 ops */
export { default as AppendArtifactUri }     from './AppendArtifactUri.jsx';
export { default as AppendExtraUri }        from './AppendExtraUri.jsx';
export { default as ClearUri }              from './ClearUri.jsx';
export { default as EditContractMetadata }  from './EditContractMetadata.jsx';
export { default as EditTokenMetadata }     from './EditTokenMetadata.jsx';
/* What changed & why: surfaced v4 metadata entrypoints */