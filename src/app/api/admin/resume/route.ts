import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding, chunkText } from '@/lib/embeddings';
import { PDFParse } from 'pdf-parse';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Parse PDF
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    const text = pdfData.text;

    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 400 });
    }

    // Chunk text
    const chunks = chunkText(text, 1000, 200);

    // Prepare for DB insertion
    const documents = [];

    for (const chunk of chunks) {
      if (chunk.trim() === '') continue;

      const embedding = await generateEmbedding(chunk);

      documents.push({
        source: file.name,
        source_type: 'resume',
        chunk_text: chunk,
        embedding,
        metadata: {
          original_filename: file.name,
        },
      });
    }

    // Insert chunks to Supabase
    if (documents.length > 0) {
      const { error } = await supabaseAdmin.from('documents').insert(documents);
      
      if (error) {
        console.error('Supabase insert error:', error);
        return NextResponse.json({ error: 'Failed to save documents to database' }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed and saved ${documents.length} chunks from resume.` 
    });

  } catch (error: any) {
    console.error('Resume processing error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
