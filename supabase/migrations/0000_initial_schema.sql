CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  source text NOT NULL,
  source_type text NOT NULL, -- 'resume', 'github_readme', 'commit'
  chunk_text text NOT NULL,
  embedding vector(384),
  metadata jsonb, -- { repo: "...", commit_hash: "...", commit_date: "...", author: "..." }
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE repositories (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  repo_name text NOT NULL,
  repo_url text,
  description text,
  language text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE chat_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE messages (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  confidence_score text, -- 'High', 'Medium', 'Low'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE bookings (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  interviewer_name text NOT NULL,
  email text NOT NULL,
  scheduled_time timestamp with time zone NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE evaluation_logs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  query text NOT NULL,
  retrieved_chunks jsonb NOT NULL,
  answer text NOT NULL,
  grounded boolean,
  retrieval_precision float,
  retrieval_recall float,
  mrr float,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE voice_metrics (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  call_id text NOT NULL,
  first_response_latency_ms integer,
  transcription_accuracy float,
  booking_success boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- pgvector Index (HNSW for speed)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);

-- Similarity search RPC
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  source text,
  source_type text,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.source,
    documents.source_type,
    documents.chunk_text,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;
