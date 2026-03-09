require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Risposta di cortesia per evitare che Render dia errore se apri il link nel browser
app.get('/', (req, res) => res.send('Orchestration Server per Musa Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

// ==========================================
// CERVELLO WEBSOCKET PER SOUL MACHINES
// ==========================================
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 SOUL MACHINES CONNESSO VIA WEBSOCKET!");

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // Soul Machines manda tanti messaggi di sistema. Ascoltiamo solo quando l'utente parla:
            if (data.name !== 'conversationRequest') return;

            const userText = data.body.text;
            console.log("🗣️ Musa sente:", userText);

            if (!userText) return;

            // Chiamata al nuovo modello OpenAI GPT-4o
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Sei Musa, un assistente virtuale intelligente ed empatica. Rispondi in italiano, in modo conciso e colloquiale." },
                    { role: "user", content: userText }
                ]
            }, {
                headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }
            });

            const replyText = response.data.choices[0].message.content;
            console.log("🧠 GPT risponde:", replyText);

            // Rispondiamo a Soul Machines nel suo rigido formato Websocket
            const smResponse = {
                category: "scene",
                kind: "response",
                name: "conversationResponse",
                transaction: data.transaction, // Fondamentale restituire l'ID della transazione
                body: {
                    output: { text: replyText }
                }
            };
            
            ws.send(JSON.stringify(smResponse));

        } catch (e) {
            console.error("❌ Errore GPT:", e.message);
        }
    });

    ws.on('close', () => console.log("🔴 Connessione Websocket chiusa."));
});
