const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIGURAÇÃO ---
const MEU_NUMERO_WHATSAPP = '5514997132879'; // <--- TROQUE PELO SEU NÚMERO
const TEMPO_JANELA_MS = 180000; // 3 minutos de tolerância para o clique

// Memória temporária para guardar os cliques (reinicia se o servidor reiniciar)
let cliquesPendentes = [];

// ROTA 1: O Link do Anúncio (Redirecionador)
// Uso: seusite.com/r?origem=google&campanha=natal
app.get('/r', (req, res) => {
    const { origem, campanha } = req.query;
    
    // 1. Registra o clique
    const novoClique = {
        id: Date.now() + Math.random().toString(36).substr(2, 9), // ID único
        timestamp: Date.now(),
        origem: origem || 'desconhecido',
        campanha: campanha || 'geral',
        usado: false
    };

    cliquesPendentes.push(novoClique);

    // Limpeza: Remove cliques velhos (mais de 10 min) para não encher a memória
    cliquesPendentes = cliquesPendentes.filter(c => Date.now() - c.timestamp < 600000);

    console.log(`[CLIQUE] Novo acesso detectado: ${novoClique.origem} - ${novoClique.campanha}`);

    // 2. Prepara a mensagem e Redireciona
    // Truque: Colocamos um código visível mas discreto, caso o tracking automático falhe
    const codigoRastreio = `ref:${novoClique.origem}-${novoClique.campanha}`;
    const mensagem = `Olá! Vim através do anúncio e gostaria de saber mais.`; 
    // Nota: Tirei o código do texto visível para testarmos a "Janela de Tempo", 
    // mas você pode adicionar se quiser.

    const linkZap = `https://wa.me/${MEU_NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
    res.redirect(linkZap);
});

// ROTA 2: O Webhook (Onde o Megazap avisa que chegou msg)
app.post('/webhook', (req, res) => {
    try {
        console.log("📨 Webhook recebido do Megazap");
        
        // Estrutura padrão do Webhook (pode variar, ajuste conforme logs do Megazap)
        const body = req.body;
        
        // Verificação simples para garantir que temos dados
        // Nota: O Megazap pode enviar estruturas diferentes (wapi, message, etc).
        // Ajuste 'data.message' conforme o console.log mostrar.
        const msgTexto = body.message?.body || body.body || ''; 
        const telefoneCliente = body.contact?.phone || body.phone || 'Desconhecido';
        const nomeCliente = body.contact?.name || body.name || 'Desconhecido';
        
        // Se for mensagem enviada por MIM (da empresa), ignora
        if (body.message?.fromMe || body.fromMe) {
            return res.send('Ignorado: mensagem enviada pela empresa');
        }

        console.log(`👤 Cliente: ${nomeCliente} (${telefoneCliente}) disse: "${msgTexto}"`);

        // --- A MÁGICA DO RASTREAMENTO ---
        let leadRastreado = null;
        let metodo = '';

        // 1. Tenta achar clique pendente recente (Janela de Tempo)
        const agora = Date.now();
        const janelaTempo = agora - TEMPO_JANELA_MS; // x minutos atrás

        // Procura o clique mais recente que ainda não foi "usado" (casado)
        // E que aconteceu ANTES da mensagem chegar
        const indexClique = cliquesPendentes.findIndex(c => 
            c.timestamp > janelaTempo && 
            c.timestamp < agora &&
            !c.usado
        );

        if (indexClique !== -1) {
            // ACHAMOS! É muito provável que seja essa pessoa.
            const clique = cliquesPendentes[indexClique];
            
            leadRastreado = {
                origem: clique.origem,
                campanha: clique.campanha,
                cliente: nomeCliente,
                telefone: telefoneCliente
            };
            metodo = 'Janela de Tempo (Probabilidade)';

            // Marca o clique como usado para não atribuir errado ao próximo
            cliquesPendentes[indexClique].usado = true;
        } else {
            metodo = 'Orgânico (Nenhum clique recente encontrado)';
        }

        if (leadRastreado) {
            console.log(`✅ SUCESSO! Lead Atribuído via ${metodo}`);
            console.log(`🎯 Origem: ${leadRastreado.origem} | Campanha: ${leadRastreado.campanha}`);
            
            // AQUI É ONDE VOCÊ SALVARIA NA PLANILHA OU BANCO DE DADOS
            // Ex: salvarNoGoogleSheets(leadRastreado);
        } else {
            console.log(`⚠️ Lead não rastreado (Orgânico ou fora do tempo).`);
        }

        res.status(200).send('Webhook Recebido');

    } catch (error) {
        console.error('Erro no Webhook:', error);
        res.status(500).send('Erro interno');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));