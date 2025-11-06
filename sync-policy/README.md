# Sync Policy

A Node.js application that extracts text from PDF documents, processes them into chunks, generates embeddings using OpenAI, and stores them in a Qdrant vector database for semantic search and retrieval.

## Features

- 📄 PDF text extraction using PDF.js
- ✂️ Intelligent text chunking with configurable size and overlap
- 🤖 OpenAI embeddings generation using `text-embedding-3-small` model
- 🗄️ Vector storage in Qdrant cloud database
- 🔍 Ready for semantic search and retrieval

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Qdrant Cloud account (or self-hosted Qdrant instance)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sync-policy
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
OPENAI_API_KEY=your_openai_api_key
```

## Configuration

Create a `.env` file with the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `QDRANT_URL` | Your Qdrant Cloud URL | Yes |
| `QDRANT_API_KEY` | Your Qdrant API key | Yes |
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |

## Usage

1. Place your PDF file in the root directory (or update the `FILE_PATH` constant in `index.js`)

2. Run the application:
```bash
node index.js
```

The application will:
- Extract text from the PDF file (`Insurance_Claim_Policy_Example.pdf`)
- Split the text into chunks (1000 characters with 100 character overlap)
- Generate embeddings for each chunk
- Upload the embeddings to Qdrant collection named `insurance_docs`


## Configuration Options

You can customize the following in `index.js`:

- `FILE_PATH`: Path to your PDF file
- `COLLECTION_NAME`: Name of the Qdrant collection
- `chunkSize`: Size of text chunks (default: 1000)
- `chunkOverlap`: Overlap between chunks (default: 100)
- Embedding model: Currently using `text-embedding-3-small`

## License

ISC

