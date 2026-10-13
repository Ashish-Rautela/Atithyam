# Scraping notes — verified 13 Oct 2026

The page structures below were inspected in a real browser against *JW Marriott Mussoorie Walnut
Grove* and *Mussoorie Gateway*. Selectors drift, and these notes record what to check first when
an adapter reports `LAYOUT_CHANGED`.

## Google Maps
- Search URL `https://www.google.com/maps/search/<q>?hl=en` jumps straight to the place page when
  the result is unambiguous. Otherwise it shows a `div[role=feed]` of `a.hfpxzc` results.
- Place page: `h1` (skip "Sponsored"), `div.F7nice` gives "4.5\n(6,485)",
  `button[data-item-id="address"]` and `button[data-item-id^="phone"]` (aria-label),
  `a[data-item-id="authority"]` (website), star class in a span "5-star hotel".
- The place URL carries `!1s0x…:0x…` (feature id) and `!3d<lat>!4d<lng>`.
- Tabs: `button[role=tab][aria-label^="Overview|Prices|Reviews|About"]`.
- **Prices tab** lists OTA prices (Booking.com, Agoda, MakeMyTrip.com, Tripadvisor.in, Goibibo…)
  for Google's default dates. Parsed from the pane's text after "All options".
- Reviews: `div[data-review-id].jftiEf`. On hotels the rating is `.fzvQIb` ("5/5") and
  `.xRkPPb` is "2 months ago on Google". Hotel reviews can be syndicated
  ("on Tripadvisor", "on Trip.com"), and these are stored with `syndicatedFrom`.
  Text is in `.wiI7pd`, language in `.MyEned[lang]`, owner reply in `.CDe7pd`, and "More" is `button.w8nwRe`.
- The `button.FNe70d` labelled "Most relevant" is actually the **source filter** (All / Google /
  Tripadvisor / Trip.com / hotel site), not a sort.
- **Signed-out limit:** after about 5 reviews Google shows "Sign-in to get the best of Google Maps".
  The adapter does not sign in.

## Booking.com
- Search: `/searchresults.en-gb.html?ss=<q>` → `[data-testid=property-card]`, with `[data-testid=title]`,
  `a[data-testid=title-link]` and `[data-testid=review-score]` ("Scored 8.8 | Fabulous | 167 reviews").
- The search page may redirect through a JS check (`chal_t=` in the URL). A real browser passes it.
- Hotel page: JSON-LD `@type: Hotel` (name, address, aggregateRating out of 10),
  `[data-atlas-latlng]`, `[data-testid=rating-stars]` (children = stars),
  `[data-testid=review-subscore]` ("Location, 9.1, …"), facilities wrapper `li`, and
  `[data-testid=featuredreview]` (no rating or date).
- `reviewlist.html?pagename=…&cc1=…` now returns **404**. The full review list comes from
  **Agoda's review API with providerId 3038** (Booking.com reviews of the same property).

## Agoda
- From any agoda.com page (same-origin fetch):
  - `GET /api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/en-us/?searchText=…` → `ViewModelList[]`,
    where hotels have `IsHotel: true` and `ObjectId` is the hotel id.
  - `POST /api/cronos/property/review/HotelReviews` → `combinedReview.score` (score, reviewCount),
    `grades[]` (category scores) and `providers[]`.
  - `POST /api/cronos/property/review/ReviewComments` → `comments[]` with `hotelReviewId`, `rating` (/10),
    `reviewTitle`, `reviewComments`, `reviewPositives`, `reviewNegatives`, `reviewDate` (ISO),
    `checkInDateMonthAndYear` and `reviewerInfo` (country, group, room).
    Body: `{hotelId, pageNo, pageSize, sorting: 1 (most recent), providerIds: [332 | 3038], …}`.
- Sort options: 1 most recent, 2 high→low, 3 low→high, 7 most helpful.

## MakeMyTrip
- Home `/hotels/` shows a login modal (close it) and a search box (`label[for=city]`). Typing
  "<name> <town>" and searching leads to
  `/hotels/hotel-listing/?city=CTXMS&searchText=…` (Mussoorie = `CTXMS`).
