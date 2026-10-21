# Italian Next Gen — memoria di progetto (fonte unica)

> Questo file è la **fonte di verità condivisa** tra la chat di progetto su claude.ai e Claude Code / attività pianificate.
> Chiunque prenda una decisione o cambi qualcosa di strutturale aggiorna QUI la sezione giusta e il "Registro decisioni" in fondo.
> Ultimo riallineamento: 13 ottobre 2026.

## Cos'è
- Sito di news quotidiane sui giovani calciatori italiani (nati dal 2002 in poi), bilingue IT/EN: https://italiannextgen.it
- Proprietario: Marco. **Non è uno sviluppatore e non usa mai il terminale**: tutto deve funzionare da browser/telefono.
- Repo: github.com/Tiri6/ItalianNextGen (rinominato da tiri6.github.io il 24 set 2026). Hosting: GitHub Pages, dominio su Aruba.

## Regole editoriali (non negoziabili)
1. **Mai dati inventati o non verificati.** Notizie non confermate = "voce da verificare", senza toccare i file.
2. Solo **calcio maschile**. Niente altri sport, niente calcio femminile.
3. Pubblicare solo notizie uscite alla fonte **oggi o al massimo ieri**, con rotazione dei giocatori.
4. Sulle pagine pubbliche **nessun riferimento ad AI/agenti/pipeline**: si parla di "redazione" e "radar".
5. Nessuna chiusura forzata sul "2030" negli articoli; variare attacco, struttura e ritmo, evitare cliché.
6. Fonti: `data/sources.json` (approved / confirm / blocked). Mercato da fonti "confirm" non si auto-pubblica.
7. Valori di mercato solo da Transfermarkt con fonte citata; caps nazionali da Wikipedia.

## Architettura essenziale
- Astro (v7), articoli in `src/content/news/*.md` con frontmatter bilingue, corpo IT poi `<!--EN-->` poi EN; `publishedAt` scaglionato.
- Dati: `data/players.json` (watchlist ~113), `data/competitions.json`, `data/performances.json`, `data/ranking.json`, `data/sources.json`, `data/ads.json`, `data/analytics.json`, `data/support.json`.
- Pipeline in `pipeline/`: run (raccolta Google News) → validator → write (bozze via API Anthropic, Haiku) → digest (taccuino) → publish → scheduler (slot ogni 20 min, 9-21) → social (card 1080x1080).

## Workflow GitHub Actions
| Workflow | Quando | Cosa fa |
|---|---|---|
| Redazione del mattino (`collect.yml`) | 06:00 UTC + lancio da attività cloud 7:40 | raccolta, risultati, prestazioni, bozze, taccuino, commit |
| 📣 Pubblica articoli (`publish.yml`) | **manuale** (Marco da telefono) | pubblica bozze di qualità + scaglionamento |
| Deploy / Rebuild ogni 20 min | 7-19 UTC | build e deploy su Pages |
| 🧹 Rimuovi duplicati, ⚽ Prestazioni, 🌍 Ranking FIFA (il 2 del mese) | vari | manutenzione |
- La pubblicazione resta **manuale**: Marco ha rifiutato l'automatismo completo.
- Secret richiesto: `ANTHROPIC_API_KEY`.

## Attività pianificate su claude.ai (cloud)
- **Redazione del mattino (cloud)** — ogni giorno 7:40 Zurigo, modello Sonnet: lancia collect.yml, aggiorna trasferimenti ufficiali e risultati nazionali in players/competitions.json, report a Marco.
- **Controllo settimanale pipeline** — lunedì 8:47, solo lettura: articoli per giorno, fallimenti dei workflow, sito online vs repo.
- La vecchia attività legata a tiri6.github.io e GitHub Desktop è stata **eliminata** il 13 ott 2026.

## Stato attuale e in sospeso
- Sito a regime (~500 articoli). GA4 attivo; AdSense configurato (verificare approvazione).
- In corso: pubblicazione automatica Instagram via API Instagram di Meta con Instagram Login (senza Pagina Facebook). Make.com era l'alternativa, rimasta bloccata.
- Data dell'evento: la pubblicazione si blocca se la data dichiarata dalla pagina della fonte è più vecchia di 2 giorni (`writer.mjs` legge la data, `publish.mjs` applica il filtro). Se la pagina non dichiara la data, resta valido il filtro su feed oggi/ieri.
- Da verificare: "Zenica non si dimentica. Ma l'obiettivo 2030 parte adesso" (nessun segnale calcistico nel titolo, nessun giocatore seguito): tenuto online, decide Marco.
- Da fare: caps nazionali per i giocatori rimanenti; verificare albo d'oro competizioni minori (confidenza media).

## Come restare allineati (chat ↔ codice)
- **Chat di progetto**: all'inizio di una sessione leggere questo file (raw: https://raw.githubusercontent.com/Tiri6/ItalianNextGen/main/.claude/MEMORY.md). Le decisioni prese in chat vanno scritte qui, non solo nella memoria della chat.
- **Claude Code / attività cloud**: leggono questo file tramite `CLAUDE.md`; quando cambiano regole, architettura o workflow aggiornano questo file nello stesso commit.
- Mai lavorare su una copia locale vecchia: prima `git pull` (il sync del Mac in passato è rimasto indietro di settimane).

## Registro decisioni (più recenti in alto)
- 2026-10-21 — Blocco notizie con fonte più vecchia di 2 giorni (data dichiarata dalla pagina).
- 2026-10-21 — Filtro di ARGOMENTO nel validatore (`pipeline/agents/validator.mjs`): altri sport esclusi anche da fonti approvate (enduro, short-track, mountain bike, sci, federazione ciclistica…); senza giocatori seguiti serve un segnale calcistico (`isCalcioText`). `pulisci-fonti.mjs` sposta anche gli articoli di altro sport già pubblicati. Rimossi short-track, enduro e Italia U21 (quest'ultima: partita di due settimane fa, ripubblicata come nuova; la data di pubblicazione è quella del feed, non quella dell'evento → da risolvere, vedi "In sospeso").
- 2026-10-13 — Unica fonte di verità = questo file. Eliminata attività doppione; redazione del mattino passata a Sonnet; aggiunto controllo settimanale.
- 2026-10-06 — Solo notizie di oggi/ieri; solo calcio maschile.
- 2026-09-24 — Repo rinominato in ItalianNextGen; classificazione fonti approvata.
- 2026-08-17 — Niente "2030" forzato negli articoli; watchlist estesa alle giovanili.
