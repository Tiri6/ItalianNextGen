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
- Pipeline in `pipeline/`: run (raccolta Google News) → validator → write (bozze via API Anthropic, Haiku) → digest (taccuino) → publish → scheduler (primo articolo subito, poi slot ogni 20 min, 9-21) → social (card 1080x1080).

## Workflow GitHub Actions
| Workflow | Quando | Cosa fa |
|---|---|---|
| Redazione del mattino (`collect.yml`) | 06:00 UTC + lancio da attività cloud 7:40 | raccolta, risultati, prestazioni, bozze, taccuino, commit |
| 📣 Pubblica articoli (`publish.yml`) | **manuale** (Marco da telefono) | pubblica bozze di qualità + scaglionamento |
| Deploy / Rebuild ogni 20 min | 7-19 UTC | build e deploy su Pages |
| 📸 Instagram (`instagram.yml`) | manuale in prova; con `IG_MODE=auto` dopo ogni deploy | anteprima/pubblicazione dei post su Instagram |
| 🧹 Rimuovi duplicati, ⚽ Prestazioni, 🌍 Ranking FIFA (il 2 del mese) | vari | manutenzione |
- La pubblicazione resta **manuale**: Marco ha rifiutato l'automatismo completo.
- Secret richiesto: `ANTHROPIC_API_KEY`.

## Attività pianificate su claude.ai (cloud)
- **Redazione del mattino (cloud)** — ogni giorno 7:40 Zurigo, modello Sonnet: lancia collect.yml, aggiorna trasferimenti ufficiali e risultati nazionali in players/competitions.json, report a Marco.
- **Controllo settimanale pipeline** — lunedì 8:47, solo lettura: articoli per giorno, fallimenti dei workflow, sito online vs repo.
- La vecchia attività legata a tiri6.github.io e GitHub Desktop è stata **eliminata** il 13 ott 2026.

## Stato attuale e in sospeso
- Sito a regime (~500 articoli). GA4 attivo; AdSense configurato (verificare approvazione).
- Instagram: costruito il 23 ott 2026 (`pipeline/instagram.mjs`, workflow `instagram.yml` e `instagram-token.yml`, regole in `data/instagram.json`, stato in `data/instagram-state.json`). API Instagram con Instagram Login, nessuna Pagina Facebook. Caption = testo italiano dell'articolo (max 2200 car., taglio a fine frase) + fonte + footer + hashtag; immagine = card `/social/<slug>.jpg`. **Settimana di prova (dal 24 ott)**: variabile `IG_MODE` NON impostata → nessun post automatico; Marco lancia a mano "📸 Instagram" (anteprima / pubblica). Dopo la prova: `IG_MODE=auto`. Da fare da Marco: segreti `IG_USER_ID`, `IG_ACCESS_TOKEN` (long-lived 60 gg); `GH_PAT_SECRETS` (token GitHub fine-grained, solo Secrets read/write su questo repo) inserito il 23 ott 2026 per il rinnovo automatico del token Instagram: **scade il 23 ottobre 2027**, da rigenerare prima (promemoria programmati per il 2 e il 16 ottobre 2027). Mai provato contro l'API reale: verificare al primo post. Make.com abbandonato.
- Data dell'evento: la pubblicazione si blocca se la data dichiarata dalla pagina della fonte è più vecchia di 2 giorni (`writer.mjs` legge la data, `publish.mjs` applica il filtro). Se la pagina non dichiara la data, resta valido il filtro su feed oggi/ieri.
- Da verificare: "Zenica non si dimentica. Ma l'obiettivo 2030 parte adesso" (nessun segnale calcistico nel titolo, nessun giocatore seguito): tenuto online, decide Marco.
- Da fare: caps nazionali per i giocatori rimanenti; verificare albo d'oro competizioni minori (confidenza media).

