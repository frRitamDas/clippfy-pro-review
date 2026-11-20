# Clippfy — Reviews (extracted)

The **reviews section only**, pulled out of the full clippfy.pro bundle and rebuilt as a
small, self-contained page. Everything else from the original site (landing hero, pricing,
app/dashboard, create flow, legal pages, editor engine) has been deleted.

## Files

```
index.html            the standalone reviews page
assets/reviews.css    all review styling, one file
assets/reviews.js     seamless marquee + live counters
img/pfp/p1..p11.jpg   locally bundled photo avatars
```

## Run it

```bash
npx serve .          # or: npm start
python3 -m http.server 8000
```

Then open the printed URL. It also works by opening `index.html` directly in a browser.

## What's in the section

- **Two counter-scrolling marquee rows** — 11 review cards total (6 on top, 5 reversed
  below), edge-faded so cards drift in and out instead of hard-cutting.
- **Each card**: 5 gold stars, quote mark, review text, avatar, handle, "Verified clipper"
  badge, and the amount that clipper earned.

## Notes on the extraction

The original bundle spread these rules across three stylesheets, with several later
"v4 / v5 / v6" override passes on top. `reviews.css` contains only the declarations that
actually **won** in that cascade — so it renders like the live site without carrying the
dead overrides along. It is ~6 KB instead of towing ~110 KB of unrelated CSS.

Two things worth knowing:

1. **The avatars are stock portraits.** The original pointed at `/img/pfp/p1..p11.jpg`,
   but those files were not part of this bundle. The initials have been replaced with
   locally bundled, square-cropped stock portraits selected for a U.S. urban creator feel.
   They are not verified photos or proof of nationality for the named clippers; replace
   them with customer-approved photos before presenting the testimonials as real.

2. **The review copy is placeholder marketing copy.** The original source flagged this
   itself: *"TESTIMONIALS (placeholder copy: replace with real reviews before launch)"*.
   The names, quotes and dollar amounts are invented. Swap them for real ones before you
   ship.

## Standalone vs original

Small deliberate changes, since it no longer sits inside the full page:

- The hero's `#reviews` anchor target is gone — this page *is* the reviews.
- Image-guard and profit-calculator/FAQ handlers from the original script were dropped,
  as they served sections that no longer exist.
