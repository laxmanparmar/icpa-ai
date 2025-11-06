import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";

export interface PolicyDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}

export class QdrantService {
  private vectorStore: QdrantVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private collectionName: string;
  private url: string;
  private apiKey?: string;
  private initPromise: Promise<void>;

  constructor(
    url: string,
    openAIApiKey: string,
    collectionName: string,
    apiKey: string
  ) {
    this.collectionName = collectionName;
    this.url = url;
    this.apiKey = apiKey;
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
    });

    this.initPromise = this.initializeVectorStore();
  }

  private async initializeVectorStore(): Promise<void> {
    if (!this.vectorStore) {
      this.vectorStore = await QdrantVectorStore.fromExistingCollection(
        this.embeddings,
        {
          url: this.url,
          collectionName: this.collectionName,
          apiKey: this.apiKey,
        }
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  async searchPolicies(
    query: string,
    limit: number = 5,
    source: string = 'insurance_claim_policy'
  ): Promise<PolicyDocument[]> {
    try {
      await this.ensureInitialized();
      if (!this.vectorStore) {
        throw new Error('Vector store not initialized');
      }

      console.log(`Searching Qdrant for policies with query: ${query.substring(0, 100)}...`);
      console.log(`Filtering by source: ${source}`);

      // Build Qdrant filter format
      const filter = {
        must: [
          {
            key: 'metadata.source',
            match: { value: source },
          },
        ],
      };

      // Perform similarity search with metadata filter
      const results = await this.vectorStore.similaritySearchWithScore(
        query,
        limit,
        filter
      );

      const policies: PolicyDocument[] = results.map(([document, score]) => ({
        id: document.metadata?.id || '',
        content: document.pageContent,
        metadata: {
          ...document.metadata,
          source: document.metadata?.source || source,
        },
        score: score,
      }));

      console.log(`Found ${policies.length} policies from Qdrant`);
      return policies;
    } catch (error) {
      console.error('Error searching Qdrant:', error);
      // Return empty array on error to continue processing
      return [];
    }
  }

  async searchPoliciesWithFilter(
    query: string,
    limit: number = 5,
    filter?: Record<string, any>
  ): Promise<PolicyDocument[]> {
    try {
      await this.ensureInitialized();
      if (!this.vectorStore) {
        throw new Error('Vector store not initialized');
      }

      console.log(`Searching Qdrant with custom filter:`, filter);

      // Build Qdrant filter format
      const mustConditions: any[] = [];
      
      // Default to source filter if not provided
      const sourceValue = filter?.source || 'insurance_claim_policy';
      mustConditions.push({
        key: 'metadata.source',
        match: { value: sourceValue },
      });

      // Add other filters if provided
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (key !== 'source' && value !== undefined) {
            mustConditions.push({
              key: `metadata.${key}`,
              match: { value },
            });
          }
        });
      }

      const qdrantFilter = {
        must: mustConditions,
      };

      // Perform similarity search with metadata filter
      const results = await this.vectorStore.similaritySearchWithScore(
        query,
        limit,
        qdrantFilter
      );

      const policies: PolicyDocument[] = results.map(([document, score]) => ({
        id: document.metadata?.id || '',
        content: document.pageContent,
        metadata: {
          ...document.metadata,
          ...filter,
        },
        score: score,
      }));

      console.log(`Found ${policies.length} policies from Qdrant with custom filter`);
      return policies;
    } catch (error) {
      console.error('Error searching Qdrant with filter:', error);
      return [];
    }
  }
}
