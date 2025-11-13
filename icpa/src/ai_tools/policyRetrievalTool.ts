import { DynamicStructuredTool } from "@langchain/core/tools";
import z from "zod";
import { QdrantService } from "../services/qdrantService";

export function createPolicyRetrievalTool(
    userId: string,
    qdrantUrl: string,
    openAIApiKey: string,
    qdrantApiKey: string,
    qdrantCollectionName: string,
    source: string
  ): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'retrieve_policies',
      description: `Retrieves company insurance policies from the knowledge base. Use this tool when you need to fetch policy documents for claim evaluation. The tool searches for policies matching the query and source filter.`,
      schema: z.object({
        query: z.string().describe('The search query to find relevant policies (e.g., "company policy", "coverage terms", "claim requirements")'),
        limit: z.number().optional().default(10).describe('Maximum number of policies to retrieve (default: 10)'),
      }),
      func: async ({ query, limit = 10 }) => {
        console.log(`[Tool] Retrieving policies with query: ${query}`);
        
        const qdrantService = new QdrantService(
          qdrantUrl,
          openAIApiKey,
          qdrantCollectionName,
          qdrantApiKey
        );
        
        const policies = await qdrantService.searchPolicies(query, limit, source);
        
        if (policies.length === 0 && userId) {
          console.log(`No policies found with source filter, trying with userId filter...`);
          const policiesWithUserId = await qdrantService.searchPoliciesWithFilter(query, limit, {
            source: source,
            userId: userId,
          });
          policies.push(...policiesWithUserId);
        }
        
        console.log(`[Tool] Retrieved ${policies.length} policies from Qdrant`);
        
        return JSON.stringify({
          retrievedPolicies: policies.length,
          policies: policies.map(p => ({
            id: p.id,
            content: p.content.substring(0, 2000),
            metadata: p.metadata,
            score: p.score,
          })),
        }, null, 2);
      },
    });
  }