require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.get('/', (req, res) => res.send('Orchestrator Musa con Fillers e Anti-Taglio Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// CARICAMENTO CONOSCENZA
// ==========================================
let adiKnowledgeBase = "";
try {
    adiKnowledgeBase = fs.readFileSync('ADI_fulltext.txt', 'utf8');
    console.log("📚 Volume ADI caricato correttamente!");
} catch (err) {
    console.error("⚠️ Errore fatale: File ADI_fulltext.txt non trovato!");
}

const MUSA_SYSTEM_PROMPT = `
Sei Musa, guida del Museo del Design ADI. 
Rispondi in modo COLLOQUIALE, come se stessi parlando a voce.
NO markdown, NO asterischi, NO elenchi. Numeri senza punti o virgole.
Usa solo queste info: \n\n${adiKnowledgeBase}`;

// Lista dei modelli in ordine di priorità
const MODEL_PRIORITY = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash"
];

// Le 5 frasi di circostanza per prendere tempo
const FRASI_ATTESA = [
    "Ottima domanda, fammi consultare l'archivio...",
    "Un attimo solo, verifico subito nei miei documenti...",
    "Che curiosità interessante! Controllo i dati...",
    "Sto cercando le informazioni esatte, dammi un secondo...",
    "Vado a pescare questo dettaglio nella mia memoria storica..."
];

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 Connessione stabilita con il visitatore!");
    
    let chatHistory = [];

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

            // ==========================================
            // 1. IL TRUCCO DEL FILLER (PRENDERE TEMPO)
            // ==========================================
            // Peschiamo una frase a caso e la inviamo IMMEDIATAMENTE a Soul Machines
            const randomFiller = FRASI_ATTESA[Math.floor(Math.random() * FRASI_ATTESA.length)];
            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", 
                transaction: data.transaction, // Rispondiamo subito alla sua transazione
                body: { personaId: 1, output: { text: randomFiller } }
            }));

            // ==========================================
            // 2. ELABORAZIONE DELLA VERA RISPOSTA (GEMINI)
            // ==========================================
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
                        generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
                    });

                    const result = await chat.sendMessage(userText);
                    replyText = result.response.text();
                    
                    success = true;
                    chatHistory.push({ role: "user", parts: [{ text: userText }] });
                    chatHistory.push({ role: "model", parts: [{ text: replyText }] });
                    break; 

                } catch (err) {
                    console.warn(`⚠️ Modello ${modelName} non disponibile, provo il fallback...`);
                }
            }

            if (!success) {
                replyText = "Chiedo scusa, i miei sistemi di ricerca sono lenti oggi. Potete riprovare?";
            }

            // ==========================================
            // 3. LA CURA ANTI-TAGLIO E L'INVIO FINALE
            // ==========================================
            // Questa Regex rimuove gli asterischi e TUTTI gli "a capo" (\n e \r) 
            // trasformando il testo in una riga singola per non spegnere l'avatar
            replyText = replyText.replace(/[\n\r]+/g, ' ').replace(/\*/g, '').trim();
            console.log("🧠 Musa risponde:", replyText);

            // Inviamo la risposta vera e propria (transaction: null la fa accodare al filler)
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
