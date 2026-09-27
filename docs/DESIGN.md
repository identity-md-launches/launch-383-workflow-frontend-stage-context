# Pawn: implemented design

## Overview

Pawn is a single-page interface for borrowers and lenders using NFT-collateralized ETH loans on Sepolia. The implemented direction is a quiet, editorial lending desk: warm paper backgrounds, deep green text, serif display type, and compact sans-serif controls. Borrowing, lending and withdrawal are numbered sections. Terms and collection risk take priority over decorative NFT imagery; no untrusted NFT metadata is loaded.

This document is in `docs/` because the assignment's authoritative path budget forbids writing a repository-root `DESIGN.md`. It describes the actual source, not a proposed redesign. The shared primitives are in `web/src/styles.css`; page patterns and `AddressLink` / `Amount` are in `web/src/App.tsx`.

## Colors

All main roles use CSS custom properties, in sRGB hex, at the start of `web/src/styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f4f3ec` | Page background |
| `--surface` | `#fffef9` | Inputs, cards, light button fill and inverse text |
| `--ink` | `#19352c` | Main text, active filter, withdrawal panel |
| `--muted` | `#52665c` | Secondary text and metadata |
| `--line` | `#d5dbd0` | Structural separators |
| `--control-border` | `#78887e` | Form and button boundaries |
| `--accent` | `#294d3b` | Primary button fill |
| `--accent-hover` | `#193a2b` | Primary hover fill |
| `--soft` | `#e9eddf` | Agreement explanation and neutral statuses |
| `--warning-bg`, `--warning-ink` | `#f6edd7`, `#654514` | Wrong chain, funded status, collection risk |
| `--error-bg`, `--error-ink` | `#fbece8`, `#952f26` | Errors and defaulted status |
| `--focus` | `#125bc2` | Focus on light surfaces; locally `var(--surface)` inside `.credit-panel` |

The withdrawal panel uses `#d5e3d5` for supporting inverse text. No dark theme, gradients, transparency-based text colors, or unused color ramps are implemented. States have text labels as well as colors.

Measured rendered pairs are in `evidence/contrast.json`. Main ink/canvas is 11.90:1, secondary text/canvas 5.53:1, secondary text/soft panel 5.17:1, collection warning/surface 8.61:1, and primary button text/fill 9.37:1. The 3 px focus ring measures 5.72:1 on the canvas, 6.30:1 on the form surface and 13.10:1 on the dark withdrawal panel. Disabled controls are visibly disabled and excluded from these active-control contrast claims.

## Typography

- **Display:** Georgia, Times New Roman, serif. Hero is `clamp(2.7rem, 4.4vw, 4rem)`, weight 400, line-height 1.07 and letter-spacing −0.05em; the second line is italic. Responsive overrides use 3rem, then 2.55rem below 23rem. The logo uses the same serif stack in bold.
- **Body and controls:** Arial, Helvetica, sans-serif, default 16 px, line-height 1.5. Paragraph variants use 1.55–1.7. Section headings are 1.6rem with line-height 1.2; the withdrawal heading is a 1.8rem serif. Loan headings are 1rem; empty-state headings 1.4rem.
- **Metadata:** generally 0.75rem; form labels 0.875rem; inputs remain 16 px on mobile. Small labels use weight 600/700; no thin text style is used. Numerals use `tabular-nums`.
- **Addresses:** Courier New, monospace, 0.75rem. Full addresses remain selectable, linked and allowed to wrap. Only the wallet button and transaction-link summary abbreviate long identifiers; full addresses/hashes remain available through the page/link.
- Headings use balanced wrapping, paragraphs use pretty wrapping, and the hero description has a 39ch measure. Dynamic monetary amounts wrap rather than truncate. There are no downloaded fonts; exact glyph appearance follows the system fallback stack.

## Layout

