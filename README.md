# 3DPoliticalTest

Un questionario politico interattivo che posiziona l'utente su una sfera tridimensionale in base alle sue risposte. L'applicazione gira completamente sul browser e sfrutta [Three.js](https://threejs.org/) per visualizzare la sfera politica, mentre l'interfaccia è costruita con Tailwind CSS.

## Caratteristiche

- **Selezione della lingua guidata da bandiere** per iniziare il test nella lingua preferita (italiano, inglese, spagnolo, francese e tedesco).
- **Questionario adattivo** che calcola il punteggio su tre assi: economia, diritti civili e rapporto con l'establishment.
- **Visualizzazione 3D interattiva** della sfera politica con quadranti colorati e legende descrittive.
- **Tab di approfondimento** che permette di alternare tra la sfera e la rappresentazione cartesiana dei risultati.
- **Salvataggio locale delle recensioni** con protezione di base contro invii duplicati.

## Requisiti

Non è necessaria alcuna installazione server-side: basta un browser moderno con supporto ES modules. Tuttavia, per caricare i file JSON delle domande è necessario avviare un piccolo server statico (l'accesso diretto tramite `file://` viene bloccato dal browser).

## Avvio rapido

1. Clona il repository:
   ```bash
   git clone https://github.com/<tuo-account>/3DPoliticalTest.git
   cd 3DPoliticalTest
   ```
2. Avvia un semplice server HTTP (ad esempio con Python):
   ```bash
   python3 -m http.server 8000
   ```
3. Apri il browser su [http://localhost:8000](http://localhost:8000) e seleziona la lingua desiderata.

## Pubblicazione su GitHub Pages

1. Effettua il push del contenuto della cartella nel repository GitHub.
2. Vai in **Settings → Pages** del repository.
3. Nel riquadro **Build and deployment**:
   - imposta **Source** su **Deploy from a branch**;
   - scegli il branch principale (ad esempio `main`) nel menu **Branch**;
   - lascia `/(root)` come cartella e clicca su **Save**.
4. Attendi che GitHub completi il deploy: la pagina mostrerà il link pubblico appena pronto.
5. Visita l'URL per verificare che il questionario funzioni come in locale.
6. Se vuoi disattivare il sito in futuro, torna nella stessa pagina e imposta **Source** su **None**.

## Struttura del progetto

```
.
├── index.html          # entry point con import map e stile base
├── script.js           # logica dell'applicazione e rendering Three.js
├── lib/                # dipendenze locali di Three.js (OrbitControls, ecc.)
├── questions_*.json    # insiemi di domande per le diverse lingue
└── README.md           # questo documento
```

## Personalizzazione

- **Domande**: aggiungi o modifica i file `questions_<lang>.json` seguendo la struttura esistente (`title` e oggetto `weights` con le chiavi `economia`, `dirittocivilismo`, `establishment`). Le modifiche vengono caricate dinamicamente dal browser.
- **Nuove lingue**: aggiungi un file `questions_<codice>.json` e inserisci la nuova lingua nell'array `LANGUAGES` in `script.js`.
- **Aspetto grafico**: l'interfaccia usa Tailwind tramite CDN, per cui è possibile intervenire direttamente sui template in `script.js` o aggiungere CSS in `index.html`.

## Sviluppo

- Il progetto utilizza ES Modules, pertanto `script.js` è caricato con `type="module"`.
- La sfera politica è costruita con `THREE.SphereGeometry` e colorata dinamicamente in base ai 16 quadranti combinando i tre assi.
- Le recensioni vengono memorizzate nel `localStorage` del browser; cancellando i dati del sito si azzera anche lo storico.

Contributi, feedback e proposte di nuove funzionalità sono benvenuti!