- Listing cards: `[data-testid=hotel-card-shell]`, `#hlistpg_hotel_name`, `#hlistpg_hotel_user_rating`,
  `#hlistpg_hotel_shown_price`. Clicking calls `window.open('/hotels/hotel-details/?…&hotelId=…&lat=…&lng=…')`,
  and the adapter captures that URL instead of opening tabs.
- The listing page has price-bucket filters (₹0–1500, 1500–3000, 3000–5000, 5000–9000,
  9000–16000, 16000+). These are useful for step 2's price-tier comparisons.
- Detail page: `h1`, `[data-testid=location-address]`, `[data-testid^=amenity-item]`, `#userReviewsSection`
  (overall rating, "3653 Ratings", distribution %, *Rating Categories*, Myra.AI summary), review items
  `.userRvs__item` (`.userRvs__rtng`, header `p`, `.userRvs__rvdtlPoints` = name and traveller type,
  `.reviewText`, "Travel Month:", "Room:"), and pagination `#detpg_review_ratings_pagination a`.
- No review ids and no posting dates.

## Tripadvisor (tripadvisor.in)
- Uses DataDome bot protection. A normal visible browser passed in testing, but expect `BLOCKED` at times.
- Search `/Search?q=<q>` → `a[href*="Hotel_Review"]`. Card text has "4.8 of 5 bubbles" and "(4,415 reviews)".
- Hotel page JSON-LD `LodgingBusiness`: name, priceRange ("₹₹"), telephone, aggregateRating, address, geo, amenityFeatures.
- Reviews: `[data-test-target=HR_CC_CARD]`, title link `[data-test-target=review-title] a`
  (`-r<reviewId>-`), text `.JguWG`, rating `svg title` "5.0 of 5 bubbles", "wrote a review <date>",
  "Date of stay:", "Trip type:", and next page `a[aria-label="Next page"]` (`-or10-`, `-or20-`…).

## Step 2 additions (verified 13 Oct 2026, Dehradun)
- Nearby search: `https://www.google.com/maps/search/hotels/@<lat>,<lng>,<zoom>z?hl=en` gives a result list
  (`div[role=feed]`) of `a.hfpxzc` cards inside `[role=article]`, with `span.MW4etd` (rating), `span.UY7F9`
  ("(1,089)"), a line "2-star hotel" or a type ("Hotel"), the price in `.wcldff` ("₹2,048") and
  "₹8,850/night on 15 Oct - 16". Sponsored cards carry `[aria-label=Sponsored]` and may be far away.
- The list ignores `scrollTop` changes; it loads more only on real mouse-wheel scrolling. Signed-out, it stops
  after ~8 results with "You're seeing a limited view of Google Maps".
- Prices tab links are `google.com/travel/lodging/clk?...&pcurl=<destination>`. The destination is readable without
  following the redirect:
  - MakeMyTrip: `/hotels/hotel-listing/?topHtlId=<hotelId>&city=CTDED…`
  - Agoda: `/partners/partnersearch.aspx?…&hid=<hotelId>`
  - EaseMyTrip, Wego and Bluepillow also appear; they are not used.
- MakeMyTrip's home search box: typed text was ignored in a real run (the date picker opened instead), so the
  UI search was removed in favour of Google's price links.
- Tripadvisor returned a DataDome CAPTCHA page in a real Playwright run (`geo.captcha-delivery.com`).
  This is reported as BLOCKED and is not bypassed.

## Step 3 — towns and city seeding
- Searching a town name (`/maps/search/Mussoorie?hl=en`) jumps to its place page:
  `/maps/place/Mussoorie,+Uttarakhand/@30.4547233,78.0764401,14z/data=…!3d30.4547465!4d78.081985…`.
  The path gives the name and region, `!3d/!4d` the pin, and `14z` the zoom Google frames the town at.
  The seeding radius is derived from that zoom (14z at this latitude ≈ 3.7 km).
- An ambiguous name shows a result list. The first result is used, so check the region on the
  Seeding page. To pin a town, give an explicit radius or a more specific name ("Chakrata, Uttarakhand").
- City seeding searches each ~1.5 km tile once per lodging query (map zoom 15, no extra offsets). The
  4-point offset grid is only used when searching around a single hotel.
