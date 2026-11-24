# The Christmas theme follows the season, and each device can override it

The Christmas theme is a colour overlay on top of light and dark mode, not a third mode. It turns on by itself from 1 December to 6 January. A switch next to the dark-mode toggle turns it on or off for that device, saved in `localStorage` under `cadence-festive`, like the dark-mode choice. It recolours the shared tokens only: evergreen and gold in light mode, midnight blue and gold in dark mode, a candy-cane stripe across the top of the page, and falling snow that is hidden under `prefers-reduced-motion`. `--destructive` stays red, so an error still reads as an error.

A script in the page head adds the class before first paint, so the theme does not flash in after hydration. The season rule is written once as source text: the head script inlines it, and `isFestiveThemeOn` runs it through `new Function`, so the tested rule and the shipped one are the same code. Embedding the typed function's `toString()` instead breaks under any transform of the function body; Stryker's instrumentation made the head script throw.

## Considered Options

- **A per-user setting saved on the server**: rejected for now, because it needs a migration for a seasonal decoration, and the dark-mode choice is already per device.
- **Switched on by a Platform Admin**: rejected, because the season gives the dates without anyone having to remember.
- **A red primary colour**: rejected, because red already means destructive and error.
- **Recolouring the hard-coded Tailwind palette classes, charts, Monaco and code highlighting**: left out; those keep their meanings (success, warning, error) and the theme is a prototype.
