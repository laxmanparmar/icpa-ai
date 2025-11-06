

const fs = require("fs");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { QdrantVectorStore } = require("@langchain/qdrant");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const dotenv = require('dotenv');

dotenv.config();


const FILE_PATH = "./Insurance_Claim_Policy_Example.pdf"; 
const COLLECTION_NAME = "insurance_docs";

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });


async function main() {
  const loader = new PDFLoader(FILE_PATH);
  const rawDocs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });

  const docs = await splitter.splitDocuments(rawDocs);

  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
  });

  docs.forEach((doc, i) => {
    doc.metadata.id = `insurance_claim_policy_example-${i}`;
    doc.metadata.source = 'insurance_claim_policy';
  });

  // Check if collection exists
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some(
    (col) => col.name === COLLECTION_NAME
  );

  // Get embedding dimension (text-embedding-3-small has 1536 dimensions)
  const embeddingDimension = 1536;

  // Create collection if it doesn't exist
  if (!collectionExists) {
    console.log(`Creating collection "${COLLECTION_NAME}"...`);
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: embeddingDimension,
        distance: "Cosine",
      },
    });
    console.log(`✅ Collection "${COLLECTION_NAME}" created`);
  }

  // Create payload index for metadata.source field
  try {
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "metadata.source",
      field_schema: "keyword",
    });
    console.log("✅ Created payload index for metadata.source");
  } catch (error) {
    // Index might already exist, which is fine
    const errorMsg = error.message || error.toString() || "";
    if (errorMsg.includes("already exists") || errorMsg.includes("Bad request")) {
      console.log("ℹ️  Index for metadata.source already exists, skipping creation");
    } else {
      console.warn("Warning: Could not create index:", errorMsg);
      // Continue anyway - index might not be critical for initial setup
    }
  }

  await QdrantVectorStore.fromDocuments(docs, embeddings, {
    collectionName: COLLECTION_NAME,
    client
  });

  console.log(`✅ Uploaded ${docs.length} chunks to collection "${COLLECTION_NAME}" on qdrant Cloud`);
}

main().catch(console.error);
