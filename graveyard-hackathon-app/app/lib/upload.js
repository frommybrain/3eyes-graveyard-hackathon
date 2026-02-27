/**
 * Upload image and metadata to Pinata (IPFS).
 * Requires PINATA_JWT env var.
 */

const PINATA_API = 'https://api.pinata.cloud'

function getPinataJwt() {
  const jwt = process.env.PINATA_JWT
  if (!jwt) throw new Error('PINATA_JWT not set — create a free account at pinata.cloud')
  return jwt
}

/**
 * Upload a file buffer to Pinata IPFS.
 * @param {Buffer} buffer - File content
 * @param {string} fileName - File name for the upload
 * @param {string} mimeType - MIME type (e.g. 'image/png')
 * @returns {Promise<string>} IPFS URI (ipfs://...)
 */
export async function uploadFile(buffer, fileName, mimeType = 'image/png') {
  const jwt = getPinataJwt()

  const formData = new FormData()
  const blob = new Blob([buffer], { type: mimeType })
  formData.append('file', blob, fileName)

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Pinata upload failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return `ipfs://${data.IpfsHash}`
}

/**
 * Upload JSON metadata to Pinata IPFS.
 * @param {object} metadata - JSON metadata object
 * @param {string} name - Name for the pin
 * @returns {Promise<string>} IPFS URI (ipfs://...)
 */
export async function uploadJson(metadata, name = 'metadata.json') {
  const jwt = getPinataJwt()

  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Pinata JSON upload failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return `ipfs://${data.IpfsHash}`
}

/**
 * Convert IPFS URI to gateway URL for display.
 */
export function ipfsToHttp(ipfsUri) {
  if (!ipfsUri) return null
  return ipfsUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')
}
