require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

module.exports = pool;

async function insertCodeChunk(chunk, embedding) {
    const query = `
        INSERT INTO code_chunks (
            name,
            type,
            file_path,
            start_line,
            end_line,
            code,
            embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
        RETURNING id;
    `;

    const values = [
        chunk.name,
        chunk.type,
        chunk.filePath,
        chunk.startLine,
        chunk.endLine,
        chunk.code,
        JSON.stringify(embedding)
    ];

    const result = await pool.query(query, values);

    return result.rows[0].id;
}

module.exports = {
    pool,
    insertCodeChunk
};