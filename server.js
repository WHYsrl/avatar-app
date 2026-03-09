require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
// Permettiamo al tuo sito SiteGround di fare richieste a questo server
app.use(cors({ origin: 'https://avatar.frystudio.it' })); 
app.use(express.json());

// Proxy per Soul Machines
app.post('/api/sm-key', async (req, res) => {
    try {
        console.log("Richiesta Token a Soul Machines (.cloud) da Render...");
        
        // L'indirizzo e il formato CORRETTI richiesti da Soul Machines
        const response = await axios.post('https://dh.soulmachines.cloud/api/jwt', {
            apikey: process.env.SM_API_KEY
        });
        
        // SM restituisce l'oggetto con nome "jwt", noi lo mandiamo al sito come "token"
        res.json({ token: response.data.jwt });
        
    } catch (e) {
        console.error("ERRORE SM:", e.response ? e.response.data : e.message);
        res.status(500).json({ error: "Errore generazione token" });
    }
});

// Proxy per OpenAI
app.post('/api/chat', async (req, res) => {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o",
            messages: req.body.messages,
            max_tokens: 500
        }, {
            headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }
        });
        res.json({ reply: response.data.choices[0].message.content });
    } catch (e) {
        console.error("Errore OpenAI:", e.message);
        res.status(500).json({ reply: "Errore connessione AI." });
    }
});

// Su Render la porta viene assegnata dinamicamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Render attivo sulla porta ${PORT}`));

// --- NUOVA ROTTA: SOUL MACHINES CUSTOM SKILL WEBHOOK ---
app.post('/api/skill', async (req, res) => {
    try {
        // Soul Machines invia il testo trascritto nel body. 
        // A seconda della configurazione, si trova in req.body.text o req.body.input.text
        const userText = req.body.text || (req.body.input && req.body.input.text) || "";
        console.log("🗣️ Musa ha sentito:", userText);

        if (!userText) {
            return res.json({ output: { text: "Non ho capito bene, puoi ripetere?" } });
        }

        // Chiamata a OpenAI (Aggiornata e corretta)
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o",
            // max_completion_tokens: 500, // Usa questo se vuoi limitare la risposta, NON max_tokens!
            messages: [
                { role: "system", content: "Sei Musa, un assistente virtuale intelligente e conciso. Rispondi in italiano." },
                { role: "user", content: userText }
            ]
        }, {
            headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY }
        });

        const replyText = response.data.choices[0].message.content;
        console.log("🧠 ChatGPT risponde:", replyText);

        // Risposta nel formato JSON richiesto da Soul Machines
        res.json({
            output: {
                text: replyText
            }
        });
        
    } catch (e) {
        console.error("Errore Skill GPT:", e.message);
        res.json({ output: { text: "Scusa, ho un problema di connessione al mio cervello centrale." } });
    }
});

// JavaScript Document
