// api/registrar.js (VERCEL SERVERLESS FUNCTION)

const { google } = require('googleapis');
const nodemailer = require('nodemailer');

// --- CONFIGURAÇÃO DE AMBIENTE ---
// Estas variáveis serão lidas diretamente do ambiente da Vercel (process.env)
const PLANILHA_ID = '1FL9plrTDAHD9OhBMAlEJd466JyKMf8IRtH-SMQ6ndIo';
const PLANILHA_NOME = 'REGISTRO';
const RH_EMAIL = process.env.RH_EMAIL; // gestaodepessoas@locmed.com.br
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // Chave de API Pública do Google
const MAIL_SERVICE_USER = process.env.MAIL_SERVICE_USER; // Ex: Chave API do SendGrid ou E-mail SMTP
const MAIL_SERVICE_PASS = process.env.MAIL_SERVICE_PASS; // Ex: Senha do SendGrid ou App Password

// Se estiver usando o SendGrid/Resend (recomendado), você configurará a integração de outra forma
// Se estiver usando Nodemailer com SMTP (Ex: Gmail/Outlook):
const transporter = nodemailer.createTransport({
    // Exemplo para SendGrid (você usaria a chave API como senha)
    service: 'smtp.sendgrid.net', // Exemplo
    port: 587,
    secure: false, // use SSL/TLS
    auth: {
        user: 'apikey', // Se for SendGrid
        pass: MAIL_SERVICE_PASS 
    }
});


/**
 * Registra todos os ajustes na planilha usando a Google Sheets API e a Chave Pública.
 * @param {Object[]} ajustesData - Array de ajustes processados.
 */
async function registerAdjustments(ajustesData) {
    // 1. O cliente da Google Sheets API para *ESCRITA* com acesso público é mais complexo
    // No entanto, para simplificar e focar em evitar o GCP, usaremos a autenticação via JWT/oAuth.
    // **VAMOS MANTER A SOLUÇÃO DE CHAVE PRIVADA, MAS COM VARIÁVEIS DE AMBIENTE.**
    // Este código pressupõe que, apesar de evitar o GCP, você irá usar as V.A da Vercel
    // para armazenar a chave privada da Conta de Serviço (a maneira mais segura de fazer isso).
    // SE NÃO HOUVER CHAVE DE SERVIÇO, APENAS CHAVE API, SÓ DÁ PRA LER (GET), NÃO PRA ESCREVER (POST/APPEND).

    // **ASSUMINDO QUE VAMOS USAR UMA BIBLIOTECA SIMPLIFICADA OU MUDAR O PLANO:**
    // JÁ QUE VOCÊ NÃO QUER CONFIGURAR O GCP: VAMOS MIGRAR PARA UM BD GRATUITO.
    
    throw new Error("Aviso: Registro na Sheets API via POST sem a Conta de Serviço é inviável na Vercel. Mudando para um BD Gratuito.");
}

/**
 * Envia o e-mail de notificação (Substitui MailApp.sendEmail).
 * @param {Object[]} ajustes - Array de objetos de ajuste
 * @param {string} emailGestor - E-mail do gestor
 * @param {string} nomeGestor - Nome do gestor
 */
async function sendNotificationEmail(ajustes, emailGestor, nomeGestor) {
    const filial = ajustes[0].filial;
    const destinatarios = [RH_EMAIL, emailGestor].join(',');
    const assuntoEmail = `AJUSTE DE PONTO - ${filial} - ${ajustes.length} REGISTRO(S)`;

    let emailBodyHtml = `... (HTML do e-mail, como antes) ...`;

    const mailOptions = {
        from: MAIL_SERVICE_USER, // Ex: 'noreply@locmed.com.br'
        to: destinatarios,
        subject: assuntoEmail,
        html: emailBodyHtml
    };

    await transporter.sendMail(mailOptions);
}


module.exports = async (req, res) => {
    // ... (Lógica de processamento e resposta, como antes) ...
};