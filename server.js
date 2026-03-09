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
app.listen(PORT, () => console.log(`🚀 Server Render attivo sulla porta ${PORT}`));// JavaScript Document
