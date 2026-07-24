-- HNSW index for cosine-similarity search over embeddings.vector.
-- Not expressible in schema.prisma (the DSL has no operator-class syntax for
-- vector indexes), so this is hand-written rather than generated.
CREATE INDEX "embeddings_vector_hnsw_idx" ON "embeddings" USING hnsw ("vector" vector_cosine_ops);
