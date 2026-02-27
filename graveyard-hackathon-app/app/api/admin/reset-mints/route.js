import { NextResponse } from 'next/server'
import { resetStore, getMintCount } from '../../../lib/mintStore'

export async function POST(request) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await resetStore()
  const count = await getMintCount()

  return NextResponse.json({ ok: true, mintCount: count })
}
