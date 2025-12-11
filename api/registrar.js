const { google } = require('googleapis');
const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

// --- CONFIGURAÇÃO CHAVE: Variáveis de Ambiente ---
// O Google Sheets API ID é o único que fica aqui, o resto será lido de forma segura pela Vercel.
const PLANILHA_ID = '1gScRMCuIKiaD49zKQ0CmGAkxyV8CB1hO6PoDMta7WKs'; 
const PLANILHA_ABA = 'REGISTRO';
const RH_EMAIL = 'gestaodepessoas@locmed.com.br';
// A Vercel lerá estas variáveis:
const MAILERSEND_API_TOKEN = process.env.MAILERSEND_API_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; 

// A T E N Ç Ã O: SEM CONTA DE SERVIÇO, O REGISTRO SÓ FUNCIONARÁ SE A PLANILHA 
// ESTIVER CONFIGURADA COM PERMISSÃO "QUALQUER PESSOA COM O LINK PODE EDITAR".

// --- INICIALIZAÇÃO DE SERVIÇOS ---
const mailersend = new MailerSend({
    apiKey: MAILERSEND_API_TOKEN,
});

/**
 * Registra todos os ajustes na planilha usando a Google Sheets API.
 * @param {Object[]} ajustesData - Array de ajustes processados.
 */
async function registerAdjustments(ajustesData) {
    // 1. Cria a conexão não-autenticada (ou autenticada por API Key)
    // O uso de `auth: GOOGLE_API_KEY` geralmente só permite leitura.
    // Para escrita sem Conta de Serviço, o acesso deve ser público, mas usaremos
    // a Google API Client para garantir a formatação correta.
    
    // Configura o cliente para usar uma API Key simples (geralmente só leitura)
    // A ESCRITA *APENAS* FUNCIONARÁ SE VOCÊ COMPARTILHAR A PLANILHA COMO PÚBLICA (EDITAR).
    const sheets = google.sheets({
        version: 'v4', 
        auth: GOOGLE_API_KEY // Acesso por API Key, necessário para usar o cliente
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
    const filial = ajustes[0].filial;
    const destinatarios = [RH_EMAIL, emailGestor];
    const assuntoEmail = `AJUSTE DE PONTO - ${filial} - ${ajustes.length} REGISTRO(S)`;

    // 1. Cria o corpo HTML
    let emailBodyHtml = `
      <div style="font-family: Arial, sans-serif; border: 1px solid #ccc; padding: 20px; border-left: 5px solid #cc0000;">
        <h2 style="color: #cc0000;">NOVO(S) AJUSTE(S) DE PONTO REGISTRADO(S)</h2>
        <p>Prezado(a) ${nomeGestor},</p>
        <p>Informamos que ${ajustes.length} novo(s) ajuste(s) de ponto foi(ram) registrado(s) para a filial ${filial}:</p>
    `;

    ajustes.forEach((ajuste, index) => {
        // Adaptação da data para formato brasileiro
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
    const sender = new Sender(process.env.MAILERSEND_SENDER_EMAIL || RH_EMAIL, "Sistema Locmed");
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
        // Exemplo: Se o erro for de autenticação na planilha, a mensagem é crítica.
        if (e.message && e.message.includes('API Key is invalid') || e.message.includes('Insufficient Permission')) {
             return res.status(500).json({ success: false, message: `Erro de PERMISSÃO na Planilha. Verifique se ela está como 'Público: Editor' ou se a GOOGLE_API_KEY está configurada.` });
        }
        res.status(500).json({ success: false, message: `Erro no processamento do Backend. Detalhe: ${e.message}` });
    }
};
