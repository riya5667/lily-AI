import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/embeddings';

// Vapi uses a specific Server URL payload format.
// This endpoint receives messages from Vapi, retrieves context, and returns the response.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;
    
    // Vapi payload type handling
    if (message?.type === 'transcript') {
        return NextResponse.json({ success: true });
    }

    if (message?.type === 'function-call') {
       // Handle tool calling triggered by Vapi (for booking)
       // This would hook into our getAvailability / createBooking logic
       return NextResponse.json({ success: true });
    }

    // Example of a custom LLM route for Vapi (if configured as Custom LLM instead of standard Vapi Assistant)
    if (message?.type === 'conversation-update' || message?.type === 'assistant-request') {
      const lastMessage = message.messages?.[message.messages.length - 1];
      
      let systemPrompt = `You are Lily's AI representative on a phone call. Keep responses extremely concise. Never make up information. Use provided tools for scheduling.`;
      
      if (lastMessage?.role === 'user') {
        const queryEmbedding = await generateEmbedding(lastMessage.content);
        const { data: documents } = await supabaseAdmin.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.7,
          match_count: 3
        });
        
        if (documents && documents.length > 0) {
          const contextText = documents.map((doc: any) => doc.chunk_text).join('\n');
          systemPrompt += `\n\nContext:\n${contextText}`;
        } else {
          systemPrompt += `\n\nIf you don't know the answer, say "I don't have that information in front of me right now."`;
        }
      }
      
      // We would return the payload structure Vapi expects for a Custom LLM response
      return NextResponse.json({
        message: {
           role: 'system',
           content: systemPrompt
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Voice API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
