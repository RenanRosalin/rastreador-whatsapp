const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIGURAÇÃO ---
const MEU_NUMERO_WHATSAPP = '5514997132879'; 
const TEMPO_JANELA_MS = 300000; // 5 minutos

// --- CONEXÃO GOOGLE SHEETS ---
console.log("🔄 Conectando Google Sheets...");
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
    console.log("✅ Google Auth OK.");
} catch (e) { console.error("❌ ERRO GOOGLE:", e.message); }

let cliquesPendentes = []; 

// --- ROTA 0: PÁGINA INICIAL ---
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 50px; background: #f0f2f5; }
                    .btn { display: block; padding: 20px; margin: 15px auto; max-width: 300px; text-decoration: none; color: white; border-radius: 8px; font-weight: bold; }
                    .btn-zap { background-color: #25D366; }
                    .btn-dash { background-color: #0084ff; }
                </style>
            </head>
            <body>
                <h1>Painel de Controle 🚀</h1>
                <a href="/r?origem=teste_botao&campanha=dashboard_check" class="btn btn-zap">👉 TESTAR LINK</a>
                <a href="/dashboard" class="btn btn-dash">📊 ABRIR DASHBOARD</a>
            </body>
        </html>
    `);
});

// --- ROTA 1: Rastreador (SEM MENSAGEM) ---
app.get('/r', (req, res) => {
    const { origem, campanha } = req.query;
    console.log(`🖱️ CLIQUE: ${origem} | ${campanha}`);
    
    const novoClique = {
        id: Date.now().toString(36),
        timestamp: Date.now(),
        origem: origem || 'desconhecido',
        campanha: campanha || 'geral',
        usado: false
    };

    cliquesPendentes.push(novoClique);
    if (cliquesPendentes.length > 100) cliquesPendentes.shift();

    // Link simples, sem o parâmetro &text=
    const linkZap = `https://api.whatsapp.com/send?phone=${MEU_NUMERO_WHATSAPP}`;
    
    res.redirect(linkZap);
});

// --- ROTA 2: Webhook ---
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.message?.fromMe || body.fromMe) return res.send('Ignorado');

        const msgTexto = body.message?.body || body.body || ''; 
        const telefoneCliente = body.contact?.phone || body.phone || 'Desconhecido';
        const nomeCliente = body.contact?.name || body.name || 'Desconhecido';

        const agora = Date.now();
        const janelaTempo = agora - TEMPO_JANELA_MS;
        
        const indexClique = cliquesPendentes.findIndex(c => 
            c.timestamp > janelaTempo && c.timestamp < agora && !c.usado
        );

        if (indexClique !== -1) {
            const clique = cliquesPendentes[indexClique];
            console.log(`✅ MATCH! Campanha: ${clique.campanha}`);
            
            try {
                const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Página1!A:F', 
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[dataHora, nomeCliente, telefoneCliente, clique.origem, clique.campanha, msgTexto]] },
                });
            } catch (err) { console.error("❌ Erro Google:", err.message); }
            
            cliquesPendentes[indexClique].usado = true;
        }
        res.status(200).send('OK');
    } catch (error) { res.status(500).send('Erro'); }
});

// --- ROTA 3: API (Puxa da Planilha) ---
app.get('/api/leads', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Página1!A2:E200', // Pega até 200 linhas
        });
        const rows = response.data.values || [];
        const leads = rows.map(row => ({
            data: row[0], nome: row[1], telefone: row[2], origem: row[3], campanha: row[4]
        })).reverse();
        res.json(leads);
    } catch (error) { res.json([]); }
});

// --- ROTA 4: DASHBOARD VISUAL ---
app.get('/dashboard', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard Leads</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light p-3">
        <div class="container">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2>📊 Dashboard em Tempo Real</h2>
                <button onclick="carregar()" class="btn btn-primary">🔄 Atualizar</button>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-4"><div class="card p-3 text-center"><h5>Total Leads</h5><h2 id="total">-</h2></div></div>
                <div class="col-md-4"><div class="card p-3 text-center"><h5>Melhor Origem</h5><h2 id="topOrigem">-</h2></div></div>
                <div class="col-md-4"><div class="card p-3 text-center"><h5>Melhor Campanha</h5><h2 id="topCampanha">-</h2></div></div>
            </div>

            <div class="card shadow-sm">
                <div class="card-body">
                    <h5 class="card-title">Últimos Leads (Via Planilha Google)</h5>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead><tr><th>Data</th><th>Nome</th><th>Origem</th><th>Campanha</th></tr></thead>
                            <tbody id="tabela"></tbody>
                        </table>
                    </div>
                </div>
            </div>
            <p class="text-muted text-center mt-3 small">Os dados vêm direto da sua planilha do Google Sheets.</p>
        </div>

        <script>
            async function carregar() {
                try {
                    document.getElementById('tabela').innerHTML = '<tr><td colspan="4" class="text-center">Carregando dados...</td></tr>';
                    const res = await fetch('/api/leads');
                    const leads = await res.json();
                    
                    document.getElementById('total').innerText = leads.length;
                    
                    const tbody = document.getElementById('tabela');
                    tbody.innerHTML = leads.length ? leads.map(l => 
                        \`<tr><td>\${l.data}</td><td>\${l.nome}</td><td>\${l.origem}</td><td>\${l.campanha}</td></tr>\`
                    ).join('') : '<tr><td colspan="4" class="text-center">Nenhum lead encontrado ainda.</td></tr>';

                    if(leads.length > 0) {
                        const count = (key) => {
                            const c = {}; leads.forEach(l => c[l[key]] = (c[l[key]]||0)+1);
                            return Object.keys(c).reduce((a, b) => c[a] > c[b] ? a : b);
                        };
                        document.getElementById('topOrigem').innerText = count('origem');
                        document.getElementById('topCampanha').innerText = count('campanha');
                    }
                } catch(e) { 
                    console.error(e);
                    document.getElementById('tabela').innerHTML = '<tr><td colspan="4" class="text-danger">Erro ao carregar. Verifique os logs do Render.</td></tr>';
                }
            }
            carregar();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR COMPLETO RODANDO NA PORTA ${PORT}`));
