import { NextResponse } from 'next/server'
import { seedToOutcome } from '../../lib/seed'
import { gameConfig } from '../../config/gameConfig'
import { sessions } from '../commit/route'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const outcome = seedToOutcome(session.seed, gameConfig)

    return NextResponse.json(outcome)
  } catch (err) {
    console.error('Reveal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
