'use client';

import { useChat } from '@ai-sdk/react';
import { useConversation, ConversationProvider } from '@elevenlabs/react';
import { useEffect, useRef, useState } from 'react';
import { fetchGithubProjectsAction, fetchAvailabilityAction } from './actions';

// ── Language badge colors ─────────────────────────────────────────────────────
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1a32b',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  Ruby: '#701516',
  Swift: '#ffac45',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
};

const getLangColor = (lang: string) => LANG_COLORS[lang] || '#888';

const NAV_ITEMS = [
  {
    id: 'chat', label: 'Chat',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  },
  {
    id: 'projects', label: 'Projects',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
  },
  {
    id: 'experience', label: 'Experience',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
  },
  {
    id: 'skills', label: 'Skills',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
  },
  {
    id: 'schedule', label: 'Schedule',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  },
  {
    id: 'about', label: 'About Lily',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
  },
];

function ChatInner() {
  const [inputValue, setInputValue] = useState('');
  const [selectedMenu, setSelectedMenu] = useState('chat');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'error' | 'warning' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // ── Voice Conversation ──
  const conversation = useConversation({
    onConnect: () => showToast('Voice connection established!', 'warning'), // using warning style for info temporarily
    onDisconnect: () => console.log('Disconnected from voice'),
    onError: (error: any) => showToast(typeof error === 'string' ? error : error.message || 'Voice error', 'error'),
    clientTools: {
      getGithubProjects: async (parameters: any) => {
        try {
          const res = await fetchGithubProjectsAction(parameters);
          if (res.error) return `Error fetching projects: ${res.error}`;
          if (res.focusRepo) return `Readme for ${res.focusRepo}:\n${res.readme.substring(0, 500)}`;
          if (res.repos?.length > 0) {
            const list = res.repos.slice(0, 10).map((r: any) => `${r.name} (${r.language || 'Unknown'}) - ${r.description || 'No description'}`).join('; ');
            return `Found ${res.totalFound} projects. Here are some of them: ${list}. Please read these to the user naturally.`;
          }
          return "No projects found.";
        } catch (e) { return "Failed to fetch projects."; }
      },
      getAvailability: async (parameters: any) => {
        try {
          const res = await fetchAvailabilityAction(parameters);
          if (res.availableSlots) {
            return `Here are the available time slots in UTC: ${res.availableSlots.join(', ')}. Please read them clearly to the user.`;
          }
          return "No availability found.";
        } catch (e) { return "Failed to fetch availability."; }
      }
    }
  });

  const toggleVoice = async () => {
    if (conversation.status === 'connected') {
      await conversation.endSession();
    } else {
      const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
      if (!agentId || agentId === 'your_agent_id_here') {
        showToast('Please add NEXT_PUBLIC_ELEVENLABS_AGENT_ID to .env.local', 'error');
        return;
      }
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        await conversation.startSession({ agentId });
      } catch (err: any) {
        showToast('Microphone access denied or error starting voice call', 'error');
      }
    }
  };

  const { messages, sendMessage, status } = useChat({
    onError: (error: any) => {
      const msg = error?.message || '';
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('rate_limit')) {
        showToast('Groq rate limit hit — please wait ~1 hour and try again.', 'warning');
      } else {
        showToast('Something went wrong. Please try again.', 'error');
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length === 0) { setSelectedMenu('chat'); return; }
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    const t = lastUser.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('').toLowerCase() || '';
    if (t.includes('project') || t.includes('github') || t.includes('repo')) setSelectedMenu('projects');
    else if (t.includes('experience') || t.includes('work') || t.includes('intern') || t.includes('autonmis')) setSelectedMenu('experience');
    else if (t.includes('skill') || t.includes('tool') || t.includes('tech')) setSelectedMenu('skills');
    else if (t.includes('schedule') || t.includes('interview') || t.includes('book')) setSelectedMenu('schedule');
    else if (t.includes('about lily') || t.includes('who is')) setSelectedMenu('about');
    else setSelectedMenu('chat');
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInputValue('');
    sendMessage({ text: trimmed });
  };

  const handleMenuClick = (id: string) => {
    setSelectedMenu(id);
    const actions: Record<string, string> = {
      projects: 'Show me her GitHub projects',
      experience: 'Tell me about her experience',
      skills: 'What AI tools and skills does she have?',
      schedule: 'Schedule an interview',
      about: 'Tell me about Lily',
    };
    if (actions[id]) send(actions[id]);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'row',
      background: '#fdf4f7', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#1a0a12', position: 'relative',
    }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-5px);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes pulseRing { 0%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(233,30,140,0.7);} 70%{transform:scale(1);box-shadow:0 0 0 10px rgba(233,30,140,0);} 100%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(233,30,140,0);} }
        @keyframes slideIn { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(233,30,140,0.2); border-radius:4px; }
        input:focus { outline:none; box-shadow:0 0 0 2px rgba(233,30,140,0.2); }
        .nav-btn:hover { background:rgba(233,30,140,0.07) !important; color:#e91e8c !important; }
        .repo-card:hover { border-color:rgba(233,30,140,0.35) !important; box-shadow:0 4px 16px rgba(233,30,140,0.08) !important; }
        .send-btn:hover:not(:disabled) { background:#c9196e !important; }
        .hire-btn:hover { background:#c9196e !important; }
        .suggest-btn:hover { background:rgba(233,30,140,0.1) !important; border-color:rgba(233,30,140,0.5) !important; }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          maxWidth: '340px', borderRadius: '14px', padding: '0.85rem 1rem',
          background: toast.type === 'warning' ? '#fffbeb' : '#fff0f3',
          border: `1px solid ${toast.type === 'warning' ? '#fcd34d' : '#fda4af'}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
          animation: 'slideIn 0.3s ease',
        }}>
          <span style={{ fontSize: '1.1rem' }}>{toast.type === 'warning' ? '⏳' : '⚠️'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: toast.type === 'warning' ? '#92400e' : '#be123c', marginBottom: '0.15rem' }}>
              {toast.type === 'warning' ? 'Rate Limit Reached' : 'Error'}
            </div>
            <div style={{ fontSize: '0.75rem', color: toast.type === 'warning' ? '#b45309' : '#be123c', lineHeight: 1.5 }}>
              {toast.message}
            </div>
          </div>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#aaa', padding: 0 }}>✕</button>
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: '155px', flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid rgba(233,30,140,0.1)',
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 1rem',
        justifyContent: 'space-between',
      }}>
        {/* Branding */}
        <div>
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{
              fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.1,
              background: 'linear-gradient(135deg, #e91e8c 0%, #ff6eb4 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}>
              Lily&apos;s<br />Space
            </div>
            <div style={{ fontSize: '0.7rem', color: '#b08090', marginTop: '0.3rem', fontWeight: 500 }}>
              AI Digital Companion
            </div>
          </div>

          {/* Nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {NAV_ITEMS.map(item => {
              const active = selectedMenu === item.id;
              return (
                <button
                  key={item.id}
                  className="nav-btn"
                  onClick={() => handleMenuClick(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    width: '100%', padding: '0.55rem 0.75rem',
                    borderRadius: '10px', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: active ? 700 : 500,
                    color: active ? '#e91e8c' : '#7a5060',
                    background: active ? 'rgba(233,30,140,0.09)' : 'transparent',
                    textAlign: 'left', transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom - Hire Lily */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.6rem 0.5rem', marginBottom: '0.75rem',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #e91e8c, #ff6eb4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.85rem', flexShrink: 0, color: '#fff',
            }}>L</div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a0a12' }}>Hire Lily</div>
              <div style={{ fontSize: '0.65rem', color: '#22c55e', fontWeight: 500 }}>Available for roles</div>
            </div>
          </div>
          <button
            className="hire-btn"
            onClick={() => send('I want to schedule an interview with Lily')}
            style={{
              width: '100%', padding: '0.65rem',
              background: '#e91e8c', color: '#fff',
              border: 'none', borderRadius: '12px',
              fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', transition: 'background 0.2s',
              fontFamily: 'inherit', letterSpacing: '0.01em',
            }}
          >
            Hire Lily
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden', position: 'relative',
      }}>
        {/* Decorative sparkles */}
        <div style={{ position: 'absolute', top: '1.2rem', right: '2rem', zIndex: 0, pointerEvents: 'none' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M24 4 L26 20 L44 24 L26 28 L24 44 L22 28 L4 24 L22 20 Z" fill="rgba(233,30,140,0.12)" />
          </svg>
        </div>
        <div style={{ position: 'absolute', top: '3rem', right: '4.5rem', zIndex: 0, pointerEvents: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1 L9 6.5 L15 8 L9 9.5 L8 15 L7 9.5 L1 8 L7 6.5 Z" fill="rgba(233,30,140,0.18)" />
          </svg>
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '1.75rem 2rem 1rem', flexShrink: 0, position: 'relative', zIndex: 1,
        }}>
          {/* Avatar */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #fce4ec, #f8bbd0)',
            border: '3px solid rgba(233,30,140,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '0.4rem', position: 'relative',
            boxShadow: '0 4px 20px rgba(233,30,140,0.12)',
            animation: conversation.status === 'connected' ? 'pulseRing 2s infinite' : 'none',
          }}>
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
              <circle cx="20" cy="20" r="18" fill="#fce4ec" />
              <path d="M20 10 C20 10 13 16 13 22 C13 26 16 29 20 29 C24 29 27 26 27 22 C27 16 20 10 20 10Z" fill="#e91e8c" opacity="0.7"/>
              <path d="M20 10 C20 10 15 14 17 20 C18 23 20 25 20 25 C20 25 22 23 23 20 C25 14 20 10 20 10Z" fill="#e91e8c"/>
              <path d="M14 17 C12 19 12 22 14 24" stroke="#e91e8c" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
              <path d="M26 17 C28 19 28 22 26 24" stroke="#e91e8c" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            </svg>
            {/* ~lily~ tag */}
            <div style={{
              position: 'absolute', bottom: '-10px',
              background: '#fff', border: '1px solid rgba(233,30,140,0.3)',
              borderRadius: '999px', padding: '0.12rem 0.55rem',
              fontSize: '0.62rem', color: '#e91e8c', fontWeight: 700,
              whiteSpace: 'nowrap', fontFamily: 'monospace',
              boxShadow: '0 2px 6px rgba(233,30,140,0.1)',
            }}>~lily~</div>
          </div>

          <h1 style={{
            marginTop: '0.9rem', fontSize: '1.55rem', fontWeight: 800,
            color: '#1a0a12', letterSpacing: '-0.02em', textAlign: 'center',
          }}>
            Lily&apos;s <span style={{ color: '#e91e8c' }}>AI Representative</span>
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#7a5060', marginTop: '0.3rem', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5 }}>
            Ask about her experience, projects, or schedule an interview. I&apos;m her digital companion ready to help!
          </p>
        </div>

        {/* Chat window */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          margin: '0 1.5rem 0', minHeight: 0,
          background: '#fff',
          border: '1px solid rgba(233,30,140,0.12)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 4px 24px rgba(233,30,140,0.05)',
          overflow: 'hidden',
        }}>
          {conversation.status === 'connected' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #fff, #fdf4f7)' }}>
              <div style={{
                width: '140px', height: '140px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #fce4ec, #f8bbd0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'pulseRing 2s infinite',
                boxShadow: '0 8px 32px rgba(233,30,140,0.2)',
                marginBottom: '2rem', border: '4px solid rgba(233,30,140,0.1)'
              }}>
                <span style={{ fontSize: '4rem' }}>✨</span>
              </div>
              <h2 style={{ color: '#e91e8c', marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700, animation: 'pulse 2s infinite' }}>Voice Active</h2>
              <p style={{ color: '#7a5060', marginBottom: '3rem', fontSize: '0.9rem' }}>Speak directly to Lily&apos;s AI Representative</p>
              
              <button onClick={toggleVoice} style={{
                padding: '1rem 2.5rem', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: '999px', fontSize: '1.05rem', fontWeight: 600,
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'transform 0.1s'
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                End Conversation
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '1.25rem',
                display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0,
              }}>
                {messages.length === 0 ? (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '2rem',
                  }}>
                    {/* Featured action button */}
                    <button
                      className="suggest-btn"
                      onClick={() => send('Show me her GitHub projects')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.7rem 1.4rem',
                        background: '#e91e8c', color: '#fff',
                        border: '1px solid transparent', borderRadius: '999px',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'background 0.2s',
                        boxShadow: '0 4px 16px rgba(233,30,140,0.25)',
                      }}
                    >
                      🐾 Show me her GitHub projects
                    </button>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                      {[
                        '💼 Tell me about her experience',
                        '🧠 What AI tools has she used?',
                        '📅 Schedule an interview',
                      ].map(s => (
                        <button
                          key={s}
                          className="suggest-btn"
                          onClick={() => send(s.replace(/^[^\s]+\s/, ''))}
                          style={{
                            padding: '0.45rem 0.9rem',
                            border: '1px solid rgba(233,30,140,0.25)',
                            borderRadius: '999px',
                            background: 'rgba(233,30,140,0.05)',
                            color: '#e91e8c', fontSize: '0.78rem', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                          }}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map(m => {
                      const text = m.parts?.filter((p: any) => p.type === 'text').map((p: any) => (p as any).text).join('') || '';
                      const tools = m.parts?.filter((p: any) => p.type?.startsWith('tool-') || p.type === 'dynamic-tool').map((p: any) => ({
                        toolCallId: p.toolCallId,
                        toolName: p.type === 'dynamic-tool' ? p.toolName : p.type.replace('tool-', ''),
                        state: p.state,
                        result: p.output,
                        errorText: p.errorText,
                      })) || [];
    
                      const isUser = m.role === 'user';
                  const hasRepoCards = !isUser && tools.some(
                    (t: any) => t.toolName === 'getGithubProjects' && t.result?.repos?.length > 0 &&
                      (t.state?.startsWith('result') || t.state?.startsWith('output-'))
                  );
                  const showText = text && (!hasRepoCards || isUser);

                  return (
                    <div key={m.id} style={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      alignItems: 'flex-start', gap: '0.6rem',
                      animation: 'fadeUp 0.2s ease',
                    }}>
                      {/* Avatar */}
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                        background: isUser
                          ? 'linear-gradient(135deg,#e91e8c,#ff6eb4)'
                          : 'linear-gradient(135deg,#fce4ec,#f8bbd0)',
                        border: isUser ? 'none' : '1px solid rgba(233,30,140,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', color: isUser ? '#fff' : '#e91e8c',
                        boxShadow: isUser ? '0 2px 8px rgba(233,30,140,0.2)' : 'none',
                      }}>
                        {isUser ? '👤' : '✨'}
                      </div>

                      {/* Content */}
                      <div style={{
                        maxWidth: '82%', display: 'flex', flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start', gap: '0.4rem',
                      }}>
                        {/* Text bubble */}
                        {showText && (
                          <div style={{
                            background: isUser ? '#e91e8c' : '#fff',
                            color: isUser ? '#fff' : '#1a0a12',
                            border: isUser ? 'none' : '1px solid rgba(233,30,140,0.12)',
                            padding: '0.65rem 1rem', borderRadius: '16px',
                            borderBottomLeftRadius: isUser ? '16px' : '4px',
                            borderBottomRightRadius: isUser ? '4px' : '16px',
                            fontSize: '0.87rem', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            boxShadow: isUser ? '0 4px 12px rgba(233,30,140,0.2)' : '0 1px 4px rgba(0,0,0,0.03)',
                          }}>
                            {text}
                          </div>
                        )}

                        {/* Tool outputs */}
                        {tools.map((tool: any) => {
                          const isSuccess = tool.state?.startsWith('result') || (tool.state?.startsWith('output-') && tool.state !== 'output-error');
                          const isError = tool.state === 'output-error' || tool.state === 'error';

                          return (
                            <div key={tool.toolCallId} style={{ width: '100%' }}>
                              {/* Status pill */}
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.2rem 0.6rem', borderRadius: '999px', marginBottom: '0.5rem',
                                fontSize: '0.7rem', fontWeight: 600,
                                background: isSuccess
                                  ? 'rgba(233,30,140,0.07)'
                                  : isError
                                    ? 'rgba(239,68,68,0.07)'
                                    : 'rgba(233,30,140,0.05)',
                                border: isSuccess
                                  ? '1px solid rgba(233,30,140,0.25)'
                                  : isError
                                    ? '1px solid rgba(239,68,68,0.2)'
                                    : '1px solid rgba(233,30,140,0.15)',
                                color: isSuccess ? '#e91e8c' : isError ? '#dc2626' : '#b06080',
                              }}>
                                {isSuccess ? '✓' : isError ? '⚠️' : '⏳'}
                                &nbsp;
                                {tool.toolName === 'getGithubProjects'
                                  ? isSuccess ? 'GitHub repos loaded' : isError ? 'Error loading repos' : 'Loading repos...'
                                  : tool.toolName === 'getAvailability'
                                    ? isSuccess ? 'Calendar checked' : 'Checking availability...'
                                    : tool.toolName === 'createBooking'
                                      ? 'Interview booked!'
                                      : isSuccess ? 'Done' : 'Running...'}
                              </div>

                              {/* GitHub repo cards (2-column grid) */}
                              {tool.toolName === 'getGithubProjects' && isSuccess && (
                                <div>
                                  {tool.result?.error ? (
                                    <div style={{ color: '#dc2626', fontSize: '0.82rem' }}>Error: {tool.result.error}</div>
                                  ) : tool.result?.focusRepo ? (
                                    // Single project card
                                    <div style={{
                                      background: '#fff', border: '1px solid rgba(233,30,140,0.15)',
                                      borderRadius: '14px', padding: '1rem',
                                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                    }}>
                                      <div style={{ fontWeight: 700, color: '#e91e8c', fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                                        {tool.result.focusRepo}
                                      </div>
                                      {tool.result.repos?.[0]?.description && (
                                        <div style={{ fontSize: '0.8rem', color: '#7a5060', lineHeight: 1.4, marginBottom: '0.5rem' }}>
                                          {tool.result.repos[0].description}
                                        </div>
                                      )}
                                      {tool.result.readme && (
                                        <div style={{
                                          fontSize: '0.76rem', color: '#1a0a12', lineHeight: 1.5,
                                          background: '#fdf4f7', padding: '0.5rem', borderRadius: '8px',
                                          maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                                          marginBottom: '0.5rem', border: '1px solid rgba(233,30,140,0.08)',
                                        }}>
                                          {tool.result.readme.substring(0, 300)}...
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {tool.result.repos?.[0]?.language && (
                                          <span style={{
                                            background: `${getLangColor(tool.result.repos[0].language)}18`,
                                            color: getLangColor(tool.result.repos[0].language),
                                            padding: '0.1rem 0.45rem', borderRadius: '4px',
                                            fontSize: '0.68rem', fontWeight: 700,
                                            border: `1px solid ${getLangColor(tool.result.repos[0].language)}30`,
                                          }}>
                                            {tool.result.repos[0].language.toUpperCase()}
                                          </span>
                                        )}
                                        <a href={tool.result.repos?.[0]?.url} target="_blank" rel="noopener noreferrer"
                                          style={{ fontSize: '0.72rem', color: '#e91e8c', textDecoration: 'none', fontWeight: 600 }}>
                                          View Source →
                                        </a>
                                      </div>
                                    </div>
                                  ) : tool.result?.repos?.length > 0 ? (
                                    // Full repo grid
                                    <div>
                                      {/* 2-column grid */}
                                      <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                                        gap: '0.6rem', maxHeight: '420px', overflowY: 'auto',
                                      }}>
                                        {tool.result.repos.map((repo: any) => (
                                          <div
                                            key={repo.name}
                                            className="repo-card"
                                            style={{
                                              background: '#fff',
                                              border: '1px solid rgba(233,30,140,0.12)',
                                              borderRadius: '12px', padding: '0.75rem',
                                              transition: 'all 0.15s',
                                              boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                              <div style={{
                                                fontWeight: 700, color: '#e91e8c', fontSize: '0.78rem',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                              }}>
                                                {repo.name}
                                              </div>
                                              {repo.language && (
                                                <span style={{
                                                  background: `${getLangColor(repo.language)}15`,
                                                  color: getLangColor(repo.language),
                                                  padding: '0.08rem 0.35rem', borderRadius: '3px',
                                                  fontSize: '0.58rem', fontWeight: 800, flexShrink: 0,
                                                  border: `1px solid ${getLangColor(repo.language)}25`,
                                                  letterSpacing: '0.02em',
                                                }}>
                                                  {repo.language.toUpperCase()}
                                                </span>
                                              )}
                                            </div>
                                            <div style={{
                                              fontSize: '0.72rem', color: '#7a5060', lineHeight: 1.4,
                                              marginBottom: '0.5rem', minHeight: '2.4em',
                                              overflow: 'hidden', display: '-webkit-box',
                                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                            }}>
                                              {repo.description || 'No description provided.'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                              <span style={{ fontSize: '0.68rem', color: '#b08090', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                ⭐ {repo.stars ?? 0}
                                              </span>
                                              <a
                                                href={repo.url} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: '0.7rem', color: '#e91e8c', textDecoration: 'none', fontWeight: 600 }}
                                              >
                                                View Source →
                                              </a>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      {/* Footer count */}
                                      <div style={{
                                        marginTop: '0.6rem', fontSize: '0.73rem', color: '#b08090',
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                      }}>
                                        📋 {tool.result.totalFound || tool.result.repos.length} Repositories total
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.82rem', color: '#7a5060' }}>No repositories found.</div>
                                  )}
                                </div>
                              )}

                              {/* Availability slots */}
                              {tool.toolName === 'getAvailability' && isSuccess && tool.result?.availableSlots && (
                                <div style={{
                                  background: '#fff', border: '1px solid rgba(233,30,140,0.12)',
                                  borderRadius: '12px', padding: '0.8rem',
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                                }}>
                                  <div style={{ fontSize: '0.8rem', color: '#7a5060', marginBottom: '0.5rem', fontWeight: 600 }}>
                                    Available interview slots:
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {Array.isArray(tool.result.availableSlots)
                                      ? tool.result.availableSlots.map((slot: string) => {
                                          const d = new Date(slot);
                                          return (
                                            <button key={slot} onClick={() => send(`I want to book the slot at ${d.toLocaleString()}`)}
                                              style={{
                                                background: 'rgba(233,30,140,0.06)', border: '1px solid rgba(233,30,140,0.2)',
                                                borderRadius: '8px', padding: '0.3rem 0.6rem', fontSize: '0.75rem',
                                                color: '#e91e8c', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                                              }}>
                                              {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} @ {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                            </button>
                                          );
                                        })
                                      : <div style={{ fontSize: '0.78rem', color: '#7a5060' }}>{JSON.stringify(tool.result.availableSlots)}</div>
                                    }
                                  </div>
                                </div>
                              )}

                              {/* Booking confirmation */}
                              {tool.toolName === 'createBooking' && isSuccess && (
                                <div style={{
                                  background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
                                  borderRadius: '12px', padding: '0.75rem', fontSize: '0.82rem',
                                  color: '#15803d', fontWeight: 500,
                                }}>
                                  🎉 {tool.result?.message || 'Interview confirmed!'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', animation: 'fadeUp 0.2s ease' }}>
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#fce4ec,#f8bbd0)',
                      border: '1px solid rgba(233,30,140,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', color: '#e91e8c',
                    }}>✨</div>
                    <div style={{
                      background: '#fff', border: '1px solid rgba(233,30,140,0.12)',
                      padding: '0.7rem 1rem', borderRadius: '16px', borderBottomLeftRadius: '4px',
                      display: 'flex', gap: '4px', alignItems: 'center',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                    }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: '#e91e8c', opacity: 0.7,
                          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            borderTop: '1px solid rgba(233,30,140,0.1)',
            padding: '0.85rem 1.25rem 0.6rem',
            background: '#fff', flexShrink: 0,
          }}>
            <form onSubmit={e => { e.preventDefault(); send(inputValue); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {/* Avatar inside input area */}
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,#fce4ec,#f8bbd0)',
                border: '1px solid rgba(233,30,140,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', color: '#e91e8c',
              }}>✨</div>
              <input
                id="chat-input"
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputValue); } }}
                placeholder={conversation.status === 'connected' ? "Voice active... (click mic to end)" : "Ask about skills, GitHub repos, or schedule a call..."}
                disabled={isLoading || conversation.status === 'connected'}
                autoComplete="off"
                style={{
                  flex: 1, background: '#fdf4f7',
                  border: '1px solid rgba(233,30,140,0.18)',
                  borderRadius: '999px', padding: '0.65rem 1.1rem',
                  fontSize: '0.85rem', color: '#1a0a12',
                  fontFamily: 'inherit', opacity: (isLoading || conversation.status === 'connected') ? 0.6 : 1,
                  transition: 'box-shadow 0.15s',
                }}
              />
              <button
                type="button"
                onClick={toggleVoice}
                title={conversation.status === 'connected' ? "End voice call" : "Start voice call"}
                style={{
                  width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                  background: conversation.status === 'connected' ? '#ef4444' : '#fce4ec',
                  border: '1px solid ' + (conversation.status === 'connected' ? '#dc2626' : 'rgba(233,30,140,0.2)'),
                  color: conversation.status === 'connected' ? '#fff' : '#e91e8c',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                  animation: conversation.status === 'connected' ? 'pulseRing 2s infinite' : 'none',
                }}
              >
                {conversation.status === 'connected' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                )}
              </button>
              <button
                id="send-btn"
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="send-btn"
                style={{
                  width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                  background: (isLoading || !inputValue.trim()) ? 'rgba(233,30,140,0.25)' : '#e91e8c',
                  border: 'none', color: '#fff', cursor: (isLoading || !inputValue.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                  boxShadow: (isLoading || !inputValue.trim()) ? 'none' : '0 3px 12px rgba(233,30,140,0.3)',
                }}
              >
                {isLoading
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                }
              </button>
            </form>
            <div style={{
              textAlign: 'center', fontSize: '0.62rem', color: 'rgba(120,80,100,0.45)',
              marginTop: '0.5rem', letterSpacing: '0.06em', fontWeight: 600,
            }}>
              POWERED BY GROQ · LILY&apos;S AI REPRESENTATIVE · V2.0
            </div>
          </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Chat() {
  const agentId = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID : undefined;
  // If no agentId is provided, we can still render the provider, but it won't connect successfully.
  // We handle the missing agent warning in the toggle function.
  return (
    <ConversationProvider agentId={agentId || ''}>
      <ChatInner />
    </ConversationProvider>
  );
}
