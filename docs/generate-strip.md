# Generate a Strip

The library plus expands into **From scratch** and **Generate**. Generate accepts 1 to 12 photos, arranges an editable draft, and never publishes automatically.

## Enable

Set `OPENAI_API_KEY` as a server secret on the `strip-app` Cloudflare Worker. For local development, put it in the ignored `.env` file and restart the development server. Never put the key in a `NEXT_PUBLIC` variable, browser input, screenshot, or committed file.

`OPENAI_STRIP_MODEL` optionally overrides the default `gpt-5.4-mini`. The model must support image inputs and strict JSON-schema output in the Responses API. Set API project spend limits before opening this feature to users.

## Data and limits

- Only authenticated, same-origin requests can generate.
- The browser prepares photos sequentially and removes EXIF metadata using canvas. The editable draft uses uncropped images up to 2000px. Only 768px JPEG previews go to OpenAI.
- The OpenAI request uses `store: false`. Provider retention policies still apply. The photo-selection screen explains the transfer before selection.
- The server allows 2 requests per minute and 20 per day per account, atomically using the existing rate-limit table. Attempts count even if the upstream fails. There is no automatic paid retry.
- Requests are bounded to 6 MiB and 12 photos. The upstream call times out after 60 seconds. Cancel aborts the browser request, but an upstream request already accepted may still incur cost.
- No prompt, photo, response body, or API key is logged. Photos stay in browser memory until normal draft autosave.

## Layout contract

Generated backgrounds use vivid accent hues from visible photo details, not muted average colors. A hue-preserving color pass raises weak saturation and brings washed-out or very dark colors into strong midtones. Neutral backgrounds borrow an accent already in the image-inspired plan; fully monochrome plans stay monochrome. Black or white text is chosen by contrast. This applies only when creating a generated Strip, never to the photos, existing drafts, or manual color choices.

The model chooses the order, full-width photos, colored blank writing spaces, photo stickers, pack sticker IDs, and overlay positions. Output may contain only catalog IDs and photo indices, never URLs or executable markup. The server and browser both validate it. Every selected photo must be used exactly once (the single-photo flow can repeat it). At least one image is full-width and one appears as a photo sticker. The model can place related photo stickers inside a colored space, across a block join, or in quiet negative space over a related full-width photo. It is instructed to avoid the main subjects in both underlying photos when bridging a join.

Photo stickers stay unrotated and completely visible. The model varies inset scale and alignment, and for six or more photos seeks three distinct treatments: off-center colored-paper insets, actual photos crossing a block seam, and smaller photos completely inside a related full-width image's quiet space. Main subjects take precedence over forcing an unsafe overlap. Seam photos can be decorated from either neighboring color block. Blank text uses the normal 18px editor size. The model chooses around two larger catalog stickers per photo, capped at 18. Pack stickers prioritize joins, with no more than two separated stickers per seam. Inside colored blocks, decorations must touch an inset-photo edge. Inside full-width photos, decorations are placed atomically in intentionally overlapping pairs in the model's chosen quiet area, never as single floating stickers. A geometry pass keeps unrelated stickers/groups apart and protects inset-photo centers. If a placement cannot fit, it omits decoration rather than covering another group, moving it over a subject, or leaving an orphan. It never removes a selected photo. Stickers stay anchored to their section or join as media loads or layout changes. Dragging a sticker detaches the anchor and uses the existing editor movement. Anchors, rotation and blank-space heights survive draft save, reload and publishing.

Without a key, Generate reports that it is not ready and offers starting from scratch. It does not pretend a fallback template was generated.

Border decoration is asymmetric: one sticker or a separated same-side duo. Opposite-side mirrored pairs are never used. If a second sticker cannot fit on that side, it can touch a nearby inset photo instead, or be omitted.

If the model proposes a redundant copy of a photo as an inset, the server discards that extra use before strict validation. Full-width uses take precedence; among duplicate insets, photo-on-photo takes precedence, otherwise the first placement is kept. This never substitutes a different photo, changes a chosen overlap position, or adds a paid retry. Missing photos and invalid geometry still fail validation.
