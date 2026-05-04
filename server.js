require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.get('/', (req, res) => res.send('Orchestrator Websocket per Musa (Gemini Flash) Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

// Inizializza l'SDK di Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// PREPARAZIONE DELL'ENCICLOPEDIA
// ==========================================
let adiKnowledgeBase = "";
try {
    adiKnowledgeBase = fs.readFileSync('ADI_Fulltext.txt', 'utf8');
    console.log("📚 Volume ADI (3MB) caricato in memoria con successo!");
} catch (err) {
    console.error("⚠️ Errore: File ADI_Fulltext.txt non trovato. Assicurati di averlo caricato su GitHub.");
}

const MUSA_SYSTEM_PROMPT = `
Sei Musa, un'amichevole ed esperta guida del Museo del Design dell'ADI a Milano.
Rispondi in modo COLLOQUIALE, ISTANTANEO e CONCISO.

REGOLA D'ORO PER LA VOCE:
- Le tue risposte devono essere pensate per essere pronunciate a voce (massimo 2-3 frasi brevi).
- DIVIETO ASSOLUTO: Non usare MAI asterischi, elenchi puntati o numerati, grassetti o markdown. Scrivi i numeri in lettere o senza virgole (es. 1000).
- Usa ESCLUSIVAMENTE il documento fornito per rispondere. Se non sai qualcosa o non è nel documento, di' semplicemente: "Purtroppo non ho questa informazione nei miei archivi".

ECCO L'INTERO ARCHIVIO DEL MUSEO ADI DA CUI ATTINGERE:
\n\n${adiKnowledgeBase}
`;

// ==========================================
// CERVELLO WEBSOCKET
// ==========================================
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 ORCHESTRATOR: Connessione stabilita con un visitatore!");

// Inizializza il modello Flash con il contesto gigante
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // LO STANDARD ATTUALE (MAGGIO 2026)
        systemInstruction: MUSA_SYSTEM_PROMPT,
    });

    // Inizializziamo la chat per mantenere la memoria della conversazione
    const chat = model.startChat({
        generationConfig: {
            maxOutputTokens: 150, // Forza risposte brevi e fulminee
            temperature: 0.1,     // Molto bassa: massima fedeltà storica ai dati ADI
        }
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.name !== 'conversationRequest') return;

            // BENVENUTO
            if (data.body?.optionalArgs?.kind === "init") {
                const welcomeMsg = "Benvenuti al Museo del Design! Sono Musa, cosa volete scoprire oggi?";
                return ws.send(JSON.stringify({
                    category: "scene", kind: "request", name: "conversationResponse", transaction: data.transaction,
                    body: { personaId: 1, output: { text: welcomeMsg } }
                }));
            }

            const userText = data.body?.input?.text || data.body?.text || "";
            if (!userText.trim()) return;

            console.log("🗣️ Visitatore chiede:", userText);

            // CHIAMATA A GEMINI FLASH
            const result = await chat.sendMessage(userText);
            let replyText = result.response.text();
            
            // Rete di sicurezza anti-markdown
            replyText = replyText.replace(/\*/g, '').trim();

            if (!replyText) {
                replyText = "Perdona l'attesa. Puoi ripetermi la domanda?";
            }

            console.log("🧠 Musa (Gemini) risponde:", replyText);

            // INVIO A SOUL MACHINES
            const smResponse = {
                category: "scene",
                kind: "request", 
                name: "conversationResponse",
                transaction: null, 
                body: {
                    personaId: 1, 
                    output: { text: replyText }
                }
            };
            
            ws.send(JSON.stringify(smResponse));

        } catch (e) {
            console.error("❌ Errore Gemini:", e.message);
            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", transaction: null,
                body: { personaId: 1, output: { text: "Scusa, sto consultando i miei archivi, ci riproviamo tra un attimo?" } }
            }));
        }
    });

    ws.on('close', () => console.log("🔴 ORCHESTRATOR: Connessione chiusa."));
});
