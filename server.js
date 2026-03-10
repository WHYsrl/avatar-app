require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('Orchestrator Websocket per Musa Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 ORCHESTRATOR: Soul Machines connesso via Websocket!");

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.name !== 'conversationRequest') return;
            
            // LOG GIGANTE PER VEDERE ESATTAMENTE COSA CI CHIEDE SM
            console.log("\n=================================");
            console.log("📥 RICHIESTA IN ARRIVO DA SM:");
            console.log(JSON.stringify(data, null, 2));
            console.log("=================================\n");

            const userText = data.body?.input?.text || data.body?.text || "";
            if (!userText.trim()) return;

            console.log("🗣️ Musa sente:", userText);

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Sei Musa, un assistente virtuale intelligente ed empatica. Rispondi in italiano in modo breve e cordiale." },
                    { role: "user", content: userText }
                ]
            }, {
                headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }
            });

            const replyText = response.data.choices[0].message.content;
            console.log("🧠 GPT risponde:", replyText);

            // RISPOSTA CORRETTA AL 100% (kind: "event" e personaId)
            const smResponse = {
                category: "scene",
                kind: "event",
                name: "conversationResponse",
                body: {
                    personaId: data.body?.personaId || "1",
                    output: { text: replyText }
                }
            };
            
            console.log("📤 RISPOSTA INVIATA A SM:");
            console.log(JSON.stringify(smResponse, null, 2));
            console.log("=================================\n");

            ws.send(JSON.stringify(smResponse));

        } catch (e) {
            console.error("❌ Errore GPT:", e.message);
        }
    });

    ws.on('close', () => console.log("🔴 ORCHESTRATOR: Connessione chiusa."));
});
