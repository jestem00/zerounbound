/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/_document.js
  Summary: restores full SEO / PWA meta-tags while keeping the
           Next-15-compatible `require('next/document')` workaround
           that prevents “render is not a function” crashes. */

import { Html, Head, Main, NextScript } from 'next/document';

/* Next 15 exports a namespace object when imported via ES modules.
   Requiring it returns the real class constructor we need. */
const { default: NextDocument } = require('next/document');

import {
  DESCRIPTION,
  SITE_URL,
  OG_IMAGE,
  OG_TITLE,
  THEME_COLOR,
} from '../config/deployTarget.js';

export default class ZUDocument extends NextDocument {
  /* styled-components SSR */
  static async getInitialProps(ctx) {
    const { ServerStyleSheet } = require('styled-components');
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp:
            (App) =>
              function StyledApp(props) {
                return sheet.collectStyles(<App {...props} />);
              },
        });

      const initialProps = await NextDocument.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <Html lang="en" data-theme="arcade-dark">
        <Head>
          {/* Progressive-Web-App */}
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content={THEME_COLOR} />
          <link rel="icon" href="/favicon.ico" sizes="48x48" />

          {/* Pre-load pixel fonts */}
          {[
            'PixeloidSans-mLxMm',
            'PixeloidSansBold-PKnYd',
            'PixeloidMono-d94EV',
          ].map((font) => (
            <link
              key={font}
              rel="preload"
              href={`/fonts/${font}.ttf`}
              as="font"
              type="font/ttf"
              crossOrigin="anonymous"
            />
          ))}

          {/* Open-Graph & Twitter Card */}
          <meta property="og:title"        content={OG_TITLE} />
          <meta property="og:description"  content={DESCRIPTION} />
          <meta property="og:url"          content={SITE_URL} />
          <meta property="og:image"        content={OG_IMAGE} />
          <meta name="twitter:card"        content="summary_large_image" />
          <meta name="twitter:title"       content={OG_TITLE} />
          <meta name="twitter:description" content={DESCRIPTION} />
          <meta name="twitter:image"       content={OG_IMAGE} />
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

/* What changed & why
   • Re-added all SEO/PWA meta-tags and font pre-loads that were lost
     in r474, satisfying marketing & invariant I20.
   • Retained `require('next/document').default` constructor fix to
     keep Next 15 SSR stable.
   • Styled-components ServerStyleSheet preserved for critical-CSS SSR. */
