const { google } = require('googleapis');
const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

// --- CONFIGURAÇÃO: IDs e Nomes Fixos ---
const PLANILHA_ID = '1gScRMCuIKiaD49zKQ0CmGAkxyV8CB1hO6PoDMta7WKs'; 
const PLANILHA_ABA = 'REGISTRO';
const RH_EMAIL_RECIPIENT = 'abraao.campos@gmail.com'; // Email do RH que recebe a notificação

// --- Variáveis de Ambiente (Lidas da Vercel) ---
const MAILERSEND_API_TOKEN = process.env.MAILERSEND_API_TOKEN;
const SENDER_EMAIL = process.env.MAILERSEND_SENDER_EMAIL; // locmed.rhdp@gmail.com
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // AIzaSyBP9Ow1xDmbkvzWE9WYS0zbNRgpF7KWRaw

// --- INICIALIZAÇÃO DE SERVIÇOS ---
// O token do MailerSend é lido da variável de ambiente
const mailersend = new MailerSend({
    apiKey: MAILERSEND_API_TOKEN,
});

/**
 * Registra todos os ajustes na planilha usando a Google Sheets API.
 * ATENÇÃO: Requer que a planilha esteja como "Qualquer pessoa com o link pode EDITAR" 
 * ou a autenticação via API Key falhará na escrita.
 * * @param {Object[]} ajustesData - Array de ajustes processados.
 */
async function registerAdjustments(ajustesData) {
    if (!GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY não está configurada. Não é possível acessar a planilha.");
    }
    
    // Configura o cliente da Google Sheets API
    const sheets = google.sheets({
        version: 'v4', 
        auth: GOOGLE_API_KEY 
    });

    const values = ajustesData.map(ajuste => [
        ajuste.dataRegistro,
        ajuste.filial,
        ajuste.emailGestor,
        ajuste.nomeGestor,
        ajuste.nomeColaborador,
        ajuste.data,
        ajuste.horario,
        ajuste.motivo
    ]);

    const resource = { values };
    
    // Tenta anexar os dados à planilha
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: PLANILHA_ID,
        range: `${PLANILHA_ABA}!A:H`, // Assume 8 colunas de A a H
        valueInputOption: 'USER_ENTERED',
        resource,
    });
    
    return response.data;
}


/**
 * Envia o e-mail de notificação usando a MailerSend API.
 * @param {Object[]} ajustes - Array de objetos de ajuste
 * @param {string} emailGestor - E-mail do gestor
 * @param {string} nomeGestor - Nome do gestor
 */
async function sendNotificationEmail(ajustes, emailGestor, nomeGestor) {
    if (!SENDER_EMAIL) {
        throw new Error("MAILERSEND_SENDER_EMAIL não está configurada. Não é possível enviar e-mail.");
    }

    const filial = ajustes[0].filial;
    const destinatarios = [RH_EMAIL_RECIPIENT, emailGestor];
    const assuntoEmail = `AJUSTE DE PONTO - ${filial} - ${ajustes.length} REGISTRO(S)`;

    // 1. Cria o corpo HTML (mantido o formato anterior)
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
        <p style="margin-top: 20px; font-size: 0.9em; color: #555;">Favor verificar a planilha de controle para confirmar o registro.</p>
        <p>Atenciosamente,<br>Sistema de Registro de Ponto Locmed</p>
      </div>
    `;

    // 2. Cria os objetos de envio para o MailerSend
    const sender = new Sender(SENDER_EMAIL, "Sistema Locmed");
    const recipients = destinatarios.map(email => new Recipient(email));

    const emailParams = new EmailParams()
        .setFrom(sender)
        .setTo(recipients)
        .setReplyTo(sender)
        .setSubject(assuntoEmail)
        .setHtml(emailBodyHtml);

    // 3. Envia o e-mail
    await mailersend.email.send(emailParams);
}


/**
 * Função principal da requisição Vercel (POST).
 */
module.exports = async (req, res) => {
    // Adiciona CORS Headers para permitir requisições do seu frontend
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permite qualquer origem (pode restringir)
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

        if (!ajustesMultiColaborador || ajustesMultiColaborador.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum ajuste fornecido para registro.' });
        }

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

        // 2. Registra os dados na Planilha
        await registerAdjustments(todosAjustesFormatados);

        // 3. Envia os E-mails
        await sendNotificationEmail(todosAjustesFormatados, emailGestor, nomeGestor);

        // 4. Resposta de Sucesso
        res.status(200).json({ success: true, message: 'Dados registrados e e-mails enviados com sucesso.' });

    } catch (e) {
        console.error('ERRO FATAL NA VERCEL FUNCTION:', e);
        res.status(500).json({ success: false, message: `Erro no processamento do Backend. Detalhe: ${e.message}` });
    }
};

