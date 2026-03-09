require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Pagina di cortesia per testare se il server è online
app.get('/', (req, res) => res.send('Orchestrator Websocket per Musa Attivo!'));

const PORT = process.env.PORT || 3000;
// Avviamo il server HTTP base
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

// ==========================================
// CERVELLO WEBSOCKET PER SOUL MACHINES
// ==========================================
// Agganciamo il server Websocket al server HTTP
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 ORCHESTRATOR: Soul Machines connesso via Websocket!");

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // Filtriamo solo i messaggi in cui l'utente sta parlando
            if (data.name !== 'conversationRequest') return;

            // RECUPERO TESTO CORRETTO: SM nasconde il testo dentro body.input
            const userText = data.body?.input?.text || data.body?.text || "";
            
            if (!userText.trim()) {
                console.log("⚠️ Ricevuto messaggio vuoto o di sistema, lo ignoro.");
                return;
            }

            console.log("🗣️ Musa sente:", userText);

            // Chiamata diretta a ChatGPT (Modello 4o)
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Sei Musa, un assistente virtuale intelligente ed empatica. Rispondi in italiano, in modo colloquiale e senza usare liste puntate o formattazioni complesse." },
                    { role: "user", content: userText }
                ]
            }, {
                headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }
            });

            const replyText = response.data.choices[0].message.content;
            console.log("🧠 GPT risponde:", replyText);

            // Formattazione esatta richiesta dal protocollo Websocket di SM
            const smResponse = {
                category: "scene",
                kind: "response",
                name: "conversationResponse",
                transaction: data.transaction,
                body: {
                    output: { text: replyText }
                }
            };
            
            ws.send(JSON.stringify(smResponse));

        } catch (e) {
            console.error("❌ Errore GPT:", e.message);
        }
    });

    ws.on('close', () => console.log("🔴 ORCHESTRATOR: Connessione chiusa."));
});
