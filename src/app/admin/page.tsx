'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const [githubUsername, setGithubUsername] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [isSyncingGithub, setIsSyncingGithub] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  const handleGithubSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncingGithub(true);
    try {
      const res = await fetch('/api/admin/github/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${document.cookie.split('admin_token=')[1]?.split(';')[0]}`,
        },
        body: JSON.stringify({ username: githubUsername, token: githubToken }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.error || 'Failed to sync GitHub');
      }
    } catch (error) {
      toast.error('An error occurred during sync');
    } finally {
      setIsSyncingGithub(false);
    }
  };

  const handleResumeUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploadingResume(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/admin/resume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${document.cookie.split('admin_token=')[1]?.split(';')[0]}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.error || 'Failed to upload resume');
      }
    } catch (error) {
      toast.error('An error occurred during upload');
    } finally {
      setIsUploadingResume(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage Lily's AI Persona knowledge sources and evaluation metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* GitHub Sync */}
        <Card>
          <CardHeader>
            <CardTitle>Sync GitHub</CardTitle>
            <CardDescription>Ingest repositories, READMEs, and commit history.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGithubSync} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="githubUsername">GitHub Username</Label>
                <Input 
                  id="githubUsername" 
                  required 
                  value={githubUsername}
                  onChange={e => setGithubUsername(e.target.value)}
                  placeholder="e.g. lily-dev" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="githubToken">Personal Access Token (Optional but recommended)</Label>
                <Input 
                  id="githubToken" 
                  type="password"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder="ghp_..." 
                />
              </div>
              <Button type="submit" disabled={isSyncingGithub}>
                {isSyncingGithub ? 'Syncing...' : 'Sync GitHub Data'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Resume Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Resume</CardTitle>
            <CardDescription>Upload Lily's resume PDF for RAG context.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResumeUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Resume PDF</Label>
                <Input id="file" name="file" type="file" accept="application/pdf" required />
              </div>
              <Button type="submit" disabled={isUploadingResume}>
                {isUploadingResume ? 'Processing...' : 'Upload & Embed Resume'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Dashboard Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluation Metrics & Bookings</CardTitle>
          <CardDescription>Metrics are computed asynchronously via the evaluation script.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted rounded-xl text-center">
             <div className="text-3xl font-bold">N/A</div>
             <div className="text-xs text-muted-foreground mt-1">MRR</div>
          </div>
          <div className="p-4 bg-muted rounded-xl text-center">
             <div className="text-3xl font-bold">N/A</div>
             <div className="text-xs text-muted-foreground mt-1">Precision@K</div>
          </div>
          <div className="p-4 bg-muted rounded-xl text-center">
             <div className="text-3xl font-bold">0</div>
             <div className="text-xs text-muted-foreground mt-1">Total Bookings</div>
          </div>
          <div className="p-4 bg-muted rounded-xl text-center">
             <div className="text-3xl font-bold">0</div>
             <div className="text-xs text-muted-foreground mt-1">Active Chats</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
