# MAFoto 1.0.0 – Professionelle Foto-WebApp für iPhone

## Ausstattung
- Nur Fotografie: Einzelbild und Software-Langzeitbelichtung **1–300 Sekunden**, ohne Videoaufnahme/Mikrofon.
- Lichtspuren (hellstes Pixel), seidiges Wasser (gleitendes Mittel) und Nacht (Mittelung plus geringfügige Softwareaufhellung).
- Auflösung normal: Kamerastream-Auflösung, nicht künstlich mehr Pixel. Langzeitqualität: **Maximal = gesamte verfügbare Stream-Auflösung**, optional 2560/2048/1600 Pixel an der längsten Seite.
- JPEG (Qualitätswert 0,96) und PNG, durchgängig festes 16:9 (Hochformat 9:16), optionaler Digitalzoom, Live-Histogramm, Zebra, Drittelraster, Filter.
- Fotos privat in IndexedDB, Export per Dateien/iOS-Teilen, PWA offline-fähige App-Oberfläche.
- Mitgeliefert: original hochgeladenes MAFoto-Logo sowie reduzierte Ansicht für App-Symbol.

## GitHub Pages (kostenlos, HTTPS nötig)
1. ZIP entpacken und **alle enthaltenen Dateien** im Stammverzeichnis des gewünschten GitHub-Repositories hochladen.
2. Auf GitHub unter Settings → Pages → Deploy from a branch → `main` → `/(root)` aktivieren.
3. Den von GitHub erstellten HTTPS-Link in Safari öffnen und auf „Kamera starten“ tippen.
4. Optional: Safari → Teilen → „Zum Home-Bildschirm“.

Kamera kann nicht durch Öffnen einer lokalen `index.html` aus Dateien oder durch eine ZIP-Datei allein gestartet werden. Keine Serverkomponente und keine Konten erforderlich.

## Bildqualität und 5-Minuten-Aufnahmen
Diese WebApp hält **nicht** den Kameraverschluss 5 Minuten offen: sie kombiniert viele Frames des Kamera-Livebilds. Dadurch lassen sich Lichtspuren und Mittelungseffekte erzielen; ISO, Blende, echte Verschlusszeit, RAW/ProRAW und volle 48 MP sind nicht garantiert bzw. iOS Safari gibt sie typischerweise nicht frei. Normalbild- und Langzeitauflösung hängen vom ausgehandelten Kamerastream ab. Für das feste 16:9-Format werden bei einem 4:3-Kamerasensor Bildränder abgeschnitten. 300 s bei maximaler Streamauflösung können Akku/CPU/Browser-Grenzen belasten. Verwende ein Stativ, schalte die automatische Bildschirmsperre für solche Aufnahmen nötigenfalls aus und lasse Safari im Vordergrund. Ein Verlassen der App beendet aus technischen Gründen die Belichtungsreihe und versucht, das bisherige Ergebnis zu sichern.

Das Foto wird **nicht** automatisch in Apple Fotos geschrieben. Wichtige Bilder über Galerie → Teilen/In „Fotos“ manuell exportieren. Browser-Speicher kann gelöscht werden.

## Datenschutz / Limits
Keine Videoaufzeichnung, keine Mikrofonabfrage, kein Cloudserver, keine Tracker und keine externen Bibliotheken. Fotos bleiben im lokalen Browser-Speicher, bis ausdrücklich exportiert. HTTPS für Kamera und Service Worker erforderlich. Nicht auf einem physischen iPhone verifiziert; Test auf echtem iPhone zwingend nötig.

## Technische Tests
Siehe `TESTBERICHT.md` für automatisierte Funktionsprüfungen und bekannte Risiken.
