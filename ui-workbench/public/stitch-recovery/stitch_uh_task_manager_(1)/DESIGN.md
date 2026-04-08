# Design System: Editorial Enterprise Framework

## 1. Overview & Creative North Star: 'The Curated Canvas'
This design system rejects the "mechanical spreadsheet" aesthetic common in enterprise software. Instead, it adopts the persona of **The Curated Canvas**—a high-end, editorial-inspired digital workspace that prioritizes focus, breathability, and intentionality. 

In this system, data is not "dumped" into a grid; it is presented. We utilize high-contrast typography scales and non-traditional asymmetrical layouts to guide the eye. By leveraging Electron’s native capabilities, we create a desktop experience that feels more like a premium publication than a database. The goal is to transform "task management" into a "curated workflow."

---

## 2. Colors & Surface Logic

### The "No-Line" Rule
The most critical constraint of this system: **prohibit the use of 1px solid borders for sectioning.** Boundaries must be defined solely through:
1.  **Background Shifts**: A `surface-container-low` section sitting on a `surface` background.
2.  **Elevation Contrast**: Subtle tonal transitions between stacked elements.
3.  **Vertical Whitespace**: Using the spacing scale to create distinct visual groupings.

### Surface Hierarchy & Nesting
We treat the UI as a series of physical layers—like stacked sheets of fine paper. Depth is achieved by "stacking" surface-container tiers from lowest to highest.
*   **Layer 0 (App Base):** `background` (#f5faff)
*   **Layer 1 (Navigation/Sidebars):** `surface-container` (#e4eff8)
*   **Layer 2 (Main Workspace):** `surface-container-low` (#ecf5fc)
*   **Layer 3 (Content Cards/Active Sheets):** `surface-container-lowest` (#ffffff)

### The "Glass & Gradient" Rule
To elevate the experience beyond "standard flat UI," use Glassmorphism for floating elements (modals, popovers, dropdowns).
*   **Overlay Token:** 80% opacity on `surface_container_lowest` + `12px backdrop-blur`.
*   **Signature Gradients:** For primary CTAs and hero-state accents, use a subtle linear gradient from `primary` (#555f71) to `primary_container` (#d9e3f9) at a 135-degree angle. This provides a professional polish that flat fills lack.

### Status-Based Pastels (The Wash Rule)
Pastel washes (Coral, Mint, Lavender, Yellow) are reserved for **container backgrounds only**. 
*   **Never use pastel colors for text.** Text must always maintain high legibility using `on-surface` (#23353f) or `on-primary-container` (#485264).
*   **Implementation:** Use a 20% opacity version of the status color as a "wash" behind status labels or categorized table rows.

---

## 3. Typography
We use a dual-font strategy to balance editorial authority with high-density functional readability.

| Category | Typeface | Usage |
| :--- | :--- | :--- |
| **Display & Headline** | **Manrope** | Authority and character. Used for large headers and page titles to establish the editorial feel. |
| **Title & Body** | **Pretendard** | High-performance readability for Korean/English enterprise data. |
| **Labels** | **Pretendard** | Small-scale utility text with increased tracking (0.02em). |

**Scale Highlights:**
*   **Display-LG (3.5rem):** For empty state hero text or high-level dashboard metrics.
*   **Headline-SM (1.5rem):** For section headers within the "Curated Canvas."
*   **Label-SM (0.6875rem):** For metadata, using `on_surface_variant` (#50616c).

---

## 4. Elevation & Depth

### Tonal Layering Principle
Depth is expressed through value, not lines. A `surface-container-lowest` card placed on a `surface-container-low` section creates a natural lift.

### Ambient Shadows
Shadows are used sparingly for floating objects (modals, tooltips).
*   **Diffusion:** Large blur values (24px - 40px).
*   **Opacity:** 4% - 8%.
*   **Color:** Use a tinted version of `on-surface` (#23353f) rather than pure black to mimic natural ambient light.

### The "Ghost Border" Fallback
If accessibility requirements demand a container boundary, use a **Ghost Border**:
*   **Stroke:** 1px
*   **Color:** `outline-variant` (#a2b4c1) at **15% opacity**.
*   **Rule:** Never use 100% opaque borders for interior sectioning.

---

## 5. Components

### Buttons
*   **Primary:** Subtle gradient (`primary` to `primary_container`). `xl` (1.5rem) rounded corners.
*   **Secondary:** `surface-container-high` fill with `on-surface` text. No border.
*   **Tertiary:** Transparent background; text-only with `primary` color.

### Cards & Lists
*   **The List Rule:** Forbid divider lines. Use `surface-container-low` for every even row or simple 16px-24px vertical padding shifts to separate items.
*   **Nesting:** Content cards should use `xl` (1.5rem) or `lg` (1rem) corner radii to feel "Soft Enterprise."

### Input Fields
*   **Fill:** `surface-container-highest` (#d3e5f2).
*   **State:** On focus, transition background to `surface-container-lowest` (#ffffff) and apply a subtle 4% ambient shadow. Do not use high-contrast blue focus rings; use a `primary_dim` (#495365) 2px bottom-accent only.

### Status Chips
*   **Style:** Pills with `full` (9999px) roundedness. 
*   **Coloring:** Use the Status Pastel Wash (e.g., Lavender wash for "In Progress") with `on-surface` text.

---

## 6. Do's and Don'ts

### Do
*   **DO** use whitespace as a functional tool to separate high-density data.
*   **DO** stack surface tiers (Background > Sidebar > Content Card) to create a sense of architecture.
*   **DO** use Pretendard for all numbers and technical data for maximum clarity.
*   **DO** apply `12px-16px` corner radii to maintain the "Soft Enterprise" aesthetic.

### Don't
*   **DON'T** use 1px solid borders to separate table columns or sidebar sections.
*   **DON'T** use pure blue or purple as primary branding; stick to the sophisticated Slate/Cool Gray palette (`primary` #555f71).
*   **DON'T** use status colors (Coral, Mint, etc.) for text. It fails accessibility and looks "cheap." 
*   **DON'T** clutter the "Curated Canvas" with unnecessary icons. Let the typography and spacing do the heavy lifting.