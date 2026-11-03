# Screen Design: Onboarding

**Date**: 2026-11-03
**Status**: approved
**Designer**: Claude (main agent)
**Critic**: design-critic agent
**Verdict**: PASSED (round 2)
**AI Assets**: none generated. Uses the 4 existing photos in `app/assets/onboarding/`.

**Spec**: `.planning/specs/onboarding.md`
**Tokens**: `app/src/theme/tokens.ts`. There is no `.planning/design-config.md`; the tokens file and Notion "Brand & Design" are the source.
**Prototype**: `.planning/design/screens/onboarding/prototype.html`. Run the `design-prototypes` server in `.claude/launch.json`, then open `/.planning/design/screens/onboarding/prototype.html`. Add `?size=0..3&page=0..3&big=1&failed=1` to open a state directly.

Phone only: orientation is locked to portrait, so the 768 and 1440 breakpoints don't apply. The sizes checked are 375×667, 360×800, 390×844 and 430×932.

---

## Screen Inventory

| # | Screen | Photo | Primary | Secondary | States |
|---|---|---|---|---|---|
| 1 | Welcome | `welcome.webp` | Next | Skip | default, large text, photo failed |
| 2 | Scan | `scan.webp` | Next | Skip | same |
| 3 | Reminders | `reminders.webp` | Next | Skip | same |
| 4 | Ready | `ready.webp` | Scan a plant (camera icon) | Look around first | same |

No loading, empty or success state: photos are bundled and nothing is fetched. Leaving the flow is the success state.

## Wireframe

All 4 share one layout. Only screen 1 has the logo.

```
+----------------------------------+
| status bar over top scrim        |
| rebloom            (screen 1)    |
|                                  |
|         PHOTO, full bleed        |
|      subject in the upper part   |
|                                  |
| ......... fade, 96pt ........... |
| Title, 28/32 Bricolage 700       |  slides
| Body, 16/22 Figtree 400          |  with photo
|----------------------------------|
| ▬ • • •                          |  fixed
| [            Next              ] |  fixed, 56pt
|              Skip                |  fixed, 44pt
+----------------------------------+
```

## Layout Details

**Layers, back to front**
1. `cameraColors.ground` page background.
2. Photo with cover sizing, moved up by a per-photo focus: welcome 0.24, scan 0.21, reminders 0.20, ready 0.10, as a fraction of photo height. The photos' subjects sit low (the seedling is at 53–70% of the frame), so without this the text would cover them.
3. A 200pt gradient to solid `ground` on the photo's lower edge, so the upward shift leaves no seam.
4. Top scrim: `cameraColors.overlay` through the status-bar inset, fading out over 48pt. `scan.webp` and `reminders.webp` have bright windows at the top, and the light status icons need it.
5. Text panel, anchored to its content: a 96pt fade from 0 to `photoScrim`, then `photoScrim` behind the text and down to the bottom edge.
6. Fixed chrome: dots, primary, secondary.

**Why the panel is anchored to its content.** A scrim sized as a percentage of the screen breaks when text grows. Here the text always sits on the full-strength scrim, at any size.

**Token to add** (not in the code yet), next to `scrim` in `tokens.ts`:

```ts
// Behind text on onboarding photos. 5.4:1 for cameraColors.text, even over pure white.
export const photoScrim = 'rgba(15,20,15,0.66)';
```

The existing `scrim` (0.55) and `cameraColors.overlay` (0.6) are too weak: 0.61 is the minimum measured on these photos.

**Tokens used**
| Element | Token |
|---|---|
| Title | `type.title`, `cameraColors.text` |
| Body | `type.body`, `cameraColors.text` |
| Primary button | `cameraColors.text` fill, `colors.text` label, `type.button`, `radius.sm`, 56pt |
| Secondary | `type.bodyStrong`, `cameraColors.text`, 44pt, 8pt below the primary |
| Active dot | 24×8, `cameraColors.text`, `radius.pill` |
| Inactive dot | 8×8, `cameraColors.caption` at 0.55 |
| Side padding | `spacing.xl` (24) |
| Top scrim | `cameraColors.overlay` |
| Panel | `photoScrim` |
| Gradients | `react-native-svg`, `stopColor` from `cameraColors.ground`, transparency through `stopOpacity`. No color literals. |
| Logo | Paths from `brand/kit/logo/rebloom-logo-bloom.svg` in a new `Logo` component, 104pt wide. Wordmark fill `colors.surface`, leaf fill `colors.reward`, passed as props, so the component has no hex. |

