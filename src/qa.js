require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const {
  generateQueryEmbedding
} = require("./embedding");
const {
  searchSimilarChunks,
  pool
} = require("./database");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


function buildContext(chunks) {
  return chunks.map((chunk, index) => {
    return `
Code Chunk ${index + 1}

Name: ${chunk.name}
Type: ${chunk.type}
File: ${chunk.file_path}
Lines: ${chunk.start_line}-${chunk.end_line}

Code:
${chunk.code}
`;
  }).join("\n--------------------\n");
}

async function generateAnswer(question, context) {
  const prompt = `
You are a Codebase QA assistant.

Answer the user's question using only the provided code context.

Instructions:
1. Explain the code clearly.
2. Mention relevant file paths.
3. Mention line numbers wherever available.
4. Do not invent functions or implementation details.
5. If the provided context is insufficient, clearly say so.

CODE CONTEXT:
${context}

USER QUESTION:
${question}

ANSWER:
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: prompt
  });

  return response.text;
}

async function askQuestion(question) {
  try {
    console.log("\nQuestion:", question);

    // Step 1: Convert question into embedding
    const queryEmbedding = await generateQueryEmbedding(question);

    // Step 2: Retrieve relevant code chunks
    const chunks = await searchSimilarChunks(queryEmbedding, 5);

    console.log("\nRetrieved chunk distances:");

    chunks.forEach((chunk) => {
    console.log(
        chunk.name,
        "->",
        Number(chunk.distance).toFixed(4)
    );
    });

    if (chunks.length === 0) {
      console.log("No relevant code found.");
      return;
    }

    // Step 3: Build context from retrieved chunks
    const context = buildContext(chunks);

    // Step 4: Generate answer using Gemini
    const answer = await generateAnswer(question, context);

    console.log("\nAnswer:\n");
    console.log(answer);

    // Step 5: Display source references
    console.log("\nSources:\n");

    chunks.forEach((chunk, index) => {
      console.log(
        `${index + 1}. ${chunk.file_path} (Lines ${chunk.start_line}-${chunk.end_line})`
      );
    });

  } catch (error) {
    console.error("Question answering failed:", error.message);
  }
}

async function main() {
  try {
    const question = "How is payment processing implemented?";

    await askQuestion(question);

  } finally {
    await pool.end();
  }
}

main();
