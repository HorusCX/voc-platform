# Design System: VoC Platform Redesign (Alpha v2)
**Project ID:** 9241459148390646153

## 1. Visual Theme & Atmosphere
The design features a **Modern Glassmorphic Dark Aesthetic** that feels premium and focused. It uses a deep, dark background to create high contrast with translucent, glowing panels. The atmosphere is "Sleek," "High-Tech," and "Focused," prioritizing data clarity within a sophisticated visual container.

## 2. Color Palette & Roles
* **Deep Space Black (#0F1115):** The primary page background. Provides the canvas for glassmorphism.
* **Vibrant Electric Blue (#3C83F6):** Primary accent color. Used for interactive elements, primary buttons, and focus states.
* **Translucent White (rgba(255, 255, 255, 0.08)):** Surface color for cards and panels.
* **Pure White (#FFFFFF):** Primary text color for maximum readability against dark backgrounds.
* **Muted Slate Gray (#9CA3AF):** Secondary text for descriptions, timestamps, and metadata.

## 3. Typography Rules
* **Font Family:** Inter (Sans-serif) for its clean, modular feel.
* **Headings:** Bold and prominent, using generous letter-spacing to feel "airy" despite the dark theme.
* **Body:** Clean, legible sizes with increased line-height to prevent text from feeling cramped on dense cards.

## 4. Component Stylings
* **Buttons:**
    *   **Primary:** Solid Electric Blue with rounded corners (8px).
    *   **Ghost/Utility:** Translucent gray backgrounds (always visible) with sharp, white icons.
* **Cards/Containers:**
    *   **Glass Panels:** Subtly rounded corners (8px).
    *   **Borders:** 1px semi-transparent white border (rgba(255, 255, 255, 0.1)) to define edges against the black background.
    *   **Blur:** High background blur (`backdrop-filter: blur(12px)`) to create the glass effect.
* **Inputs/Forms:**
    *   Dark, semi-transparent backgrounds with subtle white borders.

## 5. Layout Principles
* **Spacing:** Strict flexbox alignment with consistent 16px to 24px gaps.
* **Margins:** Generous outer margins to ensure the content doesn't feel hugged by the viewport edges.
* **Alignment:** Left-aligned titles with right-aligned utility actions in headers.