**Copy**, changed from the spec after seeing it rendered:
- Screen 2's body now ends "A few quick questions narrow it down." It's simpler, and "look-alike" broke across lines.
- Screen 3's title is now "A check-in on day 7." "We check back on day 7" left "7" alone on a line at 360pt.

**Changes from the spec's layout**
- Skip moved from the top right to under the primary button. It's easier to reach, it stays in one place across all 4 screens, and "Look around first" takes the same slot on screen 4. It also avoids a chip over the bright parts of the photos.
- The gradient to `ground` became the content-anchored `photoScrim` panel above.
- The Rebloom logo was added to screen 1, as on artboard 02.

## States

| State | What the user sees | Trigger |
|---|---|---|
| Default | Photo, text, actions | First launch |
| Last screen | Camera icon on the button, "Look around first" | Index 3 |
| Large text (200%) | Photo mostly under the panel; title capped at 1.5×, body at 2×, buttons at 1.3× | System setting |
| Short window | The text scrolls inside the panel; the actions stay fixed | Text taller than the room above the footer, for example split screen at large text |
| Photo failed | `ground` background, text and actions unchanged. Rare, and plain on purpose. | Decode error |
| Button pressed | Opacity 0.85, as in `Button` today | Touch down |
| Button focused | Platform focus indicator; on-dark variant must stay visible against `ground` | Hardware keyboard, Switch Control |
| Leaving | Goes to Today or `/scan`. All actions ignore further taps, with no visible change. | Skip, "Look around first", "Scan a plant" |

Buttons have no disabled look here: every action is always available until the user leaves.

**Recorded decision: text caps.** The title stops at 1.5× and buttons at 1.3×, which is below WCAG 1.4.4's 200% for those elements. Body text follows the system up to 2×. The title is already large text, and the caps are what keep every screen from clipping on a 375×667 phone.

## Motion Plan

| Element | Animation | Trigger | Duration | Easing |
|---|---|---|---|---|
| Page | Native paging scroll, follows the finger | Swipe or Next | platform default | platform default |
| Active dot | Width 8 to 24 and opacity | Index change | 200ms | ease-out |
| Button label | Instant swap | Index 2 to 3 | none | none |

Reduced motion: Next jumps with no scroll animation and the dot changes instantly. Reanimated isn't installed, so the dot uses the built-in `Animated` API, or changes instantly if that adds real code.

## Accessibility

- [x] Contrast: `cameraColors.text` on `photoScrim` gives at least 5.43:1 on any photo, computed against a pure white pixel, so no future photo can break it.
- [x] Primary label on `cameraColors.text` fill: `colors.text` is far above 4.5:1.
- [x] Touch targets: primary 56, secondary 44, measured in the prototype.
- [x] Focus order matches visual order: title, body, primary, secondary.
- [x] Photos and dots are hidden from screen readers. The logo has the label "Rebloom".
- [x] Off-screen pages are hidden from screen readers, or their text is reachable before its screen shows: `accessibilityElementsHidden` (iOS) and `importantForAccessibility="no-hide-descendants"` (Android) on every page but the current one.
- [x] Progress is announced with the screen's whole text: "Step 2 of 4. One leaf, one photo. Photograph the leaf…"
- [x] Not by color alone: the active dot differs in width too.
- [x] Reduced motion handled.
- [ ] Real VoiceOver and TalkBack pass: on the device checklist.

## Self-check

1. **Real app or AI template?** Real: photos carry it, with left-aligned text and no icons or feature cards.
2. **Hierarchy?** Photo, then title, then one bright button.
3. **Accent draws the eye to the CTA?** The light button is the brightest flat area. Lime appears only in the logo, as the brand rules say.
4. **Whitespace?** The top two-thirds is photo alone.
5. **Specific language?** Yes, though screens 2–4 are draft copy the user hasn't reviewed.
6. **Brand personality?** Dark and calm like the landing hero.
7. **All states?** Yes, in the table above.

## Open Issues

- Screen 3 promises a reminder that doesn't exist yet: a release blocker, recorded in the spec.
- Photo rendering, fade quality and text scaling need a real device: on the device checklist.
