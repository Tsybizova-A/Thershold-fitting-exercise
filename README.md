# Threshold fitting exercise

A short browser exercise on why a bond dissociation energy cannot be read off a
collision-induced dissociation curve.

Built for the short course *MS and Ion Activation*, IMSC 2026, Lyon
(A. Tsybizova and J. Roithová).

## What it does

The exercise runs in five steps.

1. A real breakdown curve is shown and you are asked to estimate the bond
   dissociation energy from it.
2. Two ways of deciding where the rise begins are applied to the same points.
   They disagree by 2.2 eV.
3. The published value is revealed. It is far below every estimate, and below
   the lowest collision energy at which anything was measured.
4. Three sliders show what stands between the shape of the curve and the energy
   you were trying to read: the energy the ions already carry, the extra energy
   needed for the bond to break inside the instrument's time window, and the
   spread in the collision energy.
5. A short account of how the published value was actually obtained.

## The data

Threshold collision-induced dissociation of adenosylcobinamide and
methylcobinamide with xenon, extrapolated to zero collision-gas pressure,
digitised from the Supporting Information of

> Kobylianskii, I. J.; Widner, F. J.; Kräutler, B.; Chen, P.
> *J. Am. Chem. Soc.* **2013**, *135*, 13648. Figures S16 and S19.

Published thresholds: AdoCbi⁺ 1.80 ± 0.07 eV (41.5 kcal/mol), MeCbi⁺
1.93 ± 0.03 eV (44.6 kcal/mol).

`breakdown_curve_handout.pdf` prints the same points that `data.js` holds. The
paper sheet and the screen must show the same curve, so do not regenerate one
without the other.

## Running it

The app uses ES modules, so opening `index.html` from the filesystem will not
work. Serve it over HTTP:

    python -m http.server 8000

then open <http://localhost:8000>.

`node test.js` prints what each reading rule gives against the published value,
which is worth running after any change to `data.js` or `curve.js`.

## Files

| File | |
|---|---|
| `index.html` | the page, all copy, all styling |
| `app.js` | step logic and what each button does |
| `curve.js` | the threshold model and the two reading rules |
| `data.js` | the digitised curves |
| `plot.js` | the SVG plotting, no charting library |
| `test.js` | command-line check of the reading rules |
