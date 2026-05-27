require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
app.get('/', (req, res) => res.send('Orchestrator Musa (Staggered Fillers) Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// ==========================================
// UPLOAD E CACHING VOLUME ADI
// ==========================================
let adiFileUri = null;
let adiFileMimeType = null;

async function initKnowledgeBase() {
    try {
        console.log("⏳ Caricamento ADI_fulltext.txt sui server Google...");
        const uploadResult = await fileManager.uploadFile("ADI_fulltext.txt", {
            mimeType: "text/plain",
            displayName: "Enciclopedia ADI",
        });
        adiFileUri = uploadResult.file.uri;
        adiFileMimeType = uploadResult.file.mimeType;
        console.log(`✅ File in Cache! URI: ${adiFileUri}`);
    } catch (err) {
        console.error("⚠️ Errore caricamento file:", err.message);
    }
}
initKnowledgeBase();

// ==========================================
// CONFIGURAZIONE PROMPT E MODELLI
// ==========================================
const MUSA_SYSTEM_PROMPT = `TASSATIVO: RISPOSTA BREVE. MASSIMO 5 FRASI E 120 PAROLE. SEI UN ASSISTENTE VOCALE VELOCE. Sei Musa, guida empatica del Museo del Design ADI a Milano. Rispondi con entusiasmo e tono colloquiale, come in una conversazione reale. Sii fluido e discorsivo. Se un'informazione manca, scusati dicendo che il dettaglio non è disponibile. Se la risposta è parziale, usa frasi come "ti cito alcuni esempi". REGOLE TECNICHE: Usa solo testo puro. DIVIETO ASSOLUTO di asterischi, elenchi puntati, grassetti o markdown. Per i numeri non usare separatori delle migliaia: scrivi 1000 e non 1.000. Non proporre foto o immagini. Il modello 9090 si scrive sempre novantanovanta.`;

// Lista ufficiale dei modelli stabili Google API (27 Maggio 2026)
const MODEL_PRIORITY = [
    "gemini-3.5-flash",         // Prima scelta: Il nuovo standard super intelligente
    "gemini-3.1-flash-lite",    // Seconda scelta: Corsia veloce per evitare timeout
    "gemini-2.5-flash"          // Ultima spiaggia: Modello legacy ancora vivo
];

// Gruppi di filler per evitare ripetizioni
const FILLER_1 = ["Grazie per la domanda", "Che curiosità interessante!", "Un attimo di pazienza, sto recuperando le informazioni", "Sto interrogando il database del Compasso d'Oro", "Interessante! Lasciami consultare le note della collezione…", "Sto sfogliando virtualmente il catalogo del museo per te...", "Questa è una delle domande più frequenti dei nostri visitatori!", "Ottima osservazione, guardiamo insieme i dettagli…", "Ti recupero immediatamente i dettagli", "Un secondo solo, verifico"];
const FILLER_2 = ["Sto ancora spulciando tra i premi, ci sono quasi...", "Arrivo subito, sto cercando il dettaglio preciso...", "Ancora un istante, l'archivio è molto vasto..."];
const FILLER_3 = ["Ti ringrazio per la pazienza, sto arrivando alla conclusione...", "Ecco, ho quasi trovato tutto quello che ti serve...", "Ancora un momento e sarò da te con la risposta..."];

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 Visitatore connesso!");
    let chatHistory = [];
    
    // Iniezione file nella chat (se disponibile)
    if (adiFileUri) {
        chatHistory.push({ role: "user", parts: [{ fileData: { mimeType: adiFileMimeType, fileUri: adiFileUri } }, { text: "Archivio Museo caricato." }] });
        chatHistory.push({ role: "model", parts: [{ text: "Ricevuto." }] });
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

            // ---------------------------------------------------------
            // GESTIONE DEI FILLER A CASCATA (TIMERS)
            // ---------------------------------------------------------
            let responseSent = false;
            let transactionHandled = false;
            let activeTimers = [];

            // Funzione per inviare messaggi a Soul Machines
            const sendToSM = (text, isFinal = false) => {
                if (responseSent) return; 
                
                const msg = {
                    category: "scene",
                    kind: "request",
                    name: "conversationResponse",
                    transaction: transactionHandled ? null : data.transaction,
                    body: { personaId: 1, output: { text: text } }
                };
                
                transactionHandled = true;
                if (isFinal) responseSent = true;
                ws.send(JSON.stringify(msg));
            };

            // Programmazione dei Filler
            activeTimers.push(setTimeout(() => sendToSM(FILLER_1[Math.floor(Math.random()*FILLER_1.length)]), 2000));
            activeTimers.push(setTimeout(() => sendToSM(FILLER_2[Math.floor(Math.random()*FILLER_2.length)]), 10000));
            activeTimers.push(setTimeout(() => sendToSM(FILLER_3[Math.floor(Math.random()*FILLER_3.length)]), 18000));
            
       // ---------------------------------------------------------
            // CHIAMATA A GEMINI (REST - CON SYSTEM INSTRUCTIONS RIPRISTINATE)
            // ---------------------------------------------------------
            let replyText = "";
            let success = false;

            for (const modelName of MODEL_PRIORITY) {
                try {
                    // Prepariamo la storia della chat includendo il messaggio corrente dell'utente
                    const contents = [...chatHistory, { role: "user", parts: [{ text: userText }] }];

           // Payload essenziale: solo istruzioni e contenuto, nessuna configurazione extra
                    const payload = {
                        systemInstruction: {
                            parts: [
                                { text: MUSA_SYSTEM_PROMPT }
                            ]
                        },
                        contents: contents
                    };

                    // Chiamata REST diretta (Bypassa i bug della vecchia libreria SDK)
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(`[API Error ${response.status}] ${result.error?.message || 'Sconosciuto'}`);
                    }

                    // Estraiamo il testo della risposta generata
                    replyText = result.candidates[0].content.parts[0].text;
                    
                    success = true;
                    // Aggiorniamo la cronologia della chat per i turni successivi
                    chatHistory.push({ role: "user", parts: [{ text: userText }] });
                    chatHistory.push({ role: "model", parts: [{ text: replyText }] });
                    break;

                } catch (err) {
                    console.error(`❌ ERRORE CRITICO SU ${modelName}:`);
                    console.error(`Messaggio: ${err.message}`);
                    console.warn(`⚠️ Avvio procedura di Fallback da ${modelName}...`);
                }
            }

            // Pulizia dei timer
            activeTimers.forEach(t => clearTimeout(t));

            if (!success) replyText = "Scusami, i miei archivi sono un po' lenti. Puoi riprovare?";

            // Pulizia testo finale
            replyText = replyText.replace(/[\n\r]+/g, ' ').replace(/\*/g, '').replace(/'\s+/g, "'").trim();
            
            console.log("🧠 Musa risponde:", replyText);
            sendToSM(replyText, true);

        } catch (err) {
            // ERRORE 2 CORRETTO: Modificato il log per errori generali del websocket
            console.error(`❌ ERRORE GENERALE NEL GESTORE MESSAGGI:`);
            console.error(err); 
        }
    });

    ws.on('close', () => console.log("🔴 Connessione chiusa."));
});
