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
        name, type, file_path, start_line, end_line, code, embedding
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
    ON CONFLICT (file_path, name, type, start_line, end_line)
    DO NOTHING
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

    return result.rows.length > 0 ? result.rows[0].id : null;
}

async function codeChunkExists(chunk) {
  const query = `
    SELECT 1
    FROM code_chunks
    WHERE file_path = $1
      AND name = $2
      AND type = $3
      AND start_line = $4
      AND end_line = $5
    LIMIT 1;
  `;

  const values = [
    chunk.filePath,
    chunk.name,
    chunk.type,
    chunk.startLine,
    chunk.endLine
  ];

  const result = await pool.query(query, values);

  return result.rowCount > 0;
}

async function searchSimilarChunks(
  queryEmbedding,
  limit = 5,
  maxDistance = 0.50
)  {
  const query = `
    SELECT
    id,
    name,
    type,
    file_path,
    start_line,
    end_line,
    code,
    embedding <=> $1::vector AS distance
  FROM code_chunks
  WHERE embedding <=> $1::vector < $3
  ORDER BY embedding <=> $1::vector
  LIMIT $2;
  `;

 const values = [
  JSON.stringify(queryEmbedding),
  limit,
  maxDistance
];
  const result = await pool.query(query, values);

  return result.rows;
}

module.exports = {
  pool,
  insertCodeChunk,
  codeChunkExists,
  searchSimilarChunks
};