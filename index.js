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
            .badge-origem { background-color: rgba(255, 255, 255, 0.1); color: var(--text-bright); padding: 4px 10px; border-radius: 6px; font-size: 0.85em; }
            .phone-link { color: var(--accent-cyan); text-decoration: none; font-weight: 600; }
            .phone-link:hover { text-decoration: underline; color: #fff; }

            footer { color: var(--text-muted); border-top: 1px solid var(--border-subtle); }
        </style>
    </head>
    <body>

        <nav class="navbar mb-5">
            <div class="container">
                <a class="navbar-brand d-flex align-items-center" href="#">
                    <img src="${LOGO_URL}" alt="Logo" class="brand-logo">
                    <span class="brand-text text-uppercase">Rosalin Turismo</span>
                </a>
                <button onclick="carregar()" class="btn btn-refresh btn-sm">
                    <i class="fas fa-sync-alt me-2"></i> Atualizar Dados
                </button>
            </div>
        </nav>

        <div class="container">
            
            <div class="content-box">
                <h6 class="section-title"><i class="fas fa-filter me-2"></i> Filtros Avançados</h6>
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
                            <option value="">Todas as Campanhas</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small">Origem</label>
                        <select id="filtroOrigem" class="form-select" onchange="aplicarFiltros()">
                            <option value="">Todas as Origens</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="row mb-4 g-4">
                <div class="col-md-4">
                    <div class="kpi-card kpi-cyan">
                        <i class="fas fa-users kpi-icon-bg"></i>
                        <div class="kpi-label">Total de Leads Filtrados</div>
                        <div class="kpi-value" id="totalDisplay">0</div>
                        <small class="text-muted"><i class="fas fa-chart-line"></i> Visão geral</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="kpi-card kpi-orange">
                        <i class="fas fa-bullhorn kpi-icon-bg"></i>
                        <div class="kpi-label">Top Campanha</div>
                        <div class="kpi-value text-truncate" id="topCampanhaDisplay" style="font-size: 1.8rem; margin-top: 15px;">-</div>
                        <small class="text-muted">Com mais cliques no período</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="kpi-card kpi-cyan">
                        <i class="fas fa-map-marker-alt kpi-icon-bg"></i>
                        <div class="kpi-label">Top Origem</div>
                        <div class="kpi-value text-truncate" id="topOrigemDisplay" style="font-size: 1.8rem; margin-top: 15px;">-</div>
                        <small class="text-muted">Plataforma principal</small>
                    </div>
                </div>
            </div>

            <div class="content-box">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h5 class="m-0 text-bright"><i class="fas fa-list me-2"></i> Últimos Registros</h5>
                    <span class="badge bg-dark border border-secondary" id="contadorTabela" style="color: var(--text-muted)">0 leads</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-dark-custom table-hover align-middle mb-0">
                        <thead>
                            <tr>
                                <th style="width: 20%">Data/Hora</th>
                                <th style="width: 25%">Cliente</th>
                                <th style="width: 20%">Telefone (WhatsApp)</th>
                                <th style="width: 15%">Origem</th>
                                <th style="width: 20%">Campanha</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaBody">
                            <tr><td colspan="5" class="text-center p-5 text-muted"><i class="fas fa-spinner fa-spin fa-2x mb-3"></i><br>Carregando dados da planilha...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <footer class="mt-5 text-center pt-4 pb-5 mb-3">
                <small>
                    &copy; 2025 <strong>Rosalin Turismo</strong> <br> 
                    Sistema de Performance de Anúncios | Desenvolvido internamente.
                </small>
            </footer>
        </div>

        <script>
            let todosLeads = [];

            async function carregar() {
                try {
                    const btn = document.querySelector('.btn-refresh');
                    const icone = btn.querySelector('i');
                    icone.classList.remove('fa-sync-alt');
                    icone.classList.add('fa-spinner', 'fa-spin');
                    
                    const res = await fetch('/api/leads');
                    todosLeads = await res.json();
                    
                    popularFiltros(todosLeads);
                    aplicarFiltros();
                    
                    icone.classList.remove('fa-spinner', 'fa-spin');
                    icone.classList.add('fa-sync-alt');
                } catch(e) {
                    console.error(e);
                    document.getElementById('tabelaBody').innerHTML = '<tr><td colspan="5" class="text-center p-4 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Erro ao carregar dados. Tente atualizar a página.</td></tr>';
                }
            }

            function popularFiltros(leads) {
                const campanhas = [...new Set(leads.map(l => l.campanha).filter(Boolean))].sort();
                const origens = [...new Set(leads.map(l => l.origem).filter(Boolean))].sort();

                const selCampanha = document.getElementById('filtroCampanha');
                const selOrigem = document.getElementById('filtroOrigem');
                const valorAtualC = selCampanha.value;
                const valorAtualO = selOrigem.value;

                selCampanha.innerHTML = '<option value="">Todas as Campanhas</option>' + campanhas.map(c => \`<option value="\${c}">\${c}</option>\`).join('');
                selOrigem.innerHTML = '<option value="">Todas as Origens</option>' + origens.map(o => \`<option value="\${o}">\${o}</option>\`).join('');

                selCampanha.value = valorAtualC;
                selOrigem.value = valorAtualO;
            }

            function aplicarFiltros() {
                const dtInicio = document.getElementById('dataInicio').value;
                const dtFim = document.getElementById('dataFim').value;
                const fCampanha = document.getElementById('filtroCampanha').value;
                const fOrigem = document.getElementById('filtroOrigem').value;

                const filtrados = todosLeads.filter(lead => {
                    const matchCampanha = fCampanha ? lead.campanha === fCampanha : true;
                    const matchOrigem = fOrigem ? lead.origem === fOrigem : true;
                    let matchData = true;
                    if ((dtInicio || dtFim) && lead.data) {
                        try {
                            const partesData = lead.data.split(',')[0].split('/');
                            const dataLeadStr = \`\${partesData[2]}-\${partesData[1]}-\${partesData[0]}\`; 
                            if (dtInicio && dataLeadStr < dtInicio) matchData = false;
                            if (dtFim && dataLeadStr > dtFim) matchData = false;
                        } catch(err) { matchData = true; }
                    }
                    return matchCampanha && matchOrigem && matchData;
                });

                atualizarTela(filtrados);
            }

            function atualizarTela(leads) {
                const tbody = document.getElementById('tabelaBody');
                if (leads.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-5 text-muted"><i class="fas fa-search fa-2x mb-3 opacity-50"></i><br>Nenhum resultado encontrado para os filtros selecionados.</td></tr>';
                } else {
                    tbody.innerHTML = leads.map(l => \`
                        <tr>
                            <td class="text-muted small">\${l.data}</td>
                            <td><strong class="text-bright">\${l.nome}</strong></td>
                            <td><a href="https://wa.me/\${l.telefone.replace(/[^0-9]/g,'')}" target="_blank" class="phone-link"><i class="fab fa-whatsapp me-1"></i> \${l.telefone}</a></td>
                            <td><span class="badge-origem">\${l.origem}</span></td>
                            <td><span class="badge-campanha">\${l.campanha}</span></td>
                        </tr>
                    \`).join('');
                }

                document.getElementById('contadorTabela').innerText = leads.length + ' leads';
                document.getElementById('totalDisplay').innerText = leads.length;

                if(leads.length > 0) {
                    const getTop = (key) => {
                        const counts = {}; 
                        leads.filter(l => l[key]).forEach(l => counts[l[key]] = (counts[l[key]]||0)+1);
                        const sorted = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                        return sorted.length > 0 ? sorted[0] : "-";
                    };
                    document.getElementById('topCampanhaDisplay').innerText = getTop('campanha');
                    document.getElementById('topOrigemDisplay').innerText = getTop('origem');
                } else {
                    document.getElementById('topCampanhaDisplay').innerText = "-";
                    document.getElementById('topOrigemDisplay').innerText = "-";
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



