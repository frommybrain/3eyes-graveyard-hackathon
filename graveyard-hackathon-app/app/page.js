'use client'

import dynamic from 'next/dynamic'
import { Leva } from 'leva'
import HUD from './components/HUD'
import CaptureController from './components/captureController'
import SelfieModal from './components/selfieModal'
import Toasts from './components/Toasts'

const MainCanvas = dynamic(() => import('./components/mainCanvas'), { ssr: false })

export default function Home() {
  return (
    <>
      <Leva hidden />
      <MainCanvas />
      <HUD />
      <CaptureController />
      <SelfieModal />
      <Toasts />
    </>
  )
}
