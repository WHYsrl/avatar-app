require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('Orchestrator Websocket per Musa (Architettura Dify RAG) Attivo!'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 Server HTTP in ascolto sulla porta ${PORT}`));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log("🟢 ORCHESTRATOR: Connessione stabilita con un visitatore!");

    // Generiamo un ID unico per questo visitatore, così Dify ricorda la conversazione
    const sessionId = "visitor-" + Math.random().toString(36).substring(7);
    let conversationId = ""; // Qui salveremo l'ID della chat fornito da Dify

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.name !== 'conversationRequest') return;

            // BENVENUTO
            if (data.body?.optionalArgs?.kind === "init") {
                const welcomeMsg = "Benvenuti al Museo del Design! Cosa volete scoprire oggi?";
                return ws.send(JSON.stringify({
                    category: "scene", kind: "request", name: "conversationResponse", transaction: data.transaction,
                    body: { personaId: 1, output: { text: welcomeMsg } }
                }));
            }

            const userText = data.body?.input?.text || data.body?.text || "";
            if (!userText.trim()) return;

            console.log("🗣️ Visitatore chiede:", userText);

            // ==========================================
            // CHIAMATA ALLE API DI DIFY
            // ==========================================
            const payload = {
                inputs: {},
                query: userText,
                response_mode: "blocking",
                user: sessionId
            };
            
            // Se abbiamo già iniziato a parlare, passiamo l'ID per farle avere memoria
            if (conversationId) {
                payload.conversation_id = conversationId;
            }

            const response = await axios.post('https://api.dify.ai/v1/chat-messages', payload, {
                headers: { 'Authorization': 'Bearer ' + process.env.DIFY_API_KEY }
            });

            // Salviamo l'ID della conversazione aggiornato
            conversationId = response.data.conversation_id;

            // Dify restituisce il testo dentro 'answer'
            let replyText = response.data.answer || "";
            
            if (!replyText.trim()) {
                replyText = "Perdona l'attesa. Puoi ripetermi la domanda?";
            }

            console.log("🧠 Musa (Dify) risponde:", replyText);

            // ==========================================
            // INVIO A SOUL MACHINES
            // ==========================================
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
            console.error("❌ Errore Dify:", e.response ? JSON.stringify(e.response.data) : e.message);
            ws.send(JSON.stringify({
                category: "scene", kind: "request", name: "conversationResponse", transaction: null,
                body: { personaId: 1, output: { text: "Scusa, in questo momento i miei archivi sono in aggiornamento." } }
            }));
        }
    });

    ws.on('close', () => console.log("🔴 ORCHESTRATOR: Connessione chiusa."));
});
