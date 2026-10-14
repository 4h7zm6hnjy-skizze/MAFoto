# MAFoto 1.0.0 – Prüfbericht
Stand: 14.10.2026

## Automatisiert geprüft

- JavaScript-Syntax: `app.js`, `imaging.js`, `sw.js` ohne Syntaxfehler.
- Die Oberfläche besitzt ausschließlich die Modi **FOTO** und **LANGZEIT**. Keine Videoaufnahme, keine Mikrofonfreigabe, kein `MediaRecorder`.
- Eine simulierte Browserkamera lieferte **1280 × 960 Pixel** als Kamerastream.
- Normales Foto hochkant: **540 × 960 Pixel**, exakt **9:16**.
- Normales Foto quer: **1280 × 720 Pixel**, exakt **16:9**.
- Software-Langzeitaufnahme (2 Sekunden) für **Lichtspuren**, **seidiges Wasser** und **Nacht**: alle drei Modi speicherten erfolgreich das Bild im festen 9:16-Hochformat.
- Maximalwert des Einstellfelds: **300 Sekunden = 05:00**; freie Auswahl in 1-Sekunden-Schritten.
- 300-Sekunden-Aufnahme im Test vorzeitig mit „Fertigstellen“ beendet: vorhandenes Zwischenbild gespeichert.
- Galerie und Bildvorschau aus simuliertem lokalem Speicher geladen.
- Browser-Simulation über Chromium/Playwright: **keine unbehandelten JavaScript-Ausnahmen** während der beschriebenen Tests.
- Hochgeladenes Logo in Startseite und App-Icons übernommen.
- Statische Prüfung: keine externen Bibliotheken oder Tracker in der App, keine Ziel-URLs zum Hochladen der Fotos.

## Nicht getestet / nicht garantiert

- Ein *ununterbrochener* 5-Minuten-Test auf einem echten iPhone mit iOS Safari.
- Kamera-Auswahl, Kameraauflösung, Wärmeentwicklung und Speichergrenzen auf dem realen iPhone.
- iOS-PWA-Installation, iOS-Safari-Berechtigungen, Wake Lock und das echte Teilen-Menü.
- Die systemweite Speicherung direkt in der Apple-Fotos-App: Der Benutzer muss über „Teilen“ exportieren.
- iPhone-ProRAW/RAW, echte mehrminütige Sensorbelichtung und DSLR-Bildqualität: stehen dieser WebApp technisch nicht zur Verfügung.
- Anwendungsverschlüsselung, Härtung des GitHub-Kontos oder ein vollständiges externes Security-Audit.

## Technische Erläuterung

Die Langzeitmodi kombinieren über 1–300 Sekunden Bilder des laufenden Kamerastreams zu *einem Foto*. Sie speichern keine Video-Dateien. Die einzelnen Sensor-Belichtungszeiten steuert iOS; die Software simuliert Langzeiteffekte. 16:9 wird durch Zuschneiden realisiert, wodurch Randbereiche und eventuell Pixel entfallen. Die Qualitätsoption „Maximal“ bedeutet maximal verfügbare **Browserstream-Auflösung**, nicht zwingend native Sensorauflösung. Lange Aufnahmen benötigen Stativ, aktiven Bildschirm und ausreichend freien Speicher. Bei App-Wechsel in den Hintergrund versucht die App die Aufnahme vorzeitig abzuschließen; beim abrupten Schließen kann das Ergebnis verloren gehen.

## Reproduzierbarer Test

`python tests/e2e_smoke.py`

Voraussetzungen: Python, Playwright für Python, ausführbares Chromium unter `/usr/bin/chromium`. Die Tests verwenden einen simulierten Kamerastream und Browser-Speicher und stellen **keinen** echten iPhone-Test dar.
