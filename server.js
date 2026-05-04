require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// IMPORTIAMO IL GESTORE FILE DI GOOGLE
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
app.get('/', (req, res) => res.send('Orchestrator Musa con File API, Fillers e Anti-Taglio Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// ==========================================
// UPLOAD E CACHING DEL VOLUME ADI SU GOOGLE
// ==========================================
let adiFileUri = null;
let adiFileMimeType = null;

async function initKnowledgeBase() {
    try {
        console.log("⏳ Caricamento del volume ADI (ADI_fulltext.txt) sui server Google...");
        const uploadResult = await fileManager.uploadFile("ADI_fulltext.txt", {
            mimeType: "text/plain",
            displayName: "Enciclopedia ADI",
        });
        adiFileUri = uploadResult.file.uri;
        adiFileMimeType = uploadResult.file.mimeType;
        console.log(`✅ File caricato con successo! URI: ${adiFileUri}`);
    } catch (err) {
        console.error("⚠️ Errore fatale caricamento file su Google:", err.message);
    }
}
// Avviamo il caricamento appena si accende il server
initKnowledgeBase();

const MUSA_SYSTEM_PROMPT = `
TASSATIVO: LA TUA RISPOSTA DEVE ESSERE BREVE. MASSIMO 5 FRASI E NON SUPERARE MAI LE 120 PAROLE. SEI UN ASSISTENTE VOCALE VELOCE.

Sei Musa, un'amichevole, empatica e appassionata guida del Museo del Design dell'ADI a Milano.
Il tuo compito è rispondere alle domande dei visitatori basandoti sul contesto fornito e sulle seguenti indicazioni:

PERSONALITA E STILE CONVERSAZIONALE:
Sei un'amante del design! Mostra entusiasmo, usa un tono caldo, accogliente e colloquiale.
Le tue risposte devono essere fluide e discorsive, come se stessi davvero chiacchierando a voce con il visitatore davanti a te.
Sii esauriente ma mantieni la risposta intorno alle 3-5 frasi, massimo 100 parole. Non fare monologhi troppo lunghi.
Se ti chiedono un'informazione che non è presente nel contesto, scusati cortesemente e di' che al momento quel dettaglio non è disponibile.
Quando hai una risposta parziale o approssimativa non dire "non mi è chiaro" o "non so esattamente", di' invece "ti cito alcuni esempi" o frasi simili.

REGOLE TECNICHE PER LA VOCE (TASSATIVO):
DIVIETO ASSOLUTO: Non usare MAI asterischi, elenchi puntati o numerati, grassetti, virgolette strane o markdown. Usa solo testo puro.
NUMERI: Non usare virgole o punti per separare le migliaia (scrivi 1000 e non 1.000, 2026 e non 2.026).
Usa le lettere accentate per indicare come pronunciare parole straniere o ambigue.
Non proporre di mostrare oggetti o foto, sei un assistente puramente vocale.
Non parlare di argomenti inappropriati o fuori dal design.
9090 si scrive sempre novantanovanta`;

const MODEL_PRIORITY = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash"
];

const FRASI_ATTESA = [
    "Ottima domanda, fammi consultare l'archivio...",
    "Un attimo solo, verifico subito nei miei documenti...",
    "Controllo subito i dati storici, dammi un secondo...",
    "Vado a pescare questo dettaglio nella mia memoria..."
];

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 Connessione stabilita con il visitatore!");
    
    // Inizializziamo la chat passando il file caricato su Google come primissimo messaggio
    let chatHistory = [];
    if (adiFileUri) {
        chatHistory.push({
            role: "user",
            parts: [
                { fileData: { mimeType: adiFileMimeType, fileUri: adiFileUri } },
                { text: "Questo è l'archivio completo. Usalo per tutte le prossime risposte." }
            ]
        });
        chatHistory.push({
            role: "model",
            parts: [{ text: "Ricevuto. Utilizzerò esclusivamente questo archivio per rispondere." }]
        });
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.name !== 'conversationRequest') return;

            if (data.body?.optionalArgs?.kind === "init") {
                return ws.send(JSON.stringify({
                    category: "scene", kind: "request", name: "conversationResponse", transaction: data.transaction,
                    body: { personaId: 1, output: { text: "Benvenuti al Museo del Design! Sono Musa, cosa desiderate scoprire oggi?" } }
                }));
            }

            const userText = data.body?.input?.text || data.body?.text || "";
            if (!userText.trim()) return;

            console.log("🗣️ Utente:", userText);

            // FILLER: Prende tempo mentre Gemini elabora
            const randomFiller = FRASI_ATTESA[Math.floor(Math.random() * FRASI_ATTESA.length)];
            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", 
                transaction: data.transaction, 
                body: { personaId: 1, output: { text: randomFiller } }
            }));

            let replyText = "";
            let success = false;

            for (const modelName of MODEL_PRIORITY) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        systemInstruction: MUSA_SYSTEM_PROMPT
                    });

                const chat = model.startChat({
                        history: chatHistory,
                        // Rimuoviamo il limite dei token per lasciarla parlare liberamente
                        generationConfig: { temperature: 0.1 } 
                    });

                    const result = await chat.sendMessage(userText);
                    
                    // Aggiungiamo questa riga per spiare PERCHÉ Gemini si ferma!
                    console.log("🏁 Motivo dello stop:", result.response.candidates[0].finishReason);
                    
                    replyText = result.response.text();

                    const result = await chat.sendMessage(userText);
                    replyText = result.response.text();
                    
                    success = true;
                    chatHistory.push({ role: "user", parts: [{ text: userText }] });
                    chatHistory.push({ role: "model", parts: [{ text: replyText }] });
                    break; 

                } catch (err) {
                    console.warn(`⚠️ Modello ${modelName} non disponibile, fallback...`);
                }
            }

            if (!success) {
                replyText = "Chiedo scusa, i miei sistemi di ricerca sono lenti oggi. Potete riprovare?";
            }

            // PULIZIA FINALE: Rimuove ritorni a capo, asterischi e RIATTACCA GLI APOSTROFI
            replyText = replyText
                .replace(/[\n\r]+/g, ' ')  // Toglie gli a capo che fanno spegnere l'avatar
                .replace(/\*/g, '')        // Toglie la formattazione markdown
                .replace(/'\s+/g, "'")     // CORREZIONE APOSTROFI: Trasforma "C' è" in "C'è"
                .trim();
                
            console.log("🧠 Musa risponde:", replyText);

            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", transaction: null,
                body: { personaId: 1, output: { text: replyText } }
            }));

        } catch (e) {
            console.error("❌ Errore generale:", e.message);
        }
    });

    ws.on('close', () => console.log("🔴 Connessione chiusa."));
});
