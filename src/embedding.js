require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function generateEmbedding(chunk) {
  const text = `title: ${chunk.name} | text: ${chunk.code}`;

  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text
  });

  return response.embeddings[0].values;
}

async function generateQueryEmbedding(question) {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: question
  });

  return response.embeddings[0].values;
}

module.exports = {
  generateEmbedding,
  generateQueryEmbedding
};