export function captureCanvas() {
  return new Promise((resolve) => {
    // Wait 2 frames for rendering to settle after camera switch
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = document.querySelector('canvas')
        if (!canvas) {
          resolve(null)
          return
        }
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      })
    })
  })
}

export async function compositeOverlay(selfieBlob, overlayPath, aura) {
  const selfieImg = await createImageBitmap(selfieBlob)

  const canvas = document.createElement('canvas')
  canvas.width = selfieImg.width
  canvas.height = selfieImg.height
  const ctx = canvas.getContext('2d')

  // Draw the selfie
  ctx.drawImage(selfieImg, 0, 0)

  // Black Sun: apply RGB distortion before overlay
  if (aura?.hasDistortion) {
    applyBlackSunDistortion(ctx, canvas.width, canvas.height)
  }

  // Load and draw aura sigil overlay if available
  if (overlayPath) {
    try {
      const overlayImg = await loadImage(overlayPath)
      ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height)
    } catch (e) {
      console.warn('Overlay not found, skipping:', overlayPath)
    }
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function applyBlackSunDistortion(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Red boost, green/blue crush → red/black palette
    data[i] = Math.min(255, Math.floor(r * 1.4) + 30)
    data[i + 1] = Math.floor(g * 0.3)
    data[i + 2] = Math.floor(b * 0.4)
  }

  ctx.putImageData(imageData, 0, 0)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.crossOrigin = 'anonymous'
    img.src = src
  })
}
