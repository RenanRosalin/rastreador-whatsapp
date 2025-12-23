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

// --- ROTA 4: DASHBOARD MODERNIZADO ---
app.get('/dashboard', (req, res) => {
    // URL do seu logotipo (clique com botão direito no logo do seu site e copie o endereço da imagem)
    // Se não tiver, ele usa um ícone de viagem padrão.
    const LOGO_URL = "https://cdn-icons-png.flaticon.com/512/826/826070.png"; 

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard | Rosalin Turismo</title>
        
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">

        <style>
            :root {
                /* --- CORES DA MARCA (Edite aqui) --- */
                --primary-color: #003580; /* Azul Viagem */
                --secondary-color: #fca311; /* Laranja destaque */
                --bg-color: #f4f6f9;
                --card-bg: #ffffff;
                --text-main: #2c3e50;
            }

            body { font-family: 'Inter', sans-serif; background-color: var(--bg-color); color: var(--text-main); }
            
            /* Navbar */
            .navbar { background-color: var(--card-bg); box-shadow: 0 2px 10px rgba(0,0,0,0.05); padding: 15px 0; }
            .brand-logo { height: 45px; margin-right: 15px; }
            .brand-text { font-weight: 600; font-size: 1.2rem; color: var(--primary-color); vertical-align: middle; }

            /* Cards (KPIs) */
            .kpi-card {
                background: var(--card-bg);
                border: none;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.02);
                transition: transform 0.2s;
                height: 100%;
                border-left: 5px solid var(--primary-color);
            }
            .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 8px 15px rgba(0,0,0,0.05); }
            .kpi-icon { font-size: 2rem; opacity: 0.2; position: absolute; right: 20px; top: 20px; }
            .kpi-value { font-size: 2rem; font-weight: 700; color: var(--primary-color); margin: 10px 0 0 0; }
            .kpi-label { font-size: 0.9rem; color: #6c757d; text-transform: uppercase; letter-spacing: 1px; }

            /* Filtros */
            .filter-bar { background: var(--card-bg); padding: 20px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 2px 5px rgba(0,0,0,0.03); }
            
            /* Tabela */
            .table-container { background: var(--card-bg); border-radius: 12px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.03); }
            .table thead th { background-color: #f8f9fa; border: none; color: #6c757d; font-weight: 600; }
            .badge-campanha { background-color: var(--primary-color); color: white; padding: 5px 10px; border-radius: 20px; font-size: 0.8em; }
            .badge-origem { background-color: #e9ecef; color: #495057; padding: 5px 10px; border-radius: 4px; font-size: 0.8em; border: 1px solid #ced4da; }

            /* Responsivo */
            @media (max-width: 768px) { .kpi-card { margin-bottom: 15px; } }
        </style>
    </head>
    <body>

        <nav class="navbar mb-4">
            <div class="container">
                <a class="navbar-brand" href="#">
                    <img src="${LOGO_URL}" alt="Logo" class="brand-logo">
                    <span class="brand-text">Rosalin Turismo | Rastreador</span>
                </a>
                <button onclick="carregar()" class="btn btn-outline-primary btn-sm">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>
        </nav>

        <div class="container">
            
            <div class="filter-bar">
                <h6 class="mb-3 text-muted"><i class="fas fa-filter"></i> Filtros de Pesquisa</h6>
                <div class="row g-3">
                    <div class="col-md-3">
                        <label class="form-label small">Data Início</label>
                        <input type="date" id="dataInicio" class="form-control" onchange="aplicarFiltros()">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small">Data Fim</label>
                        <input type="date" id="dataFim" class="form-control" onchange="aplicarFiltros()">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small">Campanha</label>
                        <select id="filtroCampanha" class="form-select" onchange="aplicarFiltros()">
                            <option value="">Todas</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small">Origem</label>
                        <select id="filtroOrigem" class="form-select" onchange="aplicarFiltros()">
                            <option value="">Todas</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="kpi-card" style="border-left-color: var(--primary-color);">
                        <i class="fas fa-users kpi-icon text-primary"></i>
                        <div class="kpi-label">Total de Leads</div>
                        <div class="kpi-value" id="totalDisplay">0</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="kpi-card" style="border-left-color: var(--secondary-color);">
                        <i class="fas fa-bullhorn kpi-icon text-warning"></i>
                        <div class="kpi-label">Melhor Campanha</div>
                        <div class="kpi-value" id="topCampanhaDisplay" style="font-size: 1.5rem; margin-top: 18px;">-</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="kpi-card" style="border-left-color: #28a745;">
                        <i class="fas fa-map-marker-alt kpi-icon text-success"></i>
                        <div class="kpi-label">Melhor Origem</div>
                        <div class="kpi-value" id="topOrigemDisplay" style="font-size: 1.5rem; margin-top: 18px;">-</div>
                    </div>
                </div>
            </div>

            <div class="table-container">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="m-0">📋 Registros Recentes</h5>
                    <span class="badge bg-secondary" id="contadorTabela">0 registros</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead>
                            <tr>
                                <th>Data/Hora</th>
                                <th>Cliente</th>
                                <th>Telefone</th>
                                <th>Origem</th>
                                <th>Campanha</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaBody">
                            <tr><td colspan="5" class="text-center p-4">Carregando dados...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <footer class="mt-5 text-center text-muted small pb-4">
                &copy; 2025 Rosalin Turismo - Sistema Interno de Rastreamento
            </footer>
        </div>

        <script>
            let todosLeads = []; // Guarda todos os dados originais

            async function carregar() {
                try {
                    const btn = document.querySelector('.btn-outline-primary');
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    
                    const res = await fetch('/api/leads');
                    todosLeads = await res.json();
                    
                    // Popula os selects de filtro (apenas valores únicos)
                    popularFiltros(todosLeads);
                    
                    // Aplica filtros (ou mostra tudo se não tiver filtro)
                    aplicarFiltros();
                    
                    btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
                } catch(e) {
                    console.error(e);
                    alert("Erro ao carregar dados. Verifique sua conexão.");
                }
            }

            function popularFiltros(leads) {
                const campanhas = [...new Set(leads.map(l => l.campanha))].sort();
                const origens = [...new Set(leads.map(l => l.origem))].sort();

                const selCampanha = document.getElementById('filtroCampanha');
                const selOrigem = document.getElementById('filtroOrigem');

                // Mantém a seleção atual se houver
                const valorAtualC = selCampanha.value;
                const valorAtualO = selOrigem.value;

                selCampanha.innerHTML = '<option value="">Todas</option>' + campanhas.map(c => \`<option value="\${c}">\${c}</option>\`).join('');
                selOrigem.innerHTML = '<option value="">Todas</option>' + origens.map(o => \`<option value="\${o}">\${o}</option>\`).join('');

                selCampanha.value = valorAtualC;
                selOrigem.value = valorAtualO;
            }

            function aplicarFiltros() {
                const dtInicio = document.getElementById('dataInicio').value;
                const dtFim = document.getElementById('dataFim').value;
                const fCampanha = document.getElementById('filtroCampanha').value;
                const fOrigem = document.getElementById('filtroOrigem').value;

                // FILTRAGEM
                const filtrados = todosLeads.filter(lead => {
                    // Filtro de Texto
                    const matchCampanha = fCampanha ? lead.campanha === fCampanha : true;
                    const matchOrigem = fOrigem ? lead.origem === fOrigem : true;

                    // Filtro de Data (Complexo porque a data vem como string "dd/mm/yyyy")
                    let matchData = true;
                    if (dtInicio || dtFim) {
                        try {
                            // Converte "23/12/2025, 15:30" para Objeto Date
                            const partesData = lead.data.split(',')[0].split('/'); // ["23", "12", "2025"]
                            // Data no formato YYYY-MM-DD para comparação
                            const dataLeadStr = \`\${partesData[2]}-\${partesData[1]}-\${partesData[0]}\`; 
                            
                            if (dtInicio && dataLeadStr < dtInicio) matchData = false;
                            if (dtFim && dataLeadStr > dtFim) matchData = false;
                        } catch(err) { matchData = true; } // Se der erro na data, não filtra
                    }

                    return matchCampanha && matchOrigem && matchData;
                });

                atualizarTela(filtrados);
            }

            function atualizarTela(leads) {
                // 1. Atualiza Tabela
                const tbody = document.getElementById('tabelaBody');
                if (leads.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">Nenhum resultado encontrado para este filtro.</td></tr>';
                } else {
                    tbody.innerHTML = leads.map(l => \`
                        <tr>
                            <td>\${l.data}</td>
                            <td><strong>\${l.nome}</strong></td>
                            <td><a href="https://wa.me/\${l.telefone}" target="_blank" class="text-decoration-none">\${l.telefone}</a></td>
                            <td><span class="badge-origem">\${l.origem}</span></td>
                            <td><span class="badge-campanha">\${l.campanha}</span></td>
                        </tr>
                    \`).join('');
                }

                // 2. Atualiza KPIs
                document.getElementById('contadorTabela').innerText = leads.length + ' registros';
                document.getElementById('totalDisplay').innerText = leads.length;

                // 3. Calcula Tops (Baseado nos dados FILTRADOS)
                if(leads.length > 0) {
                    const getTop = (key) => {
                        const counts = {}; 
                        leads.forEach(l => counts[l[key]] = (counts[l[key]]||0)+1);
                        return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                    };
                    document.getElementById('topCampanhaDisplay').innerText = getTop('campanha');
                    document.getElementById('topOrigemDisplay').innerText = getTop('origem');
                } else {
                    document.getElementById('topCampanhaDisplay').innerText = "-";
                    document.getElementById('topOrigemDisplay').innerText = "-";
                }
            }

            // Inicia
            carregar();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR COMPLETO RODANDO NA PORTA ${PORT}`));

