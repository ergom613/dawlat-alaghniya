# دولة الأغنياء — promo reel v3

- **File:** `/workspace/mrmood/monaco/promo_reel_v3.mp4`
- **Duration:** 30.00 s
- **Format:** 1080×1920, 30 fps, H.264 (High) + AAC 192 kb/s stereo, `+faststart`
- **Live site:** https://dawlat-alaghniya.netlify.app
- **QA frames:** `/workspace/mrmood/monaco/promo_reel_v3_frames/`

v3 keeps the Instagram-reference structure (empty land → roads → house #1 + counter → milestone boxes → fly-up to 10,000 → «تابعنا +») and tightens v2: clearer house-#1 sign, one milestone group at a time, a visible day→night beat, a counter that climbs to 10,000, and a CTA that leaves the night city on screen.

House #1 is labelled only «بيت رقم 1». No personal name appears.

---

## Shots and timings

| t (s) | Shot | Overlays |
|------:|------|----------|
| 0.00–2.20 | Wide orbit of empty Monaco. Roads hidden. | Caption: هاي أرض فاضية… |
| 2.20–4.60 | Roads fade in; camera pushes toward the harbour. | Caption: هون الشوارع، ورح نبني دولة الأغنياء |
| 4.60–6.80 | Fly down to the empty plot. | (same caption until 5.50) |
| 6.80–9.80 | Tent drops on the plot. Clear «بيت رقم 1» sign. | Counter = 1 / 10,000. Box: مستوى ١ — خيمة. Caption: كل متابع بياخد بيت باسمو |
| 9.80–12.20 | House levels up 1 → 15. | Caption: كل تعليق ولايك وشير بيطلّع بيتك |
| 12.20–13.60 | Pull back to harbour: L15 house + small boat/yacht and the dashed link. | Box: مستوى ١٥ — يخت. Caption: من خيمة… ليخت وناطحة سحاب |
| 13.60–16.00 | House grows 15 → 30 (glass skyscraper). | (same caption until 15.90) |
| 16.00–17.80 | Hold on the L30 tower, still day. | Box: مستوى ٣٠ — ناطحة سحاب (to 17.30). Caption: وبعد التلاتين: فنادق ومستشفيات |
| 17.80–20.50 | Day → sunset → night. Tower windows and street lamps light up. | Boxes from 17.30–19.80: بعد الـ٣٠، فندق، مستشفى، حلبة سباق (قريباً). Caption from 19.35: والليل بيضي المدينة |
| 20.50–26.20 | Fly up over the night city (10,000 instanced houses). | Counter eases 1 → 10,000. Caption: لحتى نوصل لعشرة آلاف بيت |
| 26.20–26.40 | Hold at 10,000. | Counter hold |
| 26.40–30.00 | Ease back toward house #1. Night city stays visible. | CTA: دولة الأغنياء / State of the Rich / تابعنا + / بيتك ممكن يكون رقم ٢ / dawlat-alaghniya.netlify.app |

A small «© OpenStreetMap contributors» credit sits bottom-left for the whole 30 s.

---

## Caption list (Syrian Arabic, white rounded pills)

1. 0.25–2.20  هاي أرض فاضية…
2. 2.30–5.50  هون الشوارع، ورح نبني دولة الأغنياء
3. 6.90–9.45  كل متابع بياخد بيت باسمو
4. 9.55–12.60 كل تعليق ولايك وشير بيطلّع بيتك
5. 12.80–15.90 من خيمة… ليخت وناطحة سحاب
6. 16.00–19.20 وبعد التلاتين: فنادق ومستشفيات
7. 19.35–21.50 والليل بيضي المدينة
8. 21.60–26.10 لحتى نوصل لعشرة آلاف بيت

Arabic text is shaped in Chrome with the Cairo variable font (RTL). Captions pop on with a short bounce and a generated pop sound.

---

## Voiceover script

Voice: Microsoft Edge TTS `ar-SY-LaithNeural` (Syrian male), rate +8%, pitch −4 Hz, loudness-normalized. No other TTS.

| t | File | Line |
|--:|------|------|
| 0.25 | p01.wav | هاي أرض فاضية. |
| 2.30 | p02.wav | هون الشوارع، ورح نبني دولة الأغنياء. |
| 6.90 | p03.wav | كل متابع بياخد بيت باسمو. |
| 9.55 | p05.wav | كل تعليق ولايك وشير بيطلّع بيتك لفل. |
| 12.80 | p06.wav | من خيمة، ليخت وناطحة سحاب. |
| 16.00 | p07.wav | وبعد التلاتين: فنادق ومستشفيات. |
| 19.35 | p08.wav | والليل بيضي المدينة. |
| 21.60 | p09.wav | ولحتى نوصل لعشرة آلاف بيت. |
| 26.40 | p10.wav | تابعنا، وبيتك ممكن يكون رقم اتنين. |

(p04 «هاد بيت رقم واحد» was recorded but left out of the mix; the on-map sign already says it.)

---

## Asset licences

| Asset | Source | Licence |
|-------|--------|---------|
| 3D map (land, sea, harbour, roads, parks, trees) | OpenStreetMap / Geofabrik Monaco extract | ODbL — © OpenStreetMap contributors. Credit on screen. |
| Houses, cars, yacht, lamps, day/night sky | Original procedural geometry in this project (`js/house.js`, `js/sky.js`, `js/crowd.js`) | Original, all rights with the project. No third-party 3D models. |
| Captions, boxes, counter, CTA | Rendered with Cairo (Google Fonts) in Chrome | SIL Open Font License |
| Voiceover | Edge TTS ar-SY-LaithNeural | Generated for this promo; not an ElevenLabs voice |
| Music bed (`_work/v3/sfx/music.wav`) | Original synthesis (numpy, 100 BPM C–G–Am–F pluck + pad + pulse) | Original, commercial-safe |
| Pop and whoosh (`_work/v3/sfx/pop.wav`, `pop2.wav`, `whoosh.wav`) | Original synthesis (numpy / short tonal ticks and a noise sweep) | Original, commercial-safe |
| Site footage | Headless Chrome capture of the local site at `http://127.0.0.1:8777/?promo=1&record=1&vertical=1` | Own project |

No NonCommercial (CC BY-NC etc.) assets. No stock music. The video never names an AI program.

---

## Build notes

- Promo camera, road reveal, and day/night beats live in `js/app.js` (`applyPromo`, `setRoadAmount`), used only with `?promo=1`.
- Recorder: `_work/v3/record.mjs`. Base picture: `_work/v3/promo_base.mp4`.
- Overlays + mux: `_work/v3/compose.mjs`.
- VO: `_work/v3/gen_vo.py`. Music/SFX: `_work/v3/gen_audio.py`.
