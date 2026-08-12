-- LightRAG now owns chunking, embeddings, and vector search.
-- The legacy document_chunks table is no longer referenced by the API.
DROP TABLE IF EXISTS document_chunks CASCADE;
