# Design System Document: Clean Enterprise PMS

## 1. Overview & Creative North Star
**Creative North Star: "The Curated Canvas"**

The objective of this design system is to transform the functional density of a traditional Property Management System (PMS) into a high-end editorial experience. We are moving away from the "cluttered spreadsheet" aesthetic and toward a sophisticated digital workspace that feels both authoritative and breathable. 

By leveraging **intentional asymmetry**, **tonal layering**, and **expansive white space**, we create a UI that reduces cognitive load while maintaining high data density. The system breaks the "template" look by treating the interface as a series of stacked, premium materials—moving beyond rigid grids to a fluid, layered environment that prioritizes legibility and operational speed.

---

## 2. Colors
Our palette balances "Enterprise Productivity" with "Soft Hospitality." We use professional slates and cool grays for the foundation, punctuated by functional pastels derived from traditional reservation blocking.

### Tonal Hierarchy
- **Primary Foundation:** `primary` (#555f71) for core branding and `on_surface` (#2a3439) for high-contrast text.
- **The Pastel Logic:** Statuses use the `secondary_container` (Coral), `tertiary_container` (Mint), and custom variants of lavender and yellow. These are never used for text; they are "wash" colors for containers.

### The "No-Line" Rule
To achieve a premium, custom feel, **1px solid borders are prohibited for sectioning.** 
Structural boundaries must be defined through:
- **Background Shifts:** Placing a `surface_container_low` (#f0f4f7) sidebar against a `background` (#f7f9fb) main view.
- **Elevation Contrast:** A `surface_container_lowest` (#ffffff) card sitting on a `surface_container` (#e8eff3) canvas.

### The "Glass & Gradient" Rule
For floating overlays (modals, quick-view reservation details), use **Glassmorphism**:
- **Background:** `surface` with 80% opacity.
- **Blur:** `backdrop-filter: blur(12px)`.
- **CTAs:** Use subtle linear gradients from `primary` (#555f71) to `primary_dim` (#495365) to give buttons a weighted, tactile "soul."

---

## 3. Typography
We utilize **Plus Jakarta Sans** as our primary typeface to bridge the gap between technical precision and modern elegance.

| Scale | Font | Size | Weight | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Display-LG** | Plus Jakarta Sans | 3.5rem | 700 | Large room availability metrics |
| **Headline-MD** | Plus Jakarta Sans | 1.75rem | 600 | Page titles and section headers |
| **Title-SM** | Plus Jakarta Sans | 1.0rem | 600 | Card titles, Guest names |
| **Body-MD** | Plus Jakarta Sans | 0.875rem | 400 | Primary UI text, data tables |
| **Label-SM** | Plus Jakarta Sans | 0.6875rem | 700 | Status chips, timestamps |

**Editorial Contrast:** Use `Headline-MD` for section titles with generous bottom margins (24px+) to create an "Editorial Header" feel that guides the eye naturally through complex booking views.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering**—the physical stacking of surface tiers—rather than traditional structural lines.

- **The Layering Principle:** 
    1. Base: `background` (#f7f9fb)
    2. Side Navigation: `surface_container_low` (#f0f4f7)
    3. Content Cards: `surface_container_lowest` (#ffffff)
- **Ambient Shadows:** For floating elements, use a "Non-Shadow" approach. Use an extra-diffused 32px blur with 4% opacity, tinted with the `on_surface` color. This mimics natural light falling on fine paper.
- **The "Ghost Border" Fallback:** If a divider is required for accessibility (e.g., in high-density data tables), use the `outline_variant` (#a9b4b9) at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components

### Buttons & Interaction
- **Primary:** Gradient fill (`primary` to `primary_dim`), roundedness `md` (0.75rem). Soft internal glow on hover.
- **Secondary:** Transparent background with a `Ghost Border` (20% opacity `outline`).
- **Tertiary:** Text-only, using `label-md` uppercase for a professional, utilitarian look.

### The Reservation Grid (Modernized Spreadsheet)
- **Grid Structure:** Forbid the use of vertical grid lines. Use horizontal white space and the "No-Line" rule to separate rows.
- **Status Blocks:** Inspired by the spreadsheet blocks, use `md` (0.75rem) rounded corners. Each block should have a 2px vertical "Accent Bar" on the left side using the saturated version of the status color (e.g., `secondary` for coral blocks).

### Inputs & Fields
- **Container:** Use `surface_container_highest` (#d9e4ea) for the input background to distinguish from the white card surface.
- **States:** On focus, the border transitions to `primary` (#555f71) at 100% opacity, and the internal background shifts to `surface_container_lowest` (#ffffff).

### Navigation Sidebar
- **Style:** Distinct from the main canvas via `surface_container_low`. Active states should use a "Pill" shape with a `primary_container` background, rather than a simple color change of the text.

---

## 6. Do's and Don'ts

### Do:
- **Do** use `surface_container` variants to nest information (e.g., a guest's billing details inside a reservation card).
- **Do** allow for "Asymmetric Breathing Room." Not every column in a dashboard needs to be the same width; let the content dictate the rhythm.
- **Do** use `label-sm` for meta-data (e.g., Room No, Time of Check-in) to keep the UI clean.

### Don't:
- **Don't** use solid black (#000000) for text. Always use `on_surface` (#2a3439) for a softer, premium feel.
- **Don't** use traditional "Drop Shadows" with high opacity. They create "visual mud" in high-density PMS tools.
- **Don't** use dividers between list items. Use 8px-12px of vertical padding and the Spacing Scale to create separation.
- **Don't** use sharp corners. Everything must adhere to the `md` (12px) or `lg` (16px) roundedness scale to maintain the "Soft Enterprise" aesthetic.