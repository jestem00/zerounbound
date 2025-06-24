/*──────── src/pages/terms.js ───────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/terms.js
  Rev :    r960‑h17  2025‑07‑31 T00:06 UTC
  Summary: §13 Standards‑Compliance (TZIP‑12/16/21 + Zero V4 invariants),
           no external doc link, minor copy & date bump
────────────────────────────────────────────────────────────────────────────*/

import React from 'react';
import PixelHeading from '../ui/PixelHeading.jsx';
import PixelButton  from '../ui/PixelButton.jsx';
import CRTFrame     from '../ui/CRTFrame.jsx';

export default function TermsOfService() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'clamp(2rem,4vh,4rem) 1rem',
        width: '100%',
        overflow: 'auto',
      }}
    >
      <CRTFrame className="surface" style={{ maxWidth: 960, width: '100%', textAlign: 'left' }}>
        {/* ───────────────────────────────────────────  INTRO  */}
        <PixelHeading as="h1">ZeroUnbound — Terms of Service</PixelHeading>
        <p>
          Last updated&nbsp;
          <span style={{ whiteSpace: 'nowrap' }}>31&nbsp;July&nbsp;2025</span>.
          By accessing the ZeroUnbound web application (<strong>“App”</strong>)
          or interacting with the associated ZeroContract V4 smart‑contract
          (<strong>“Contract”</strong>) you (<strong>“User”</strong>)
          agree to these legally&nbsp;binding Terms.
          <strong>&nbsp;USE AT YOUR OWN RISK — NO REFUNDS.</strong>
        </p>

        {/* ───────────────────────────────────── 0 • CORE DISCLAIMER */}
        <PixelHeading as="h2">0 • Irreversibility &amp; No Refunds</PixelHeading>
        <p>
          All blockchain interactions are <strong>permanent, public, and immutable</strong>.
          Gas, storage, or royalty fees are <em>never</em> refundable.
          Neither the App nor its maintainers can roll‑back or reverse on‑chain operations.
        </p>

        {/* ───────────────────────────────────── 1 • ELIGIBILITY  */}
        <PixelHeading as="h2">1 • Eligibility&nbsp;&amp;&nbsp;User Duties</PixelHeading>
        <ul>
          <li>You must be <strong>18&nbsp;years or older</strong> and legally competent where you reside.</li>
          <li>You are wholly responsible for the <em>legality, originality, morality</em> of any on‑chain data you create.</li>
          <li>
            <strong>Prohibited content:</strong> CSAM, extreme violence, hateful or extremist propaganda, doxxing,
            malware, or anything illegal in the United States, the EEA, or your jurisdiction.
          </li>
          <li>You confirm you are <strong>not</strong> on any U.S.&nbsp;OFAC sanctions list and not located in a restricted jurisdiction.</li>
          <li>
            On‑chain JSON or SVG <em>must not</em> embed
            <strong>&nbsp;unprintable control characters&nbsp;(C0/C1 ranges)</strong>.
            Such bytes can break marketplace parsers and will be flagged as “partially on‑chain”.
          </li>
          <li>
            You <em>indemnify</em> and hold harmless platform maintainers, contributors, &amp; Contract authors
            from any claim, damage, or cost arising out of your use.
          </li>
        </ul>

        {/* ───────────────────────────────────── 2 • IP / DMCA */}
        <PixelHeading as="h2">2 • Intellectual‑Property&nbsp;&amp;&nbsp;DMCA</PixelHeading>
        <p>
          Mint only works you own or hold <em>transferable, enforceable</em> rights to.
          Copyright owners may submit takedown notices to&nbsp;
          <a href="mailto:dmca@zerounbound.art">dmca@zerounbound.art</a>.
          We will delist infringing works from our web‑UI and GitHub mirrors in accordance with GitHub’s DMCA procedure.&nbsp;
          <strong>On‑chain data cannot be removed.</strong>
        </p>

        {/* ───────────────────────────────────── 3 • ENTRYPOINTS */}
        <PixelHeading as="h2">3 • Contract Entry‑Points (Non‑Exhaustive)</PixelHeading>
        <p>
          Calling the wrong entry‑point or supplying malformed data
          <strong>&nbsp;may permanently brick a token or collection</strong>. Review source code before use.
        </p>
        <ul>
          <li><strong>mint</strong> — create a new token/edition.</li>
          <li><strong>append_artifact_uri • append_extrauri</strong> — add ≤ 32 768 B hex slices per call.</li>
          <li><strong>clear_uri • lock • destroy</strong> — destructive, admin‑only actions.</li>
          <li><strong>add_* / remove_* </strong> — parent/child &amp; collaborator relationships.</li>
          <li><strong>transfer • update_operators • balance_of • burn</strong> — FA‑2 standard.</li>
        </ul>

        {/* ───────────────────────────────────── 4 • FEES */}
        <PixelHeading as="h2">4 • Fees, AML&nbsp;&amp;&nbsp;Taxes</PixelHeading>
        <ul>
          <li>Each operation incurs Tezos gas &amp; storage fees shown in‑wallet prior to signing.</li>
          <li>You agree not to use the App to facilitate money‑laundering, terror financing, or sanctions evasion.</li>
          <li>You are responsible for <strong>all</strong> tax reporting stemming from token creation, transfers, or sales.</li>
        </ul>

        {/* ───────────────────────────────────── 5 • WARRANTY */}
        <PixelHeading as="h2">5 • Warranty&nbsp;&amp;&nbsp;Liability Shield</PixelHeading>
        <p>
          THE APP, CONTRACT, AND ALL ASSOCIATED SERVICES ARE PROVIDED
          “<strong>AS IS</strong>” AND “<strong>AS AVAILABLE</strong>”
          WITHOUT ANY WARRANTY OF ANY KIND — EXPRESS, IMPLIED, OR STATUTORY –
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
          FITNESS, TITLE, OR NON‑INFRINGEMENT.
        </p>
        <p>
          TO THE <em>MAXIMUM EXTENT</em> PERMITTED BY TENNESSEE &amp; U.S.&nbsp;LAW,
          DEVELOPERS, CONTRIBUTORS, &amp; HOSTING PROVIDERS SHALL NOT BE LIABLE FOR
          <strong>&nbsp;ANY</strong> DIRECT, INDIRECT, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES,
          INCLUDING LOSS OF PROFITS OR DATA, EVEN IF ADVISED OF THE POSSIBILITY.
        </p>

        {/* ───────────────────────────────────── 6 • DISPUTES */}
        <PixelHeading as="h2">6 • Governing Law&nbsp;&amp;&nbsp;Dispute Resolution</PixelHeading>
        <p>
          These Terms are governed by the laws of the <strong>State of Tennessee, USA</strong>.
          Any dispute shall be resolved by <strong>binding, confidential arbitration</strong>
          seated in Tullahoma, Tennessee, on an individual basis; class‑action waivers apply.
        </p>

        {/* ───────────────────────────────────── 7 • BLACKLIST */}
        <PixelHeading as="h2">7 • Right to Blacklist &amp; Service Denial</PixelHeading>
        <p>
          We reserve the unconditional right to <strong>suspend, throttle, or blacklist</strong>
          any wallet address, IP range, or domain <em>for any reason or no reason</em> — including spam,
          abuse, excessive load, or suspected malicious activity — without prior notice.
          Delisted users’ on‑chain data remains accessible on Tezos via third‑party tools.
        </p>

        {/* ───────────────────────────────────── 8 • SPEECH */}
        <PixelHeading as="h2">8 • Freedom of Speech / Anti‑Discrimination</PixelHeading>
        <p>
          We value freedom of expression; however, hateful or discriminatory content targeting a protected class is
          prohibited. <strong>No content‑moderation decision shall be based on race, religion, gender, or political opinion</strong>,
          but purely on violation of Section&nbsp;1 or applicable law.
        </p>

        {/* ───────────────────────────────────── 9 • THIRD‑PARTY */}
        <PixelHeading as="h2">9 • No Liability for Third‑Party Links</PixelHeading>
        <p>
          The App may display links to third‑party websites or wallets.
          We do not endorse, audit, or assume responsibility for external content.
          Visiting external sites is at your own risk.
        </p>

        {/* ───────────────────────────────────── 10 • TERMINATION */}
        <PixelHeading as="h2">10 • Modifications&nbsp;&amp;&nbsp;Termination</PixelHeading>
        <p>
          We may update these Terms at any time. Continued use after changes constitutes acceptance.
          UI or API access may be suspended for Terms violations; on‑chain data, by design, remains immutable.
        </p>

        {/* ───────────────────────────────────── 11 • ACK */}
        <PixelHeading as="h2">11 • Acknowledgement of Risk</PixelHeading>
        <p>
          By using the App or Contract you acknowledge that
          <strong>&nbsp;smart‑contract interactions are inherently risky&nbsp;</strong>
          and you assume full responsibility for all outcomes, including permanent loss of tokens or value.
        </p>

        {/* ───────────────────────────────────── 12 • DATA‑INTEGRITY */}
        <PixelHeading as="h2">12 • Data Integrity &amp; “Fully On‑Chain” Claims</PixelHeading>
        <p>
          ZeroUnbound advertises a <strong>Fully‑On‑Chain&nbsp;(“FOC”)</strong> workflow
          where every byte that composes an asset is stored directly on Tezos.
          This status can be downgraded to <em>“Partially on‑chain”</em> if:
        </p>
        <ul>
          <li>Metadata embeds remote URIs (HTTP/S, IPFS, IPNS, Arweave, etc.).</li>
          <li>The payload contains unprintable control characters (ASCII C0/C1).</li>
          <li>External style‑sheets or scripts are referenced (<code>@import</code>, <code>&lt;script&gt;</code>).</li>
        </ul>
        <p>
          Our on‑chain validator emits a ⭐, ⛓️‍💥, or ❔ badge in the UI.
          The badge is <em>informational only</em>; Users remain responsible for auditing their payloads.
          We make <strong>no warranty</strong> that a third‑party marketplace will render the asset,
          even when classified as ⭐ Fully on‑chain.
        </p>

        {/* ───────────────────────────────────── 13 • STANDARDS‑COMPLIANCE */}
        <PixelHeading as="h2">13 • Standards Compliance (TZIP‑12/16/21 &amp; ZeroContract V4)</PixelHeading>
        <p>
          Users must structure metadata and storage fields in accordance with Tezos Improvement Proposals and ZeroContract V4 invariants:
        </p>
        <ul style={{ marginBottom: '.6rem' }}>
          <li><strong>TZIP‑12</strong> — <em>per‑token</em> keys <code>decimals</code> (“0” for NFTs), <code>name</code>, <code>symbol</code>.</li>
          <li><strong>TZIP‑16</strong> — <em>contract‑level</em> keys <code>name</code>, <code>description</code>, <code>version</code>, <code>license</code>,
              <code>authors</code>, optional <code>homepage</code>, and <code>interfaces</code>&nbsp;must list “TZIP‑012”.</li>
          <li><strong>TZIP‑21</strong> — adds rich media pointers <code>artifactUri</code>, <code>displayUri (unused in v4) </code>, <code>thumbnailUri (unused in v4) </code>.</li>
        </ul>
        <p>
          ZeroContract V4 additionally enforces:
        </p>
        <ul>
          <li><code>tezos-storage:content</code> header pointing to JSON at map key “contents”.</li>
          <li>Mandatory base‑64 <code>imageUri</code> for collections and <code>artifactUri</code> for tokens.</li>
          <li><code>license</code> dropdown (default “No License, All Rights Reserved”).</li>
          <li>Royalties JSON capped at 25 % aggregate.</li>
          <li>No IPFS/HTTP links inside on‑chain media blobs.</li>
        </ul>
        <p>
          Non‑compliance may result in UI warnings, badge downgrade, or black‑listing as described above.
          The Contract itself will still accept raw hexadecimal payloads; your compliance duty is contractual.
        </p>

        {/* ─────────────────────────────────────  CREDITS  */}
        <PixelHeading as="h2">Credits</PixelHeading>
        <ul>
          <li>Platform architect:&nbsp;<a href="https://x.com/jams2blues" target="_blank" rel="noreferrer">@jams2blues</a></li>
          <li>Contract author:&nbsp;<a href="https://x.com/jestemzero" target="_blank" rel="noreferrer">@JestemZero</a></li>
          <li>AI co‑pilot: OpenAI ChatGPT</li>
          <li>On‑chain data viewability powered by&nbsp;<a href="https://tzkt.io" target="_blank" rel="noreferrer">TzKT</a></li>
        </ul>

        {/* ─────────────────────────────────────  BACK  */}
        <PixelButton
          as="a"
          href="/"
          style={{ display: 'block', width: 220, margin: '1rem auto 0' }}
        >
          ← Back Home
        </PixelButton>
      </CRTFrame>
    </main>
  );
}

/* What changed & why:
   • Split former §12 → §12 Data‑Integrity and new §13 Standards‑Compliance.
   • Embedded concise TZIP‑12/16/21 + Zero V4 invariant list (no external link).
   • Updated date, copy‑polish, grammar; rev‑bumped to r960‑h17. */
/* EOF */
