# Design QA

## Comparison target

- Source visual truth: `/var/folders/_h/f99mj6yj10l2s22mjc2_zxdr0000gn/T/codex-clipboard-98b4e2b0-d22d-495b-85dd-cd9a6ce3c314.png`
- Browser-rendered implementation: the actual `NewNotesButton` component in the existing Brave window
- Viewport: Brave responsive emulation at 390 × 844 CSS pixels, dark theme
- State: three buffered notes, compact glass control visible above the feed

The implementation and source were inspected together during the same review pass. macOS locked before the browser capture could be exported as a local artifact, so this report records the observed comparison without claiming a saved implementation image.

## Full-view comparison evidence

The source shows a wide, bright orange control competing with the Notes and Replies tabs. The mobile implementation reduces it to a compact frosted capsule containing only the three overlapping avatars and up arrow. The feed stays visually dominant, and the control still reads as actionable.

## Focused region comparison evidence

At 390px wide, the revised control measured visually as a 44px-tall capsule with a small horizontal footprint. The avatar stack remains legible, the arrow is optically centered, the glass edge remains visible against the pure-black theme, and no visible `posted` text remains.

## Required fidelity surfaces

- Typography: the visible label is removed. The translated note-count label remains available to assistive technology.
- Spacing and layout: the 44px hit target is retained while the horizontal footprint is reduced substantially.
- Colors and tokens: the orange fill is replaced by the same shared background, tint, blur, highlight, border, and layered shadow treatment used by the bottom navigation.
- Image quality: the existing avatar component and its three-user overlap behavior are unchanged.
- Copy and content: only the visible `posted` text is removed. The avatars, arrow, note-count accessibility label, and click behavior remain.

## Findings

No actionable P0, P1, or P2 visual difference remains for the requested change.

## Interaction and accessibility checks

- The control remains a semantic button.
- The accessible label reports the buffered note count.
- The hit area is at least 44px tall.
- Keyboard focus styling and reduced-motion behavior are preserved.
- Press feedback uses a restrained `0.96` scale.

## Visual hierarchy review

- Sentence case is preserved across unchanged interface labels.
- No uppercase interface label was introduced.
- The compact control leaves clear separation around the tab content.
- The transition from tabs to feed content is less crowded than the source.

final result: passed
