/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/ui/ShareDialog.jsx
  Rev :    r2    2025-08-27
  Summary: Reusable dialog component for sharing NFTs on social
           networks. Uses the existing PixelConfirmDialog to
           display a preview, pre-formatted share text and one-click
           social buttons. Designed to be theme-agnostic and can
           operate on any token/collection by receiving props.
*/

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';
import PixelButton from './PixelButton.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import { SITE_URL } from '../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* styled content */
const Preview = styled.img`
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  object-position: center;
  image-rendering: pixelated;
  border: 1px solid var(--zu-accent,#00c8ff);
`;

const ShareText = styled.p`
  margin: 0;
  padding: 0.5rem 0;
  font-size: 0.8rem;
  line-height: 1.3;
  word-break: break-word;
`;

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  align-items: center;
  margin-top: 0.5rem;
`;

/* component */
export default function ShareDialog({
  open = false,
  onClose = () => {},
  name,
  creators = [],
  addr,
  tokenId,
  previewUri,
  artistAlias,
  variant = 'view', // 'view' | 'purchase'
  scope = 'token',   // 'token' | 'collection'
  downloadUri,
  downloadMime,
  downloadName,
  url, // optional explicit link override (e.g., collections)
}) {
  const shareUrl = useMemo(() => {
    if (url) return url;
    if (!addr || tokenId === undefined) return SITE_URL;
    return `${SITE_URL}/tokens/${addr}/${tokenId}`;
  }, [addr, tokenId, url]);
  const isAddress = (s) => /^(tz[1-3][0-9A-Za-z]{33}|KT1[0-9A-Za-z]{33})$/i.test(String(s || '').trim());
  const handle = useMemo(() => {
    const a = String(artistAlias || '').trim();
    if (!a) return '';
    if (a.startsWith('@')) return a;            // already a handle
    if (isAddress(a)) return a;                 // full address
    if (/^(tz|kt)/i.test(a) || a.includes('...')) return a; // short/abbrev tz/KT1 retains form without '@'
    return `@${a}`;                             // plain alias -> prefix '@'
  }, [artistAlias]);
  const isCollection = scope === 'collection' || (tokenId == null && !!url);
  const title = name || (isCollection ? 'Collection' : `Token #${tokenId}`);
  const text = useMemo(() => {
    const firstCreator = (() => {
      const c = Array.isArray(creators) ? creators.find((v) => typeof v === 'string' && v.trim()) : '';
      if (!c) return '';
      // if it's an address, use full address; otherwise use as-is
      return isAddress(c) ? c : c;
    })();
    const by = handle || firstCreator;
    const byStr = by ? ` by ${by}` : '';
    const verb = variant === 'purchase' ? 'have just collected' : 'am sharing';
    const base = isCollection ? `I ${verb} "${title}" NFT collection` : `I ${verb} "${title}"`;
    return `${base}${byStr} on @ZeroUnboundArt ${shareUrl}`;
  }, [title, handle, creators, shareUrl, variant, isCollection]);
  const twitterHref = useMemo(() => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, [text]);
  const copyToClipboard = () => {
    if (typeof window === 'undefined' || !window.navigator?.clipboard) return;
    try {
      window.navigator.clipboard.writeText(shareUrl);
      // eslint-disable-next-line no-alert
      alert('Link copied to clipboard');
    } catch {
      // ignore
    }
  };
  const nativeShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text: text.replace(shareUrl, '').trim(), url: shareUrl });
        onClose?.();
      } else if (typeof window !== 'undefined') {
        window.open(twitterHref, '_blank', 'noopener');
      }
    } catch {
      /* ignore */
    }
  };
  const message = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      {previewUri && (
        <Preview src={previewUri} alt={title} />
      )}
      <ShareText>{text}</ShareText>
      <ButtonRow>
        <PixelButton noActiveFx size="xs" onClick={nativeShare} aria-label="Share" title="Share via system or X">
          Share
        </PixelButton>
        <PixelButton
          as="a"
          href={twitterHref}
          target="_blank"
          rel="noopener noreferrer"
          noActiveFx
          size="xs"
          aria-label="Share on X"
          title="Share on X"
        >
          X
        </PixelButton>
        <PixelButton noActiveFx size="xs" onClick={copyToClipboard} aria-label="Copy link" title="Copy link to clipboard">
          Copy Link
        </PixelButton>
        {downloadUri && (
          <PixelButton
            as="a"
            href={normalizeUri(downloadUri)}
            download={suggestedFilename(downloadName || title, downloadMime)}
            noActiveFx
            size="xs"
            aria-label="Download original"
            title={downloadMime ? `Download (${downloadMime})` : 'Download'}
          >
            Download
          </PixelButton>
        )}
      </ButtonRow>
    </div>
  );
  return (
    <PixelConfirmDialog
      open={open}
      title={`Share ${title}`}
      message={message}
      okLabel="Close"
      hideCancel
      onOk={onClose}
      onCancel={onClose}
    />
  );
}

ShareDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  name: PropTypes.string,
  creators: PropTypes.arrayOf(PropTypes.any),
  addr: PropTypes.string,
  tokenId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  previewUri: PropTypes.string,
  artistAlias: PropTypes.string,
  variant: PropTypes.oneOf(['view', 'purchase']),
  scope: PropTypes.oneOf(['token', 'collection']),
  downloadUri: PropTypes.string,
  downloadMime: PropTypes.string,
  downloadName: PropTypes.string,
};

// helpers for downloads
function normalizeUri(uri) {
  if (typeof uri !== 'string') return '';
  return uri.startsWith('ipfs://') ? uri.replace(/^ipfs:\/\//i, 'https://ipfs.io/ipfs/') : uri;
}
function suggestedFilename(nameOrTitle, mime) {
  const base = String(nameOrTitle || 'download').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
  const ext = (() => {
    const m = String(mime || '').toLowerCase();
    if (!m) return '';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    return (m.split(';')[0].split('/')[1] || '').replace(/\+.*$/, '');
  })();
  return ext ? `${base}.${ext}` : base;
}

/* What changed & why:
   - Introduced a dedicated ShareDialog component built on top of
     PixelConfirmDialog. It computes a share URL from SITE_URL and
     token identifiers, composes share text, provides buttons to
     share via the system/X and copy the link, and displays a preview
     of the artwork. Consumers can pass an artist alias when available.
*/