## Come restare allineati (chat ↔ codice)
- **Chat di progetto**: all'inizio di una sessione leggere questo file (raw: https://raw.githubusercontent.com/Tiri6/ItalianNextGen/main/.claude/MEMORY.md). Le decisioni prese in chat vanno scritte qui, non solo nella memoria della chat.
- **Claude Code / attività cloud**: leggono questo file tramite `CLAUDE.md`; quando cambiano regole, architettura o workflow aggiornano questo file nello stesso commit.
- Mai lavorare su una copia locale vecchia: prima `git pull` (il sync del Mac in passato è rimasto indietro di settimane).

## Registro decisioni (più recenti in alto)
- 2026-10-26 — Cover con più giocatori: la maglia ora è quella del club della MAGGIORANZA dei giocatori (a parità: club nel titolo, poi scelta fissa per articolo), non più un club a caso tra giocatori e titolo. Caso Camarda-Comotto-Cissé (Udinese-Milan): era uscita la maglia giallorossa del Catanzaro (Cissé in prestito) invece del Milan. Card rigenerata e articolo liberato nello stato Instagram (`data/instagram-state.json`) per ripubblicare il post dopo che Marco ha cancellato quello sbagliato.
- 2026-10-26 — Pubblicazione a mano lanciata prima delle 9 (es. 7:47): il sito restava vuoto fino alle 9:00 perché lo scheduler metteva tutto sugli slot da 9:00 in poi e il Deploy delle 7:47 li escludeva. Ora `scheduler.mjs` mette il PRIMO articolo della coda (il Taccuino, se c'è) a "adesso" (-1 min) e gli altri sugli slot ogni 20 min; `--no-immediate` per tornare al vecchio comportamento. Il Deploy che parte a fine "Pubblica articoli" lo rende subito visibile. Nota: i rebuild programmati (cron) di GitHub sono best-effort e possono saltare: da controllare in Actions che girino davvero ogni 20 min.
- 2026-10-26 — Su richiesta di Marco articolo scritto a mano su Camarda, Comotto e Cissé entrati nel finale di Udinese-Milan (0-2, risultato da dati sportivi; giudizio su voglia e personalità = osservazione di Marco). Già con `publishedAt` 26 ott 09:10, `sourceDate` fissata, cover pronta: esce da solo sul sito e, in quanto prestazione fresca, è il primo candidato Instagram della mattina.
- 2026-10-25 — Instagram: tetto TOTALE di 5 post al giorno (Taccuino ed editoriali inclusi, `maxPerDay: 5`). Gli articoli non usciti nella giornata di pubblicazione vengono scartati (niente recuperi il giorno dopo): contano solo quelli pubblicati sul sito in giornata.
- 2026-10-25 — Ordine di uscita: prima le PRESTAZIONI (partite del giorno prima), poi news, poi mercato. Sul sito lo applica `scheduler.mjs` (ordine degli slot dopo il Taccuino); su Instagram `instagram.mjs` prima delle 13:00 (`performanceOnlyUntilHour` in `data/instagram.json`) pubblica solo prestazioni, se ce ne sono.
- 2026-10-25 — Instagram: distanza minima tra post normali 150 → 90 min. Freschezza vera: `publish.mjs` salva `sourceDate` (data della fonte) nel frontmatter; `instagram.mjs` scarta i post normali con fonte più vecchia di `maxSourceAgeHours` (24, in `data/instagram.json`) e ordina per data della fonte, non per orario di pubblicazione sul sito. Caso Italia U15-Turkmenistan: notizia dell'esordio rilanciata dopo altre due partite; ora `social: false` sugli altri articoli sullo stesso esordio. Articoli precedenti senza `sourceDate` usano `publishedAt` (limite 30 h).
- 2026-10-25 — Aggiunto Mattia Zanotti (Lugano, difensore, 2003, estero) alla watchlist su richiesta di Marco; valore di mercato e caps da compilare con fonte.
- 2026-10-25 — Taccuino: ammesse solo notizie con `pubDate` entro 36 ore (`digest.mjs`). Il Taccuino del 25 ott riportava Monza-Torino 1-1 da un titolo del 23 ott (partita diversa da quella finita 3-2): pillola rimossa dalla pagina.
- 2026-10-24 — Query di ricerca sempre allineate al club attuale (`pipeline/queries.mjs`, usato da `run.mjs` a ogni raccolta): le query con un club diverso da quello in `players.json` vengono scartate e sostituite da nome completo e nome+club attuale (caso Koleosho; corretti Comuzzo, Fortini, Mascardi → Torino, Ahanor). Quando un giocatore cambia squadra basta aggiornare il campo `club`. Controllo a mano: `node pipeline/queries.mjs` (solo report), `--fix` riscrive il file.
- 2026-10-24 — Koleosho: query di ricerca corrette (era "Koleosho Burnley", ora "Koleosho Paris FC" + "Luca Koleosho"). Su richiesta di Marco inserita a mano la candidata `koleosho-lens-20261024` (gol nel recupero del 1° tempo a Lens, Lens-Paris FC 2-1 finale) con bozza scritta solo da fatti verificati (fonte Cronachedi + risultato da dati sportivi); esclusi dati di mercato/contratto e il dettaglio Under 21 perché non verificati. Esce col normale "Pubblica articoli".
- 2026-10-23 — Cover social illustrate (`pipeline/social-art.mjs` + `pipeline/social.mjs`, colori/stadi in `data/clubs.json`), regole approvate da Marco: Taccuino = lavagnetta con modulo a caso; Europei/Mondiali (parola nel titolo/sommario, non i tag competizione) = coppa stilizzata; Mercato = solo stadio; un solo calciatore = calciatore stilizzato + stadio; più giocatori/club = maglia (se più club ne sceglie uno a caso, fisso per articolo); club sconosciuto = cover classica. Solo da ora in poi (le card già esistenti restano com'erano; `--rigenera=ORE` rifà quelle recenti non ancora postate). Niente volti, niente stemmi. Per un club nuovo aggiungere colori e stadio in `data/clubs.json`.
- 2026-10-23 — Primo post Instagram reale riuscito (Taccuino del 23 ott). Per richiesta di Marco: le cover del Taccuino NON riportano nomi di giocatori (`social.mjs`; card dei Taccuini rigenerate); il Taccuino non ha più pillole duplicate (`digest.mjs`: una sola pillola per giocatore, titoli simili scartati, regola nel prompt). Nota tecnica: `pipeline/state/` è in .gitignore, quindi lo stato Instagram sta in `data/instagram-state.json`.
- 2026-10-23 — Instagram: regola approvata da Marco = Taccuino + editoriali sempre, più al massimo 4 articoli al giorno (priorità performance > news > mercato, un giocatore al giorno, distanza minima 150 min, fascia 9-21). Prima settimana con approvazione manuale, poi automatico. `social: false` nel frontmatter esclude un articolo.
- 2026-10-21 — Blocco notizie con fonte più vecchia di 2 giorni (data dichiarata dalla pagina).
- 2026-10-21 — Filtro di ARGOMENTO nel validatore (`pipeline/agents/validator.mjs`): altri sport esclusi anche da fonti approvate (enduro, short-track, mountain bike, sci, federazione ciclistica…); senza giocatori seguiti serve un segnale calcistico (`isCalcioText`). `pulisci-fonti.mjs` sposta anche gli articoli di altro sport già pubblicati. Rimossi short-track, enduro e Italia U21 (quest'ultima: partita di due settimane fa, ripubblicata come nuova; la data di pubblicazione è quella del feed, non quella dell'evento → da risolvere, vedi "In sospeso").
- 2026-10-13 — Unica fonte di verità = questo file. Eliminata attività doppione; redazione del mattino passata a Sonnet; aggiunto controllo settimanale.
- 2026-10-06 — Solo notizie di oggi/ieri; solo calcio maschile.
- 2026-09-24 — Repo rinominato in ItalianNextGen; classificazione fonti approvata.
- 2026-08-17 — Niente "2030" forzato negli articoli; watchlist estesa alle giovanili.
