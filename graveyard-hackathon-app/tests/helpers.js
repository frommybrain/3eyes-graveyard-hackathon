// Helper to create a mock Next.js Request for API route testing
export function createRequest(body, options = {}) {
  const { method = 'POST', headers = {} } = options
  const url = options.url || 'http://localhost:3000/api/test'

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Parse JSON from NextResponse
export async function parseResponse(response) {
  const json = await response.json()
  return { status: response.status, json }
}

// Fake wallet addresses for testing
export const TEST_WALLETS = {
  user1: '5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM',
  user2: '7nYQq8GBu9rPExfvAJDcAJX1PmGPMSzF2hQhQN1V9L3y',
  treasury: 'C97aR8CnKQKJ54WjG7iEBqEavQCxkGsHzfHi2HG48odx',
}
