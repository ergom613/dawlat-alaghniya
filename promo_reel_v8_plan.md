# promo_reel_v8

**File:** `/workspace/mrmood/monaco/promo_reel_v8.mp4`  
**Duration:** 40.00s · 1080×1920 · 30fps · H.264 + AAC · ~13.6 MB  
**Status:** ready for Mohammad to review. Not published. No site URL. End card is «تابعنا + / يتبع..» plus a tiny OSM credit with no link.

Filmed like the village video: a continuous moving camera recorded frame-by-frame from the live flat map at night (`https://dawlat-alaghniya.netlify.app/?vertical=1&record=1&level=1&demo=220`). Demo houses existed only in memory for the «محاكاة» beat; `data/residents.json` still has only بيت رقم 1 at level 1.

## Beats

0–3.2s hook: night aerial of Monaco + harbour, push-in, «دولة الأغنياء / وبيت فيها باسمك»  
3.2–7.4s follower widget «المتابعين 1», «كل واحد بيتابعنا = بيت باسمو», tag بيت رقم 1 + @اسمك  
7.4–21.4s same house grows on an orbit, L1 tent → L30 glass tower, flashes/whooshes, badges, action icons; yacht from L15  
21.4–24.8s simulation snap, badge «محاكاة», «هيك بتصير لما تمتلي», city full of temporary houses  
24.8–26.8s snap back, «بس هلق… فاضية», lone tower  
26.8–35.5s «كل ١٠٠ متابع / حي جديد», «وقف الفيديو ودوّر على بيتك», «كل يوم بننزّل كيف عم تكبر الدولة»  
35.5–40s «تابعنا وخود بيتك / يتبع..» then the no-URL end card

Voice is the series generator only. Music builds into L30 / the simulation, with SFX on every level-up. No AI names, no stadium promise (only the vague «حي جديد»).

## ASR

faster-whisper `small` on the VO-only mix and the final mux recovered the full script, including وقف الفيديو, هلق, فاضية, تابعنا, يتبع. Typography already covers the usual confusions: خيمة, اليخت بينفتح, مية/١٠٠.

## Nits

- Night grade leans a bit purple.
- The yacht is mostly off-frame at L15 (dashed line + clipped tag); it reads clearly on the left at L30.
- Gold typography has a soft halo.
- Last half-second of the end card fades the music out.
