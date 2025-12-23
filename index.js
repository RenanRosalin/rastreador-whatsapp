const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIGURAÇÃO ---
const MEU_NUMERO_WHATSAPP = '5514997132879'; 
const TEMPO_JANELA_MS = 300000; // Aumentei para 5 minutos (tolerância maior)

// --- CONEXÃO GOOGLE SHEETS ---
console.log("🔄 Tentando conectar ao Google Sheets...");
let sheets;
let SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

try {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
    console.log("✅ Google Auth configurado (Aguardando primeiro uso...)");
} catch (e) {
    console.error("❌ ERRO FATAL NA CONFIGURAÇÃO DO GOOGLE:", e.message);
}

// Memória RAM
let cliquesPendentes = []; 

// --- ROTA 1: Link do Anúncio ---
app.get('/r', (req, res) => {
    const { origem, campanha } = req.query;
    console.log(`🖱️ CLIQUE RECEBIDO: Origem=${origem}, Campanha=${campanha}`); // <--- AGORA VAI AVISAR
    
    const novoClique = {
        id: Date.now().toString(36),
        timestamp: Date.now(),
        origem: origem || 'desconhecido',
        campanha: campanha || 'geral',
        usado: false
    };

    cliquesPendentes.push(novoClique);
    // Limpeza (mantém últimos 100 cliques para não lotar memória)
    if (cliquesPendentes.length > 100) cliquesPendentes.shift();

    const mensagem = `Olá! Vim através do anúncio e gostaria de saber mais.`;
    
    // --- CORREÇÃO DAS CRASES ---
    // Atenção: Use crase ` (acento grave) no começo e fim
    const linkZap = `https://api.whatsapp.com/send?phone=${MEU_NUMERO_WHATSAPP}&text=${encodeURIComponent(mensagem)}`;
    
    res.redirect(linkZap);
});

// --- ROTA 2: Webhook (Salva na Planilha) ---
app.post('/webhook', async (req, res) => {
    console.log("📨 WEBHOOK CHAMADO!"); // <--- Avisa que o Megazap bateu na porta

    try {
        const body = req.body;
        console.log("📦 DADOS CHEGANDO:", JSON.stringify(body).substring(0, 100) + "..."); // Mostra o começo dos dados

        // Verifica se é mensagem enviada pela empresa (ignora)
        if (body.message?.fromMe || body.fromMe) {
            console.log("🚫 Ignorado: Mensagem da própria empresa.");
            return res.send('Ignorado');
        }

        const msgTexto = body.message?.body || body.body || ''; 
        const telefoneCliente = body.contact?.phone || body.phone || 'Desconhecido';
        const nomeCliente = body.contact?.name || body.name || 'Desconhecido';

        console.log(`👤 Cliente: ${nomeCliente} | Msg: ${msgTexto}`);

        // Lógica de Janela de Tempo
        const agora = Date.now();
        const janelaTempo = agora - TEMPO_JANELA_MS;
        
        // Procura clique
        const indexClique = cliquesPendentes.findIndex(c => 
            c.timestamp > janelaTempo && c.timestamp < agora && !c.usado
        );

        if (indexClique !== -1) {
            const clique = cliquesPendentes[indexClique];
            console.log(`✅ MATCH! Encontrado clique da campanha: ${clique.campanha}`);
            
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // TENTA SALVAR
            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Página1!A:F', 
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[dataHora, nomeCliente, telefoneCliente, clique.origem, clique.campanha, msgTexto]]
                    },
                });
                console.log(`📝 LINHA ADICIONADA NA PLANILHA COM SUCESSO!`);
                cliquesPendentes[indexClique].usado = true;
            } catch (errGoogle) {
                console.error(`❌ ERRO AO SALVAR NO GOOGLE:`, errGoogle.response?.data || errGoogle.message);
                if (errGoogle.message.includes('403') || errGoogle.message.includes('permission')) {
                     console.error("💡 DICA: Verifique se o email do robô é EDITOR na planilha.");
                }
            }
        } else {
            console.log("⚠️ NENHUM CLIQUE RECENTE ENCONTRADO (Lead Orgânico ou tempo expirou).");
            console.log("👀 Cliques na memória agora:", cliquesPendentes.length);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("❌ ERRO GERAL NO WEBHOOK:", error);
        res.status(500).send('Erro');
    }
});

// --- ROTA 3: API DASHBOARD ---
app.get('/api/leads', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Página1!A2:E50',
        });
        const rows = response.data.values || [];
        const leads = rows.map(row => ({
            data: row[0], nome: row[1], telefone: row[2], origem: row[3], campanha: row[4]
        })).reverse();
        res.json(leads);
    } catch (error) {
        res.status(500).json([]);
    }
});

// --- ROTA DASHBOARD ---
app.get('/dashboard', (req, res) => {
    res.send(`<h1>Painel Ativo</h1><p>Acesse /api/leads para ver os dados brutos.</p>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR "TAGARELA" RODANDO NA PORTA ${PORT}`));
