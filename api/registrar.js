const sgMail = require('@sendgrid/mail');
const { Client } = require('pg'); 

// --- CONFIGURAÇÃO: Variáveis de Ambiente ---
// ATENÇÃO: Verifique se este é o e-mail correto para recebimento de alertas do RH.
const RH_EMAIL_RECIPIENT = 'abraao.campos@gmail.com'; 

// Variáveis SendGrid e Neon, lidas do ambiente Vercel
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL; 
const DATABASE_URL = process.env.DATABASE_URL; // URL do PostgreSQL/Neon

// --- INICIALIZAÇÃO DE SERVIÇOS ---
// A chave API do SendGrid é configurada aqui
sgMail.setApiKey(SENDGRID_API_KEY);

// --- FUNÇÕES DE BANCO DE DADOS ---

/**
 * Conecta e registra os ajustes na tabela 'ajustes' no banco de dados PostgreSQL (Neon).
 * @param {Array} ajustesData - Lista de objetos de ajustes a serem inseridos.
 */
async function registerAdjustments(ajustesData) {
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL não está configurada.");
    }
    
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false 
        }
    });

    try {
        await client.connect();

        const query = `
            INSERT INTO ajustes (
                data_registro, 
                filial, 
                email_gestor, 
                nome_gestor, 
                nome_colaborador, 
                data_ajuste,
                horario_ajustado,
                motivo_ajuste
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        // Insere todos os ajustes
        for (const ajuste of ajustesData) {
            await client.query(query, [
                ajuste.dataRegistro,
                ajuste.filial,
                ajuste.emailGestor,
                ajuste.nomeGestor,
                ajuste.nomeColaborador,
                ajuste.data,
                ajuste.horario,
                ajuste.motivo
            ]);
        }

    } catch (error) {
        console.error('Erro ao registrar ajustes no banco de dados:', error);
        throw new Error(`Falha no DB ao registrar: ${error.message}`);
    } finally {
        await client.end();
    }
}

/**
 * Conecta e apaga todos os registros da tabela 'ajustes' no banco de dados (FUNCIONALIDADE RH).
 * @returns {number} O número de registros apagados.
 */
async function clearAllAdjustments() {
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL não está configurada.");
    }
    
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false 
        }
    });

    try {
        await client.connect();
        
        // Comando DELETE que zera todos os registros da tabela 'ajustes'
        const query = `DELETE FROM ajustes;`;
        
        const result = await client.query(query);
        return result.rowCount; // Retorna a contagem de linhas afetadas (registros apagados)

    } catch (error) {
        console.error('Erro ao limpar ajustes do banco de dados:', error);
        throw new Error(`Falha no DB ao limpar: ${error.message}`);
    } finally {
        await client.end();
    }
}

/**
 * Conecta e busca todos os registros para gerar o CSV (FUNCIONALIDADE RH).
 * @returns {Array} Array de objetos contendo todos os registros da tabela 'ajustes'.
 */
async function fetchAllAdjustments() {
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL não está configurada.");
    }

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        const query = `SELECT * FROM ajustes ORDER BY data_registro DESC;`;
        const result = await client.query(query);
        return result.rows; 

    } catch (error) {
        console.error('Erro ao buscar ajustes do banco de dados:', error);
        throw new Error(`Falha no DB ao buscar dados: ${error.message}`);
    } finally {
        await client.end();
    }
}


// --- FUNÇÃO DE E-MAIL ---
async function sendNotificationEmail(ajustesData, gestorEmail, gestorNome) {
    
    // Criando o conteúdo HTML do e-mail
    let contentHtml = `
        <p>Prezado(a) **${RH_EMAIL_RECIPIENT}**,</p>
        <p>O gestor(a) **${gestorNome}** (**${gestorEmail}**) registrou novos ajustes de ponto que precisam de sua atenção e aprovação no sistema.</p>
        <p><strong>Detalhes do registro:</strong></p>
        <hr>
    `;
    
    // Agrupamento por colaborador
    const colaboradores = ajustesData.reduce((acc, current) => {
        const key = current.nomeColaborador;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(current);
        return acc;
    }, {});

    for (const nomeColaborador in colaboradores) {
        contentHtml += `
            <div style="margin-bottom: 20px; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                <h4 style="color: #cc0000; margin-top: 0;">Colaborador: ${nomeColaborador} (${colaboradores[nomeColaborador][0].filial})</h4>
        `;
        
        colaboradores[nomeColaborador].forEach((ajuste, index) => {
            // Formatação da data (a data vem como string 'YYYY-MM-DD' do input)
            const dataFormatada = ajuste.data ? new Date(ajuste.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';

            contentHtml += `
                <p style="margin: 5px 0;"><strong>Ajuste #${index + 1}</strong></p>
                <ul>
                    <li>**Data do Ajuste:** ${dataFormatada}</li>
                    <li>**Horário Ajustado:** ${ajuste.horario}</li>
                    <li>**Motivo:** ${ajuste.motivo.replace(/\n/g, '<br>')}</li>
                </ul>
            `;
        });
        contentHtml += `</div>`;
    }

    contentHtml += `<hr><p>Atenciosamente,<br>Sistema Locmed.</p>`;

    const msg = {
        to: RH_EMAIL_RECIPIENT,
        from: SENDER_EMAIL, 
        subject: `[LOCMED] NOVO REGISTRO DE AJUSTE DE PONTO - ${gestorNome}`,
        html: contentHtml,
    };

    try {
        await sgMail.send(msg);
    } catch (error) {
        console.error('Erro ao enviar e-mail via SendGrid:', error);
        // Não jogamos exceção fatal aqui, pois o registro DB já foi feito
    }
}

// --- FUNÇÃO DE CONVERSÃO PARA CSV ---
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return "data_registro,filial,email_gestor,nome_gestor,nome_colaborador,data_ajuste,horario_ajustado,motivo_ajuste\n";
    }

    const header = Object.keys(data[0]).join(',');
    
    const replacer = (key, value) => value === null ? '' : value; 
    
    const rows = data.map(row => 
        Object.values(row).map(value => {
            let stringValue = ('' + replacer(null, value)).replace(/\n/g, ' ').replace(/"/g, '""');
            if (stringValue.includes(',')) {
                return `"${stringValue}"`;
            }
            return stringValue;
        }).join(',')
    );

    return [header, ...rows].join('\n');
}


// --- FUNÇÃO PRINCIPAL (HANDLER) ---

module.exports = async (req, res) => {
    
    // Roteamento baseado na URL e no método HTTP (Vercel)
    const url = req.url;
    const method = req.method;
    
    // Define o tipo de conteúdo padrão como JSON
    res.setHeader('Content-Type', 'application/json');

    // Rota 1: /api/registrar (Registro de Ajustes - POST)
    if (url === '/api/registrar' && method === 'POST') {
        try {
            const { nomeGestor, emailGestor, filial, ajustesMultiColaborador } = req.body;
            
            if (!ajustesMultiColaborador || ajustesMultiColaborador.length === 0) {
                 return res.status(400).json({ success: false, message: 'Nenhum ajuste foi fornecido.' });
            }

            // 1. Processa os dados
            const dataRegistro = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const todosAjustesFormatados = [];
            
            ajustesMultiColaborador.forEach(colaboradorData => {
                colaboradorData.ajustes.forEach(ajuste => {
                    todosAjustesFormatados.push({
                        // Campos DB
                        dataRegistro,
                        filial,
                        emailGestor,
                        nomeGestor,
                        nomeColaborador: colaboradorData.nomeColaborador,
                        data: ajuste.data, // Data no formato YYYY-MM-DD
                        horario: ajuste.horario,
                        motivo: ajuste.motivo
                    });
                });
            });

            // 2. Registra os dados no PostgreSQL (Neon)
            await registerAdjustments(todosAjustesFormatados);

            // 3. Envia os E-mails (SendGrid)
            await sendNotificationEmail(todosAjustesFormatados, emailGestor, nomeGestor);

            // 4. Resposta de Sucesso
            res.status(200).json({ success: true, message: 'Dados registrados e e-mails enviados com sucesso.' });

        } catch (e) {
            console.error('ERRO FATAL NA VERCEL FUNCTION /api/registrar:', e);
            res.status(500).json({ success: false, message: `Erro interno do servidor: ${e.message}` });
        }
        return;
    }
    
    // Rota 2: /api/limpar (Zerar Registros - DELETE)
    if (url === '/api/limpar' && method === 'DELETE') {
        try {
            // Executa a limpeza do banco de dados
            const count = await clearAllAdjustments();
            
            // 4. Resposta de Sucesso
            res.status(200).json({ success: true, message: 'Registros apagados com sucesso.', count });

        } catch (e) {
            console.error('ERRO FATAL NA VERCEL FUNCTION /api/limpar:', e);
            res.status(500).json({ success: false, message: `Erro interno do servidor ao limpar: ${e.message}` });
        }
        return;
    }

    // Rota 3: /api/download (Download - GET)
    if (url === '/api/download' && method === 'GET') {
        try {
            const data = await fetchAllAdjustments();
            const csv = convertToCSV(data);
            
            // Configura os headers para forçar o download de um arquivo CSV
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="ajustes_ponto_locmed.csv"');
            
            // Envia o CSV como resposta (não retorna JSON)
            return res.status(200).send(csv);

        } catch (e) {
            console.error('ERRO FATAL NA VERCEL FUNCTION /api/download:', e);
            res.status(500).json({ success: false, message: `Erro interno do servidor ao gerar CSV: ${e.message}` });
        }
        return;
    }
    
    // Rota padrão (Método/URL não encontrado)
    res.status(404).json({ success: false, message: 'Endpoint não encontrado.' });
};
