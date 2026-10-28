# Cockpit editoriale — guida di attivazione (una volta sola, circa 20 minuti, tutto da browser)

Cosa ottieni: una pagina privata, installabile sul telefono, dove ogni giorno vedi le candidate nell'ordine proposto dalla
redazione, decidi cosa va sul sito e cosa su Instagram, cambi l'ordine e premi **Salva e pubblica**.
Le scelte finiscono su GitHub (`data/editorial-decisions.json`) e la pipeline le rispetta.

Se per un giorno non decidi nulla, il sito funziona in automatico come prima. Mai nessun blocco.

## 1. Token GitHub per il cockpit (3 minuti)
1. GitHub → foto profilo → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Nome: `cockpit`. Scadenza: 1 anno (segna la data: da rinnovare prima, come già per `GH_PAT_SECRETS`).
3. **Repository access** → *Only select repositories* → `ItalianNextGen`.
4. **Permissions → Repository permissions**: `Contents` = *Read and write*, `Actions` = *Read and write*. Il resto lo lasci com'è.
5. **Generate token** e copia il valore (inizia con `github_pat_…`): lo vedi una volta sola.

## 2. Crea il Worker su Cloudflare (5 minuti)
1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → collega GitHub e scegli `Tiri6/ItalianNextGen`.
2. Nome progetto: `italian-next-gen-cockpit`. **Root directory**: `admin`. Lascia vuoto il comando di build; il comando di deploy è `npx wrangler deploy`.
3. **Deploy**. Alla fine hai un indirizzo del tipo `https://italian-next-gen-cockpit.<tuo-nome>.workers.dev`.

## 3. Metti il login davanti (5 minuti)
1. Nel Worker → **Settings** → **Domains & Routes** → riga `workers.dev` → **Enable Cloudflare Access**.
2. Si apre Zero Trust (piano Free, 0 €: può chiederti di scegliere un nome per il tuo "team"). Apri l'applicazione appena creata → **Policies** →
   regola **Allow** → *Include* → **Emails** → la tua email Google. Nessun altro deve poter entrare.
3. Annota due valori: **Application Audience (AUD) Tag** (nella scheda dell'applicazione) e il tuo **Team domain** (`qualcosa.cloudflareaccess.com`, in Zero Trust → Settings).

## 4. Dai al Worker i tre dati (3 minuti)
Worker → **Settings** → **Variables and Secrets** → aggiungi:

| Nome | Tipo | Valore |
|---|---|---|
| `GITHUB_TOKEN` | **Secret** | il token del punto 1 |
| `TEAM_DOMAIN` | Testo | `qualcosa.cloudflareaccess.com` |
| `POLICY_AUD` | Testo | l'AUD Tag del punto 3 |
| `ALLOWED_EMAIL` | Testo | la tua email Google |

**Deploy** per applicare. Il Worker rifiuta qualsiasi richiesta se manca uno di questi valori.

## 5. Provalo
Apri l'indirizzo dal telefono → accedi con la tua email (ti arriva un codice) → vedi le candidate.
Sul telefono: **Condividi → Aggiungi a schermata Home**: diventa un'app.

## Come si usa
- **Sito** / **Instagram**: due interruttori per ogni candidata (Instagram si attiva solo se va sul sito).
- **▲ ▼**: cambi l'ordine di uscita. Il primo esce subito, gli altri ogni 20 minuti (9-21).
- **Salva**: scrive le scelte su GitHub. **Salva e pubblica**: salva e lancia "📣 Pubblica articoli" da solo.
- **Per oggi torna all'automatico**: annulla il controllo manuale per la giornata.
- I post Instagram che scegli tu hanno la precedenza e seguono il tuo ordine; restano valide le distanze minime e il tetto giornaliero.
- Le avvertenze ⚠️ (doppione, già trattato oggi) sono suggerimenti: se sei d'accordo con la redazione lasci spento, altrimenti accendi tu.

## Sicurezza (in breve)
- Il token GitHub sta solo su Cloudflare, mai sul telefono.
- Il Worker controlla la firma del login Cloudflare Access, che sia la tua email e il suo "aud": senza, risponde 401.
- Cambi il token = nuovo valore in **Variables and Secrets**. Se il telefono viene perso, basta togliere la tua sessione da Zero Trust.
