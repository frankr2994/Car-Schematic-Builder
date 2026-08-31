import { NextResponse } from 'next/server';
import { templates } from '../../../catalog/components';

export async function GET() {
  return NextResponse.json({ templates });
}
