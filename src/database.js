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
async function searchKeywordChunks(query, limit = 5) {
  const sql = `
    SELECT
      id,
      name,
      type,
      file_path,
      start_line,
      end_line,
      code,
      ts_rank(search_vector, plainto_tsquery('simple', $1)) AS rank
    FROM code_chunks
    WHERE search_vector @@ plainto_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2;
  `;

  const result = await pool.query(sql, [query, limit]);

  return result.rows;
}

function reciprocalRankFusion(vectorResults, keywordResults, k = 60) {
  const scores = new Map();

  function addResults(results) {
    results.forEach((chunk, index) => {
      const key = chunk.id;

      if (!scores.has(key)) {
        scores.set(key, {
          ...chunk,
          rrfScore: 0
        });
      }

      const current = scores.get(key);

      current.rrfScore += 1 / (k + index + 1);
    });
  }

  addResults(vectorResults);
  addResults(keywordResults);

  return [...scores.values()].sort(
    (a, b) => b.rrfScore - a.rrfScore
  );
}

async function hybridSearch(queryEmbedding, query, limit = 5) {
  const vectorResults = await searchSimilarChunks(
    queryEmbedding,
    10
  );

  const keywordResults = await searchKeywordChunks(
    query,
    10
  );

  const combinedResults = reciprocalRankFusion(
    vectorResults,
    keywordResults
  );

  return combinedResults.slice(0, limit);
}

async function createConversation(title) {
  const query = `
    INSERT INTO conversations (title)
    VALUES ($1)
    RETURNING id;
  `;

  const result = await pool.query(query, [title]);

  return result.rows[0].id;
}
async function saveMessage(conversationId, role, content) {
  const query = `
    INSERT INTO messages (
      conversation_id,
      role,
      content
    )
    VALUES ($1, $2, $3)
    RETURNING id;
  `;

  const values = [conversationId, role, content];

  const result = await pool.query(query, values);

  return result.rows[0].id;
}

async function getConversationHistory(conversationId, limit = 10) {
  const query = `
    SELECT role, content
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2;
  `;

  const result = await pool.query(query, [
    conversationId,
    limit
  ]);

  return result.rows.reverse();
}

module.exports = {
  pool,
  insertCodeChunk,
  codeChunkExists,
  searchSimilarChunks,
  createConversation,
saveMessage,
getConversationHistory,
searchKeywordChunks,
reciprocalRankFusion,
hybridSearch
};