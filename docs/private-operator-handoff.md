# Private operator handoff

The organizer privately supplies the complete `Dominator-Tournament-0.6.0-win64.zip` and its checksum. The DLL alone is insufficient: the package also contains the companion launcher, Node runtime, web interface and artwork. Recipients need Windows x64, Steam Umamusume, compatible Hachimi API v3, and horseACT for automatic race JSON capture. Existing DominatorNetwork users need no Hachimi configuration changes.

Close the game and existing companion, extract outside the game folder and run `Install.cmd`. Launch `DominatorNetwork/companion/Start Tournament Companion.exe`, then open `http://127.0.0.1:27840/`. Import DDT2 under Teams & bracket and select the recipient's own Saved races folder. Follow `TOURNAMENT-GUIDE.txt` for review and local approval.

Version 0.6.0 can approve and export results without GitHub credentials. Direct publication still requires repository write access and a token; a private download does not grant publishing access. The proposed service with two private operator keys is not built yet. Once implemented, the organizer would additionally send each person their own configuration containing the service URL and a separate revocable operator key. GitHub credentials would remain on that service.

Public release binaries and CI package downloads are withdrawn. CI still builds and tests the package without uploading it. Source and earlier Git history remain public. Existing downloaded copies cannot be recalled. No private operator keys, credentials or personal tournament state belong in this repository or the shared ZIP.
