# Backup mappa

Ez a mappa azért van a projektben, hogy a GitHub sync bekapcsolása után ide kerüljenek az automatikus időbélyeges mentések.

- Az oldal **nem engedi törölni** a backupokat.
- A backup fájlok a GitHub API-n keresztül jönnek létre, pl. `backup/2026-03-08_12-30-45.json`.
- Ha GitHub Pages alatt csak helyi módban használod az oldalt, akkor a mentés a böngésző `localStorage` tárhelyére kerül, és a backup mappába nem tud fájlt írni. Ehhez GitHub sync kell.

A mappában lévő fájlokat szükség esetén manuálisan tudod kezelni a repositoryban.
