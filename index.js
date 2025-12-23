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

// --- ROTA 4: DASHBOARD DARK MODE (Estilo DataBox) ---
app.get('/dashboard', (req, res) => {
    // URL do seu logotipo
    const LOGO_URL = "https://wp.danielrosalinturismo.com.br/wp-content/uploads/2025/12/Logo-fundo-transparente-Branco-borda-reduzida-300x167.png"; 

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR" data-bs-theme="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard | Rosalin Turismo</title>
        
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">

        <style>
            :root {
                /* --- NOVA PALETA DARK (Estilo DataBox) --- */
                --bg-main: #0a3d4a;      /* Fundo principal (Azul Petróleo Escuro) */
                --bg-card: #124E5C;      /* Fundo dos cards (Um tom acima) */
                --text-bright: #ffffff;  /* Texto principal */
                --text-muted: #a8d0db;   /* Texto secundário */
                
                --accent-cyan: #20c997;  /* Destaque Ciano/Menta (KPIs) */
                --accent-orange: #ffc107; /* Destaque Laranja (Secundário) */
                --border-subtle: rgba(255, 255, 255, 0.1); /* Bordas suaves */
            }

            body { 
                font-family: 'Inter', sans-serif; 
                background-color: var(--bg-main); 
                color: var(--text-bright); 
            }
            
            /* Navbar Customizada */
            .navbar { 
                background-color: var(--bg-card) !important; 
                border-bottom: 1px solid var(--border-subtle); 
                padding: 15px 0; 
            }
            .brand-logo { height: 40px; margin-right: 15px; filter: brightness(1.2); }
            .brand-text { font-weight: 700; font-size: 1.3rem; color: var(--text-bright); letter-spacing: 0.5px; }
            .btn-refresh { 
                background-color: rgba(32, 201, 151, 0.15); 
                color: var(--accent-cyan); 
                border: 1px solid var(--accent-cyan); 
            }
            .btn-refresh:hover { background-color: var(--accent-cyan); color: var(--bg-main); }

            /* Cards (KPIs) Dark */
            .kpi-card {
                background: var(--bg-card);
                border: 1px solid var(--border-subtle);
                border-radius: 12px;
                padding: 25px;
                position: relative;
                overflow: hidden;
            }
            .kpi-icon-bg { position: absolute; right: -20px; bottom: -20px; font-size: 5rem; opacity: 0.05; }
            .kpi-value { font-size: 2.5rem; font-weight: 700; margin: 10px 0 5px 0; }
            .kpi-label { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }

            /* Cores Específicas dos KPIs */
            .kpi-cyan .kpi-value, .kpi-cyan i { color: var(--accent-cyan); }
            .kpi-orange .kpi-value, .kpi-orange i { color: var(--accent-orange); }

            /* Filtros e Containers */
            .content-box { 
                background: var(--bg-card); 
                padding: 20px; 
                border-radius: 12px; 
                margin-bottom: 25px; 
                border: 1px solid var(--border-subtle);
            }
            .section-title { color: var(--text-muted); font-size: 1.1rem; margin-bottom: 20px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px; }
            
            /* Inputs e Selects Dark */
            .form-control, .form-select {
                background-color: rgba(255,255,255,0.05);
                border: 1px solid var(--border-subtle);
                color: var(--text-bright);
            }
            .form-control:focus, .form-select:focus {
                background-color: rgba(255,255,255,0.1);
                border-color: var(--accent-cyan);
                color: var(--text-bright);
                box-shadow: none;
            }
            label.form-label { color: var(--text-muted); }

            /* Tabela Dark */
            .table-dark-custom { --bs-table-bg: transparent; color: var(--text-bright); }
            .table-dark-custom thead th { 
                background-color: rgba(0,0,0,0.2); 
                color: var(--text-muted); 
                border-bottom: 2px solid var(--border-subtle);
                font-weight: 600;
            }
            .table-dark-custom tbody td { border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
            .table-hover tbody tr:hover { background-color: rgba(32, 201, 151, 0.1) !important; }
            
            /* Badges */
            .badge-campanha { background-color: rgba(32, 201, 151, 0.2); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); padding: 5px 12px; border-radius: 20px; font-weight: 600; letter-spacing: 0.5px; }
            .badge-origem { background-color: rgba(255, 255, 255, 0.1); color: var(--text-bright); padding: 4px 10px; border-radius:

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR COMPLETO RODANDO NA PORTA ${PORT}`));


