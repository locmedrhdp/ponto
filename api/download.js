const { Client } = require('pg'); 

// A mesma variável de ambiente DATABASE_URL que você usa no registrar.txt
const DATABASE_URL = process.env.DATABASE_URL; 

/**
 * Converte um array de objetos JSON para o formato CSV.
 * @param {Array<Object>} data - Os dados do banco de dados.
 * @returns {string} - O conteúdo formatado em CSV.
 */
function jsonToCsv(data) {
    if (!data || data.length === 0) {
        return "Nenhum registro encontrado.";
    }

    // 1. Obtém os cabeçalhos (nomes das colunas do banco)
    const headers = Object.keys(data[0]);

    // 2. Formata os cabeçalhos para o CSV, usando ponto-e-vírgula como separador
    // Adicione BOM (Byte Order Mark) para garantir que caracteres acentuados funcionem corretamente no Excel
    const BOM = "\ufeff"; 
    const csvHeaders = headers.map(header => `"${header}"`).join(';');

    // 3. Formata as linhas
    const csvRows = data.map(row => {
        // Mapeia os valores de cada linha
        return headers.map(header => {
            let value = row[header] === null || row[header] === undefined ? '' : row[header];
            
            // Tratamento de caracteres especiais/quebras de linha para evitar quebras no CSV
            if (typeof value === 'string') {
                value = value.replace(/"/g, '""'); // Escapa aspas duplas
                if (value.includes(';') || value.includes('\n') || value.includes(',')) {
                    value = `"${value}"`; // Coloca entre aspas se contiver separadores
                }
            }
            return value;
        }).join(';'); // Junta os valores com ponto-e-vírgula
    }).join('\n'); // Junta as linhas com quebra de linha

    // Retorna o BOM, cabeçalhos e as linhas.
    return BOM + csvHeaders + '\n' + csvRows;
}

/**
 * Endpoint principal da Vercel para /api/download.
 */
module.exports = async (req, res) => {
    // Garante que apenas o método GET é aceito (para links de download)
    if (req.method !== 'GET') {
        return res.status(405).send('Método não permitido. Use GET.');
    }

    if (!DATABASE_URL) {
        return res.status(500).json({ message: 'Erro: DATABASE_URL não está configurada no ambiente.' });
    }

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false 
        }
    });

    try {
        await client.connect();

        // Query que busca todos os registros da tabela 'ajustes'
        const result = await client.query('SELECT * FROM ajustes ORDER BY data_registro DESC');
        
        // 1. Converte os dados para CSV
        const csvContent = jsonToCsv(result.rows);
        
        // 2. Define os cabeçalhos de resposta para forçar o download de um arquivo CSV
        const dataAtual = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const fileName = `registros_locmed_${dataAtual}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        // 3. Envia o conteúdo CSV
        res.status(200).send(csvContent);

    } catch (e) {
        console.error('ERRO FATAL NA VERCEL (DOWNLOAD):', e);
        res.status(500).json({ message: 'Erro interno ao buscar e exportar dados: ' + e.message });
    } finally {
        await client.end();
    }
};
