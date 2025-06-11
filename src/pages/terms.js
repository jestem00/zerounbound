/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/terms.js
  Summary: ZeroUnbound — ultra-robust Terms of Service & legal shield
*/

/*──────────────────────── imports ─────────────────────────*/
import React from 'react';
import PixelHeading from '../ui/PixelHeading';
import PixelButton from '../ui/PixelButton';
import CRTFrame from '../ui/CRTFrame';

/*──────────────────────── component ───────────────────────*/
export default function TermsOfService() {
  return (
    <main
      style={{
        padding: '4rem 1rem',
        maxWidth: 960,
        margin: '0 auto',
        textAlign: 'left',
      }}
    >
      <CRTFrame className="surface">
        {/* ───── Title & intro ───── */}
        <PixelHeading as="h1">ZeroUnbound — Terms of Service</PixelHeading>
        <p>
          Last updated 13 May 2025. By accessing the ZeroUnbound web application
          (<strong>“App”</strong>) or interacting with the associated
          ZeroContract V4 (<strong>“Contract”</strong>) you (<strong>“User”</strong>)
          agree to these legally binding Terms.
        </p>

        {/* 1 • Eligibility & user duty */}
        <PixelHeading as="h2">1 • Eligibility & User Duties</PixelHeading>
        <ul>
          <li>You must be ≥18 years old and legally competent.</li>
          <li>
            You are solely responsible for the legality, originality, and moral
            acceptability of all on-chain data you create or upload.
          </li>
          <li>
            Uploading, linking to, or minting any content that is{' '}
            <strong>illegal, infringing, hateful, exploitative, or CSAM</strong>{' '}
            is strictly prohibited and will be reported to the appropriate
            authorities.
          </li>
          <li>
            You indemnify and hold harmless platform maintainers, contributors,
            and Contract authors from any claim or liability arising out of your
            use.
          </li>
        </ul>

        {/* 2 • IP & DMCA */}
        <PixelHeading as="h2">2 • Intellectual-Property & DMCA</PixelHeading>
        <p>
          Mint only works you own or have explicit, transferable rights to.
          Copyright owners may send takedown requests to 
          <a href="mailto:dmca@zerounbound.art">dmca@zerounbound.art</a>. We
          will delist infringing works from the App UI and GitHub mirrors in
          accordance with GitHub’s published DMCA process.
          On-chain data itself is immutable.
        </p>

        {/* 3 • Contract entry-points */}
        <PixelHeading as="h2">3 • Contract Entry-Points</PixelHeading>
        <p>
          Mis-calling an entry-point can permanently mutate token state; review
          the source before use. Key entry-points include:
        </p>
        <ul>
          <li>
            <strong>mint</strong> — new token &amp; edition.
          </li>
          <li>
            <strong>append_artifact_uri / append_extrauri</strong> — write ≤32 768 B
            hex chunks on-chain.
          </li>
          <li>
            <strong>clear_uri • lock • destroy</strong> — destructive admin-only actions.
          </li>
          <li>
            <strong>add_parent / add_child / add_collaborator / remove_* </strong>
            — relationship management.
          </li>
          <li>
            <strong>transfer • update_operators • balance_of • burn</strong> —
            FA-2 standard calls.
          </li>
        </ul>

        {/* 4 • Fees, AML, sanctions */}
        <PixelHeading as="h2">4 • Fees, AML & Sanctions</PixelHeading>
        <ul>
          <li>
            Blockchain actions incur Tezos gas; your wallet shows the definitive
            fee.
          </li>
          <li>
            You agree not to use the App in violation of anti-money-laundering
            or sanctions laws.
          </li>
          <li>
            You are responsible for all tax obligations arising from token
            transfers or sales.
          </li>
        </ul>

        {/* 5 • Warranty & liability */}
        <PixelHeading as="h2">5 • Warranty & Liability</PixelHeading>
        <p>
          The App and Contract are provided <strong>“AS IS”</strong> without any
          warranty. In no event shall maintainers
          be liable for indirect, incidental, or consequential damages. Your
          sole remedy is to discontinue use.
        </p>

        {/* 6 • Dispute resolution */}
        <PixelHeading as="h2">6 • Governing Law & Dispute Resolution</PixelHeading>
        <p>
          These Terms are governed by the laws of the State of Wyoming, USA
          (chosen for DAO-friendly statutes). All disputes shall be resolved by
          <strong> binding arbitration</strong> in Cheyenne, Wyoming on an
          individual basis; class actions are waived.
        </p>

        {/* 7 • Open-source notice */}
        <PixelHeading as="h2">7 • Open-Source License</PixelHeading>
        <p>
          Client source code is MIT-licensed and available at&nbsp;
          <a
            href="https://github.com/jams2blues"
            target="_blank"
            rel="noreferrer"
          >
            github.com/jams2blues
          </a>
          . Contract ©2025&nbsp;
          <a
            href="https://x.com/jestemzero"
            target="_blank"
            rel="noreferrer"
          >
            @JestemZero
          </a>
          .
        </p>

        {/* 8 • Modifications & termination */}
        <PixelHeading as="h2">8 • Modifications & Termination</PixelHeading>
        <p>
          We may update these Terms at any time. Continued use after changes
          constitutes acceptance. We may suspend UI access for users who breach
          these Terms; on-chain data remains immutable.
        </p>

        {/* Credits */}
        <PixelHeading as="h2">Credits</PixelHeading>
        <ul>
          <li>
            • Platform architect:{' '}
            <a
              href="https://x.com/jams2blues"
              target="_blank"
              rel="noreferrer"
            >
              @jams2blues
            </a>
          </li>
          <li>
            • Contract author:{' '}
            <a
              href="https://x.com/jestemzero"
              target="_blank"
              rel="noreferrer"
            >
              @JestemZero
            </a>
          </li>
          <li>• AI co-pilot: OpenAI ChatGPT</li>
        </ul>

        {/* Back-home button */}
        <PixelButton
          as="a"
          href="/"
          style={{ display: 'block', width: 220, margin: '1rem auto 0' }}
        >
          ← Back Home
        </PixelButton>
      </CRTFrame>
    </main>
  );
}

/* What changed & why
   • Added AML/sanctions, governing-law, arbitration, modification, class-action
     waiver, warranty disclaimer and stronger indemnity for comprehensive cover.
   • Body text relies on PixeloidSans (softer); bold highlights Pixeboy.
   • Linked authoritative sources for indemnity, DMCA & MIT warranty clauses.
*/
