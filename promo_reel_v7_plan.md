# promo_reel_v7

**File:** `/workspace/mrmood/monaco/promo_reel_v7.mp4`  
**Duration:** 36.00s · 1080×1920 · 30fps · H.264 + AAC · ~14.2 MB  
**Status:** ready for Mohammad to review. Not published. No site URL anywhere. End card is «تابعنا + / يتبع..» plus a tiny OSM credit with no link.

## What changed vs v6

v6 was locked-off stills. v7 is filmed like the village video: a continuous `shot(t)` camera recorded frame-by-frame from the live map (`https://dawlat-alaghniya.netlify.app/?vertical=1&record=1`). Same hillside plot, same house transforming on camera, sea behind the house (SEA_AZ ≈ 2.35).

Camera language:
- 0–2.2s hook: high aerial push-in over the hillside and harbour (text «هاي بيتك» in the first second)
- 2.2–6.8s L1 tent orbit
- 6.8–9.6s L5 then L10, dolly-back orbit, white flash + whoosh on each level-up
- 9.6–15.2s L15 villa, then a pull-back that keeps the villa in frame and opens the marina; yacht appears below
- 15.2–18.0s L20 apartment
- 18.0–21.0s L25 crane-up
- 21.0–28.2s L30 wide orbit, yacht visible lower-left, dusk from 24s then night; music + riser climax
- 28.2–36.0s end card, no URL

## Voice (series generator only)

Energetic Syrian narrator, tight cuts, placed on the picture cuts. No ElevenLabs, no Edge TTS, no atempo.

| t     | line |
|-------|------|
| 0.12  | هاي بيتك |
| 1.05  | بيت رقم واحد |
| 2.55  | بيبلّش خيمة |
| 3.95  | كل فولو وتعليق ولايك وشير وهدية |
| 7.18  | بيطلّع بيتك لفل |
| 8.35  | من لفل واحد |
| 9.50  | للخمسة |
| 10.40 | للعشرة |
| 11.25 | وبلفل خمستعش |
| 12.75 | اليخت بينفتح |
| 15.25 | بعدين عشرين |
| 18.05 | وخمسة وعشرين |
| 21.05 | لفل تلاتين |
| 22.30 | ناطحة سحاب |
| 26.10 | تابعنا |
| 27.15 | يتبع |

ASR (faster-whisper `small`, Arabic) on the VO-only mix and on the final muxed soundtrack, both recover the full script. Confirmed clean: هاي بيتك، بيت رقم واحد، خيمة، كل فولو… وهدية، للخمسة، للعشرة، خمستعش، بعدين عشرين، وخمسة وعشرين، تلاتين، ناطحة سحاب، تابعنا، يتبع. Known confusions typography already covers: «لفل» sometimes heard as «فولو/الفول», and «اليخت بينفتح» as «اللي يخط بينفتاح». Waveforms of خيمة / اليخت / يتبع have full energy, no mumbled dropouts. Planned holds (after عشرين, after 25, and the L30 hold before تابعنا) are filled with the music bed, not silence. No speech gap over ~1s except those holds.

## Editing / sound

- Big outlined Cairo typography (IG-reference style), action icons under the tent
- White flash + whoosh on every level-up (6.80, 8.20, 9.60, 15.20, 18.00, 21.00) and a whoosh into the end card
- Pop on every caption
- Commercial-safe music bed, evened and boosted, building into L30; 6s riser from 18s, climax under «لفل تلاتين / ناطحة سحاب»
- Sidechain duck under the VO, limiter at 0.95
- House tag is only «بيت رقم 1» (never a personal name)

## Remaining nits

- The yacht is only a sliver at the first L30 frame (~21.3s) and sits clearly in the lower-left from ~23s through dusk.
- In-world «بيت رقم 1» tag slightly kisses the typography on the yacht line (~13.2s) and on «تابعنا» (~26.3s).
- The L1 badge lingers a beat into the L5 flash (~6.85s).
- «اليخت بينفتح» still benefits from the on-screen title.

Nothing in this file should be posted until Mohammad approves it.