`.wrap` centers a maximum 1,240 px canvas with 40 px inline gutters. The header uses a flex row; the hero has a 1.35fr/1fr grid and 72 px gap. `.workspace` has a 360 px request column and a flexible loan column with 48 px gap. The form's principal and interest share two columns; loan terms use a two-column definition list. Spacing groups fields tightly and separates main sections with 24–48 px gaps. Cards use 18–30 px internal padding depending on size.

- At **65rem / 1,040 px**, gutters become 28 px, the request column 320 px, gaps 28–32 px, and secondary header navigation is hidden. The same anchors remain available in page content.
- At **48rem / 768 px**, gutters are 20 px; hero, workspace, fine print and withdrawal section stack. The wallet and network label stack in the header. Controls wrap and filter targets are at least 44 px high.
- Below **23rem / 368 px**, gutters are 16 px, card padding 18 px, approval controls stack and loan headers can wrap.

No fixed-height text cards, sticky bars, clipped addresses, horizontal carousels or custom scroll regions are used. The actual export was checked at 1,440, 768, 390 and 320 px, plus a 2× CSS zoom reflow and an RTL structural smoke test. Those smoke tests do not establish native browser zoom or translation support.

## Elevation & Depth

The interface is flat. Tonal backgrounds group the agreement and withdrawal sections. Thin borders separate cards and fields; the empty state has a dashed border. Review uses a 2 px border and stays in normal document flow. There are no shadows, modal overlays, background blurs or floating action bars. The skip link is the only positioned accessibility helper.

## Shapes

`--radius: 12px` is shared by panels and loan cards. Buttons are 7 px, inputs 6 px and status badges 4 px. A small circular status dot supplements text. Decoration uses a pawn glyph and text arrows; it requires no downloaded image or icon package.

## Components

| Pattern / source | Behavior |
| --- | --- |
| `AddressLink` / `App.tsx` | Full wrapping address, explorer URL from runtime config, new tab with `noreferrer` |
| `Amount` / `App.tsx` | Exact ETH formatting, tabular figures, smaller unit; no floating-point amount conversion |
| Native buttons / `styles.css` | Neutral, `.primary`, `.connect`, `.small-button`; hover, press, disabled and focus states |
| Request form / `App.tsx` | Visible labels and hints; ownership check, explicit approval, separate request; field-specific validation/focus |
| `.loan-card` | Semantic article and definition list; named status, collection warning, full terms, native party disclosure, role/time-dependent actions |
| `.filters` | Native pressed buttons; filters are explicitly scoped to the current paginated records |
| `.review-panel` | In-flow review with programmatic focus, amount, consequence, and confirmation; funding requires collection-risk acknowledgement |
| `.connection-panel` | Persistent polite transaction status, inline error alert, chain switch and refresh; hash explorer link after submission |
| `.credit-panel` | Separate credited ETH amount and withdraw action; inverse colors and matching light focus ring |

The skip link precedes navigation. Buttons and links retain native keyboard behavior. Focus indicators are 3 px with 4 px offset; forced-colors mode uses `Highlight`. Motion is limited to 120 ms button color/press transitions inside `prefers-reduced-motion: no-preference`, with press scale 0.96. No entrance animation, autoplay, or motion-only status exists.

## Do's and Don'ts

- Start additional sections with `.wrap`, semantic headings and existing surface/type tokens. Keep controls inset from mobile edges and allow values to wrap.
- Preserve full addresses, exact amounts, flat interest terminology and per-collection warnings. Never imply that deployment checks certify an NFT collection.
- Use the primary fill for the next step, neutral buttons for secondary actions, and labeled badges for status. Keep loading/error/empty feedback visible near the work.
- Keep contract action gates independent of visual enabled states; re-read and simulate before signing. A style change must not bypass them.
- Reuse system fonts and existing shapes. Do not add external metadata imagery, decorative finance charts, theme switches or overlays without a product need.

Guidance attribution: Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method adapted from Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. See [attribution](INTERFACE-ATTRIBUTION.md). Human screen-reader testing, native devices and other browser engines remain unverified.
