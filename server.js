require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.get('/', (req, res) => res.send('Orchestrator Musa con Fallback e ADI_fulltext Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// CARICAMENTO CONOSCENZA (FILE CORRETTO)
// ==========================================
let adiKnowledgeBase = "";
try {
    // CORREZIONE: Nome file aggiornato a ADI_fulltext.txt
    adiKnowledgeBase = fs.readFileSync('ADI_fulltext.txt', 'utf8');
    console.log("📚 Volume ADI (ADI_fulltext.txt) caricato correttamente!");
} catch (err) {
    console.error("⚠️ Errore fatale: File ADI_fulltext.txt non trovato su GitHub!");
}

const MUSA_SYSTEM_PROMPT = `
Sei Musa, guida del Museo del Design ADI. 
Rispondi in modo COLLOQUIALE e BREVE (max 2-3 frasi).
NO markdown, NO asterischi, NO elenchi. Numeri senza punti o virgole.
Usa solo queste info: \n\n${adiKnowledgeBase}`;

// Lista dei modelli in ordine di priorità (Fallback aggiornato a Gemini 3)
const MODEL_PRIORITY = [
    "gemini-3-flash-preview",         // Il nuovissimo modello Flash della serie 3 (Velocissimo)
    "gemini-3.1-flash-lite-preview",  // La versione Lite 3.1 per aggirare i colli di bottiglia
    "gemini-2.5-flash"                // Il vecchio modello come ultima ruota di scorta
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
                    body: { personaId: 1, output: { text: "Benvenuti al Museo del Design! Cosa desiderate scoprire oggi?" } }
                }));
            }

            const userText = data.body?.input?.text || data.body?.text || "";
            if (!userText.trim()) return;

            console.log("🗣️ Utente:", userText);

            let replyText = "";
            let success = false;

            // Logica di Fallback
            for (const modelName of MODEL_PRIORITY) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        systemInstruction: MUSA_SYSTEM_PROMPT
                    });

                  const chat = model.startChat({
    history: chatHistory,
    generationConfig: { 
        maxOutputTokens: 800, // Diamo ossigeno a Musa per finire le frasi!
        temperature: 0.1 
    }
});

                    const result = await chat.sendMessage(userText);
                    replyText = result.response.text();
                    
                    success = true;
                    chatHistory.push({ role: "user", parts: [{ text: userText }] });
                    chatHistory.push({ role: "model", parts: [{ text: replyText }] });
                    console.log(`✅ Risposta ottenuta con successo da: ${modelName}`);
                    break; 

                } catch (err) {
                    console.warn(`⚠️ Modello ${modelName} non disponibile, provo il fallback...`);
                }
            }

            if (!success) {
                replyText = "Chiedo scusa, i miei sistemi di ricerca sono un po' lenti oggi. Potete riprovare tra un istante?";
            }

            // Pulizia finale per l'avatar
            replyText = replyText.replace(/\*/g, '').trim();
            console.log("🧠 Musa risponde:", replyText);

            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", transaction: null,
                body: { personaId: 1, output: { text: replyText } }
            }));

        } catch (e) {
            console.error("❌ Errore generale nella gestione del messaggio:", e.message);
        }
    });

    ws.on('close', () => console.log("🔴 Connessione chiusa."));
});
