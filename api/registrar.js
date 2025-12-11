const sgMail = require('@sendgrid/mail');
const { Client } = require('pg'); 

// --- CONFIGURAÇÃO: Variáveis de Ambiente ---
const RH_EMAIL_RECIPIENT = 'abraao.campos@gmail.com'; 

// Variáveis SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL; 
const DATABASE_URL = process.env.DATABASE_URL; // URL do PostgreSQL/Neon

// --- INICIALIZAÇÃO DE SERVIÇOS ---
// A chave API é configurada aqui
sgMail.setApiKey(SENDGRID_API_KEY);

/**
 * Conecta e registra os ajustes no banco de dados PostgreSQL (Neon).
 */
async function registerAdjustments(ajustesData) {
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL não está configurada.");
    }
    
    // Configura o cliente PostgreSQL
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false 
        }
    });

    try {
        await client.connect();

        // Query INSERT na tabela 'ajustes'
        const query = `
            INSERT INTO ajustes (
                data_registro, 
                filial, 
                email_gestor, 
                nome_gestor, 
                nome_colaborador, 
                data_ajuste, 
                horario_ajuste, 
                motivo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        for (const ajuste of ajustesData) {
            const values = [
                ajuste.dataRegistro,
                ajuste.filial,
                ajuste.emailGestor,
                ajuste.nomeGestor,
                ajuste.nomeColaborador,
                ajuste.data, 
                ajuste.horario, 
                ajuste.motivo
            ];

            await client.query(query, values);
        }

    } catch (error) {
        console.error("Erro ao registrar no PostgreSQL:", error);
        throw new Error(`Falha ao conectar ou registrar no Banco de Dados. Detalhe: ${error.message}`);
    } finally {
        await client.end();
    }
}


/**
 * Envia o e-mail de notificação usando a API do SendGrid.
 */
async function sendNotificationEmail(ajustes, emailGestor, nomeGestor) {
    if (!SENDER_EMAIL || !SENDGRID_API_KEY) {
        throw new Error("Credenciais do SendGrid incompletas. Verifique SENDGRID_API_KEY e SENDGRID_SENDER_EMAIL.");
    }

    const filial = ajustes[0].filial;
    const destinatarios = [RH_EMAIL_RECIPIENT, emailGestor];
    const assuntoEmail = `AJUSTE DE PONTO - ${filial} - ${ajustes.length} REGISTRO(S)`;

    // 1. Corpo HTML 
    let emailBodyHtml = `
      <div style="font-family: Arial, sans-serif; border: 1px solid #ccc; padding: 20px; border-left: 5px solid #cc0000;">
        <h2 style="color: #cc0000;">NOVO(S) AJUSTE(S) DE PONTO REGISTRADO(S)</h2>
        <p>Prezado(a) ${nomeGestor},</p>
        <p>Informamos que ${ajustes.length} novo(s) ajuste(s) de ponto foi(ram) registrado(s) para a filial ${filial}:</p>
    `;

    ajustes.forEach((ajuste, index) => {
        const dataFormatada = new Date(ajuste.data + 'T00:00:00').toLocaleDateString('pt-BR'); 

        emailBodyHtml += `
          <div style="border: 1px solid #eee; padding: 15px; margin: 15px 0; background-color: #f9f9f9; border-radius: 4px;">
            <h3 style="color: #333; margin-top: 0;">Registro #${index + 1} - ${ajuste.nomeColaborador}</h3>
            <p style="margin: 5px 0;"><strong>Colaborador:</strong> ${ajuste.nomeColaborador}</p>
            <p style="margin: 5px 0;"><strong>Data do Ajuste:</strong> ${dataFormatada}</p>
            <p style="margin: 5px 0;"><strong>Horário Ajustado:</strong> ${ajuste.horario}</p>
            <p style="margin: 5px 0;"><strong>Motivo:</strong> ${ajuste.motivo.replace(/\n/g, '<br>')}</p>
            <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #777; border-top: 1px dashed #eee; padding-top: 5px;">Registrado em: ${ajuste.dataRegistro}</p>
          </div>
        `;
    });
    
    emailBodyHtml += `
        <p style="margin-top: 20px; font-size: 0.9em; color: #555;">Atenciosamente,<br>Sistema de Registro de Ponto Locmed</p>
      </div>
    `;

    // 2. Cria o objeto de envio do SendGrid
    const msg = {
        to: destinatarios,
        from: SENDER_EMAIL, // Must be verified in SendGrid
        subject: assuntoEmail,
        html: emailBodyHtml,
    };

    // 3. Tenta Enviar o e-mail e captura o erro detalhado
    try {
        await sgMail.send(msg);
    } catch (error) {
        console.error("ERRO SENDGRID:", error);
        
        let detailMessage = error.message || 'Erro genérico (sem mensagem).';

        // Tenta extrair o detalhe do erro HTTP retornado pelo SendGrid
        if (error.response && error.response.body && error.response.body.errors) {
            detailMessage = error.response.body.errors.map(err => err.message).join(' | ');
        }
        
        throw new Error(`Falha no envio de e-mail (SendGrid). Detalhe: ${detailMessage}`);
    }
}


/**
 * Função principal da requisição Vercel (POST).
 */
module.exports = async (req, res) => {
    // Adiciona CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('Método não permitido. Use POST.');
    }

    try {
        const { nomeGestor, emailGestor, filial, ajustesMultiColaborador } = req.body;
        
        // 1. Processa os dados
        const dataRegistro = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const todosAjustesFormatados = [];
        
        ajustesMultiColaborador.forEach(colaboradorData => {
            colaboradorData.ajustes.forEach(ajuste => {
                todosAjustesFormatados.push({
                    dataRegistro,
                    filial,
                    emailGestor,
                    nomeGestor,
                    nomeColaborador: colaboradorData.nomeColaborador,
                    data: ajuste.data,
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
        console.error('ERRO FATAL NA VERCEL FUNCTION:', e);
        res.status(500).json({ success: false, message: `Erro no processamento do Backend. Detalhe: ${e.message}` });
    }
};
