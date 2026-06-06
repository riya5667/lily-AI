import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;

    // Vapi End-of-Call Report
    if (message?.type === 'end-of-call-report') {
       const callId = message.call?.id;
       const durationSeconds = message.call?.endedAt && message.call?.startedAt 
            ? (new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000 
            : 0;
            
       const metrics = message.analysis?.metrics;
       const firstResponseLatency = metrics?.firstResponseLatencyMs || 0;
       const transcript = message.artifact?.transcript || "";
       
       // Detect if a booking was successful during the call by checking the transcript or tool call logs
       // This is a naive detection based on the system's output
       const bookingSuccess = transcript.toLowerCase().includes("successfully booked") || transcript.toLowerCase().includes("confirmed your interview");

       await supabaseAdmin.from('voice_metrics').insert({
          call_id: callId || 'unknown',
          first_response_latency_ms: firstResponseLatency,
          transcription_accuracy: 1.0, // Hard to compute without ground truth, assume high or use Vapi's WER if available
          booking_success: bookingSuccess,
       });

       return NextResponse.json({ success: true, message: 'Voice metrics logged' });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Voice Status API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
