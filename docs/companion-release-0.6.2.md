# Companion 0.6.2: matching in-game race preview

The independent `DominatorNetwork.dll` now renders the same classic burgundy
race layout as the OBS source: Gentildonna header art, race conditions, compact
Uma/outfit/player identities, gate and colored F/P/L/E badges beside the
gap/speed, four dashboard icons, rank-box flashes, and progressive top-three
card brightness. Player names omit leading `@` characters.

The native preview reads compact mode, picked gates, indicator visibility and
animation duration from `obs-settings.json`. Its position, scale, opacity and
F8 visibility remain independent so positioning the in-game preview does not
move an OBS source. Long identities expand row height, and the whole field fits
the game viewport. Waiting frames retain the previous field size. Native font
rasterization can differ slightly from browser text.

Sample mode uses the same 18 exact Uma variants, sample players, track and
status timing as the browser's default preview. It remains display-only and
cannot enter tournament scoring. Card clipping and draw order prevent another
card's text from bleeding through while positions animate.

## Install

Close Umamusume before replacing the standalone DLL with the privately supplied
0.6.2 build, then reopen the game. Refreshing a browser or restarting only the
companion cannot update a DLL already loaded by the game. The installer preserves
existing preview/OBS settings and tournament data. Hachimi and horseACT binaries
and configuration are not modified.

There are no public binary downloads or CI package artifacts. Source remains
public; the organizer distributes the package privately.

## Verification

`PreviewTest.exe` renders through the Windows software Direct3D device into
off-screen textures. It creates no windows, sends no input and does not load
the game or plugin. It checks artwork, podium colors, long identities,
compact/full fields, waiting frames, 720p–4K fitting, animation retargets and
indicator expiry. PNGs support visual review of the native renderer without
desktop control. The Windows companion workflow runs this check alongside
telemetry, companion/bridge, OBS model and installer tests.
