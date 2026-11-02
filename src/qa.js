require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const {
  generateQueryEmbedding
} = require("./embedding");
const {
  searchSimilarChunks,
  pool,
  createConversation,
  saveMessage,
  getConversationHistory
} = require("./database");
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


function buildContext(chunks) {
  return chunks.map((chunk, index) => {
    const sourceId = `S${index + 1}`;

    return `
[SOURCE ${sourceId}]

Name: ${chunk.name}
Type: ${chunk.type}
File: ${chunk.file_path}
Lines: ${chunk.start_line}-${chunk.end_line}

Code:
${chunk.code}
`;
  }).join("\n--------------------\n");
}
function validateCitations(answer, chunks) {
  const validSourceIds = new Set(
    chunks.map((_, index) => `S${index + 1}`)
  );

  const citedSourceIds = answer.match(/\[S\d+\]/g) || [];

  const invalidCitations = citedSourceIds.filter(
    sourceId => !validSourceIds.has(sourceId.slice(1, -1))
  );

  return {
    valid: invalidCitations.length === 0,
    invalidCitations
  };
}

async function generateAnswer(question, context,history=[]) {

    const conversationHistory = history
  .slice(0, -1)
  .map(message => `${message.role}: ${message.content}`)
  .join("\n");

  const prompt = `
You are a Codebase QA assistant.

Answer the user's question using only the provided code context.

Instructions:
1. Explain the implementation clearly.
2. Use source IDs to identify supporting code.
3. Add citations using this exact format: [S1], [S2].
4. Place citations immediately after the statements they support.
5. Do not cite sources that do not support your statements.
6. Never invent source IDs.
7. If the context is insufficient, clearly say so.
8. Mention relevant file paths and line numbers.

CODE CONTEXT:
${context}

USER QUESTION:
${question}

Previous Conversation:
${conversationHistory || "No previous conversation."}

ANSWER:
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt
  });

  return response.text;
}

async function askQuestion(question,conversationId=null) {
  try {

    // Create a new conversation if no ID is provided
        if (!conversationId) {
        conversationId = await createConversation(
            question.slice(0, 100)
        );

        console.log("New Conversation ID:", conversationId);
        }

        // Save the user's question
        await saveMessage(conversationId, "user", question);

        // Retrieve previous conversation messages
        const history = await getConversationHistory(conversationId);

        console.log("\nConversation History:");
        console.log(history);

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
    // Step 4: Generate answer using Gemini
        const answer = await generateAnswer(question, context,history);

        // Step 5: Validate citations
       const validation = validateCitations(answer, chunks);

        console.log("\nAnswer:\n");

        if (validation.valid) {
          await saveMessage(conversationId, "assistant", answer);
        console.log(answer);
        } else {
        console.log("The answer contains invalid source references.");
        console.log("Invalid citations:", validation.invalidCitations);
        console.log("Please retry the question.");
        }

        if (!validation.valid) {
        console.log("\nWarning: Invalid citations detected:");
        console.log(validation.invalidCitations);
        }

        // Step 6: Display only cited sources
        const citedSourceIds = new Set(
        (answer.match(/\[S\d+\]/g) || []).map(
            id => id.slice(1, -1)
        )
        );

        console.log("\nSources:\n");

        chunks.forEach((chunk, index) => {
        const sourceId = `S${index + 1}`;

        if (citedSourceIds.has(sourceId)) {
            console.log(
            `[${sourceId}] ${chunk.file_path} ` +
            `(Lines ${chunk.start_line}-${chunk.end_line})`
            );
        }
        });
        return { conversationId, answer };

  } catch (error) {
    console.error("Question answering failed:", error.message);
  }
}

async function main() {
  let conversationId = null;

  try {
    // First question: Start a new conversation
    const firstResult = await askQuestion(
      "How does login work?"
    );

    conversationId = firstResult.conversationId;

    // Second question: Continue the same conversation
    await askQuestion(
      "Which file contains the login implementation?",
      conversationId
    );

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}


main();

