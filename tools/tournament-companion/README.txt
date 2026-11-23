DOMINATOR TOURNAMENT COMPANION 0.6.6 — WINDOWS x64

For Steam Umamusume with a Hachimi build supporting plugin API v3 and
hachimi_register_present_callback. horseACT remains a separate prerequisite
for automatic race JSON capture. Neither dependency is bundled or modified.

INSTALL / UPDATE
1. Obtain Dominator-Tournament-0.6.6-win64.zip privately from the organizer.
   Extract it outside your game folder. Public installer downloads are withdrawn.
2. Close Umamusume and the existing Tournament Companion, if running.
3. Run Install.cmd. Paste Steam > Umamusume > Manage > Browse local files.
   The installer checks the package, copies only DominatorNetwork files and
   preserves existing obs-settings.json, game-preview.json and tournament data.
   It does not change Hachimi or horseACT DLLs/configuration.
4. Existing DominatorNetwork users need no Hachimi changes. On a first install,
   the owner must separately register "DominatorNetwork.dll" in Hachimi's
   load_libraries list, preserving all other entries. The installer never
   changes that list. A compatible Hachimi API v3 build is required.
5. Run DominatorNetwork/companion/Start Tournament Companion.exe or start the
   game. Open http://127.0.0.1:27840/ and follow TOURNAMENT-GUIDE.txt.

Only Windows x64 is supported. The package includes its Node.js runtime;
no separate Node installation is needed. Nothing is installed into OBS.

AUTO START AND PREVIEW
Hachimi loads this independent plugin, which starts the local companion.
The launcher also works without the game for tournament operations/demo views.
The companion remains running when the game closes and ends at sign-out.
It is not registered as a Windows service or startup task.
The optional in-game preview starts OFF. Enable it in the Broadcast scenes tab;
F8 toggles it while in game. It uses the OBS race layout and Gentildonna art,
including the same compact mode, picks, indicators and animation duration.
Its position/scale/opacity controls remain independent. Restart the game after
replacing DominatorNetwork.dll; refreshing the browser cannot update that DLL.
Rendering is native, so font rasterization can differ slightly from a browser.

OBS BROWSER SOURCES
Race: http://127.0.0.1:27840/overlay                 440 x 1080
Matchup: http://127.0.0.1:27840/matchup              1920 x 1080
Series score: http://127.0.0.1:27840/scoreboard      1920 x 1080
Add ?demo=1 for clearly labelled samples without a race. Demo data cannot
enter scoring. The original race overlay design is retained. It shows its
waiting frame while the game bridge is connected. For a sharper race source,
use /overlay?renderScale=2 at 880 x 2160 and scale to 50% in OBS.
The OBS eye button or broadcast Show overlay control hides the race source.
No recording or streaming is required to view an OBS preview.

DATA AND PERMISSIONS
Each PC has its own store at %LOCALAPPDATA%/DominatorTournament. Choose one
authoritative results operator; multiple PCs do not share live state. Other
operators can install this package for local testing or broadcast use.
Viewing the published roster and running local scoring need no GitHub token.
Publishing results requires repository Contents write permission, a token in
DOMINATOR_GITHUB_TOKEN before launch, and explicit approval in the desk.
No token or personal state is included. See the guide for the full workflow.

TROUBLESHOOTING
Desk unavailable: run the launcher. Live feed offline: confirm compatible
Hachimi loads DominatorNetwork.dll and inspect DominatorNetwork/dominator-obs.log.
The desk uses 127.0.0.1:27840; the game bridge uses 127.0.0.1:27845.
Refresh the browser and OBS source cache after an update.
To stop only this companion, use the PID recorded in
%LOCALAPPDATA%/DominatorTournament/companion-process.json. Verify the process
is this package's node.exe before ending it. Do not stop unrelated Node apps.
No automatic update, remote synchronization or bracket advancement is implied.

Source and build instructions:
https://github.com/Flyingsparks1130/ddt2/tree/main/tools/tournament-companion
Credits and dependency licenses are included. Character art belongs to Cygames.
