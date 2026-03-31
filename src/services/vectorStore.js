import { getDb } from '../db/init.js';
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += (a[i] ?? 0) * (b[i] ?? 0);
        normA += (a[i] ?? 0) ** 2;
        normB += (b[i] ?? 0) ** 2;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
export function saveChunk(sourceFile, chunkIndex, content, embedding) {
    getDb()
        .prepare('INSERT INTO knowledge_chunks (source_file, chunk_index, content, embedding) VALUES (?, ?, ?, ?)')
        .run(sourceFile, chunkIndex, content, JSON.stringify(embedding));
}
export function sourceFileExists(sourceFile) {
    return !!getDb()
        .prepare('SELECT 1 FROM knowledge_chunks WHERE source_file = ? LIMIT 1')
        .get(sourceFile);
}
export function deleteBySourceFile(sourceFile) {
    getDb()
        .prepare('DELETE FROM knowledge_chunks WHERE source_file = ?')
        .run(sourceFile);
}
export function searchSimilar(queryEmbedding, topK = 5) {
    const rows = getDb()
        .prepare('SELECT id, source_file, content, embedding FROM knowledge_chunks')
        .all();
    return rows
        .map(r => ({
        id: r.id,
        sourceFile: r.source_file,
        content: r.content,
        similarity: cosineSimilarity(queryEmbedding, JSON.parse(r.embedding))
    }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}
export function listSources() {
    return getDb()
        .prepare('SELECT source_file as sourceFile, COUNT(*) as chunkCount FROM knowledge_chunks GROUP BY source_file')
        .all();
}
export function totalChunks() {
    const row = getDb().prepare('SELECT COUNT(*) as n FROM knowledge_chunks').get();
    return row.n;
}
//# sourceMappingURL=vectorStore.js.map