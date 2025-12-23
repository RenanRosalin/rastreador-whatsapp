const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIGURAÇÃO ---
const MEU_NUMERO_WHATSAPP = '5514997132879'; 
const TEMPO_JANELA_MS = 180000; // 3 minutos

// --- CONEXÃO GOOGLE SHEETS ---
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// Memória RAM apenas para cliques (não precisa salvar em banco, é volátil)
let cliquesPendentes = []; 

// --- ROTA 1: Link do Anúncio ---
app.get('/r', (req, res) => {
    const { origem, campanha } = req.query;
    
    const novoClique = {
        id: Date.now().toString(36),
        timestamp: Date.now(),
        origem: origem || 'desconhecido',
        campanha: campanha || 'geral',
        usado: false
    };

    cliquesPendentes.push(novoClique);
    cliquesPendentes = cliquesPendentes.filter(c => Date.now() - c.timestamp < 600000);

    const mensagem = `Olá! Vim através do anúncio e gostaria de saber mais.`;
    const linkZap = `https://api.whatsapp.com/send?phone=${MEU_NUMERO_WHATSAPP}&text=${encodeURIComponent(mensagem)}`;
    
    res.redirect(linkZap);
});

// --- ROTA 2: Webhook (Salva na Planilha) ---
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.message?.fromMe || body.fromMe) return res.send('Ignorado');

        const msgTexto = body.message?.body || body.body || ''; 
        const telefoneCliente = body.contact?.phone || body.phone || 'Desconhecido';
        const nomeCliente = body.contact?.name || body.name || 'Desconhecido';

        // Lógica de Janela de Tempo
        const agora = Date.now();
        const janelaTempo = agora - TEMPO_JANELA_MS;
        const indexClique = cliquesPendentes.findIndex(c => 
            c.timestamp > janelaTempo && c.timestamp < agora && !c.usado
        );

        if (indexClique !== -1) {
            const clique = cliquesPendentes[indexClique];
            
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // SALVA NO GOOGLE SHEETS
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Página1!A:F', // Verifique se sua aba chama "Página1" ou "Sheet1"
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[dataHora, nomeCliente, telefoneCliente, clique.origem, clique.campanha, msgTexto]]
                },
            });
            
            cliquesPendentes[indexClique].usado = true;
            console.log(`✅ LEAD SALVO NA PLANILHA: ${nomeCliente}`);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("Erro no webhook:", error);
        res.status(500).send('Erro');
    }
});

// --- ROTA 3: API (Lê da Planilha para o Dashboard) ---
app.get('/api/leads', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Página1!A2:E1000', // Pega da linha 2 até 1000 (ignora cabeçalho)
        });
        
        const rows = response.data.values || [];
        // Formata para JSON bonitinho pro Dashboard
        const leads = rows.map(row => ({
            data: row[0],
            nome: row[1],
            telefone: row[2],
            origem: row[3],
            campanha: row[4]
        })).reverse(); // Mostra os mais novos primeiro

        res.json(leads);
    } catch (error) {
        console.error(error);
        res.status(500).json([]);
    }
});

// --- ROTA 4: Dashboard ---
app.get('/dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Painel Google Sheets Integrado</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="p-4 bg-light">
        <div class="container">
            <h2 class="mb-4">📊 Painel Conectado ao Google Sheets</h2>
            <div class="alert alert-info">Dados salvos automaticamente em: <strong>Leads Rastreador</strong></div>
            
            <div class="row mb-4">
                <div class="col-md-6"><div class="card p-3 bg-primary text-white"><h5>Total Leads</h5><h1 id="total">Carregando...</h1></div></div>
                <div class="col-md-6"><div class="card p-3 bg-success text-white"><h5>Top Origem</h5><h1 id="top">Carregando...</h1></div></div>
            </div>

            <div class="card p-4">
                <div class="d-flex justify-content-between mb-3">
                    <h4>Últimos Registros</h4>
                    <button onclick="carregar()" class="btn btn-sm btn-outline-primary">🔄 Atualizar</button>
                </div>
                <table class="table table-striped">
                    <thead><tr><th>Data</th><th>Nome</th><th>Origem</th><th>Campanha</th></tr></thead>
                    <tbody id="tabela"></tbody>
                </table>
            </div>
        </div>

        <script>
            async function carregar() {
                try {
                    const res = await fetch('/api/leads');
                    const leads = await res.json();
                    
                    document.getElementById('total').innerText = leads.length;
                    
                    // Preenche Tabela
                    const tbody = document.getElementById('tabela');
                    tbody.innerHTML = leads.map(l => 
                        \`<tr><td>\${l.data}</td><td>\${l.nome}</td><td>\${l.origem}</td><td>\${l.campanha}</td></tr>\`
                    ).join('');

                    // Calcula Top Origem
                    if(leads.length > 0) {
                        const counts = {};
                        leads.forEach(l => counts[l.origem] = (counts[l.origem] || 0) + 1);
                        const top = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                        document.getElementById('top').innerText = top;
                    } else {
                         document.getElementById('total').innerText = '0';
                         document.getElementById('top').innerText = '-';
                    }
                } catch(e) { console.error(e); }
            }
            carregar();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rodando na porta ${PORT}`));
