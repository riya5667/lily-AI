import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  return NextResponse.json({
    hasToken: !!token,
    tokenPrefix: token ? token.substring(0, 8) + '...' : null,
  });
}
