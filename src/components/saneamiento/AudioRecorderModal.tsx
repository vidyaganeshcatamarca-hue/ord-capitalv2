import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'

interface AudioRecorderModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AudioRecorderModal({ isOpen, onClose }: AudioRecorderModalProps) {
  const { showToast } = useToast()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }
    startRecording()
    return () => {
      stopTimer()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [isOpen])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/mp3' })
        setAudioBlob(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setIsRecording(true)
      setIsPaused(false)
      startTimer()
    } catch (err: any) {
      showToast(t('saneamiento_audio_error_permiso'), 'error')
      onClose()
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    setIsPaused(false)
    stopTimer()
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      stopTimer()
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      startTimer()
    }
  }

  const startTimer = () => {
    stopTimer()
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const reset = () => {
    stopTimer()
    setIsRecording(false)
    setIsPaused(false)
    setSeconds(0)
    setAudioBlob(null)
    setSending(false)
    chunksRef.current = []
    mediaRecorderRef.current = null
  }

  const sendAudio = async () => {
    if (!audioBlob) return
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
    if (!webhookUrl) {
      showToast(t('saneamiento_audio_error_webhook'), 'error')
      return
    }

    setSending(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, `voz_${Date.now()}.mp3`)
      formData.append('fecha', new Date().toISOString())

      const res = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      showToast(t('saneamiento_audio_enviado'), 'success')
      onClose()
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('saneamiento_audio_titulo_grabar')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="saneamiento-recorder">
          <div className={`saneamiento-recorder-pulse ${isRecording && !isPaused ? 'recording' : ''}`}>
            🎙️
          </div>

          <div className="saneamiento-recorder-timer">{formatTime(seconds)}</div>

          {audioBlob ? (
            <audio controls src={URL.createObjectURL(audioBlob)} style={{ width: '100%', marginBottom: '16px' }} />
          ) : (
            <p className="saneamiento-recorder-hint">{t('saneamiento_audio_hint')}</p>
          )}

          <div className="saneamiento-recorder-actions">
            {!audioBlob ? (
              <>
                {isPaused ? (
                  <button type="button" className="btn btn-secondary" onClick={resumeRecording}>
                    ▶️ {t('saneamiento_audio_reanudar')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={pauseRecording} disabled={!isRecording}>
                    ⏸️ {t('saneamiento_audio_pausar')}
                  </button>
                )}
                <button type="button" className="btn btn-danger" onClick={stopRecording} disabled={!isRecording}>
                  ⏹️ {t('saneamiento_audio_detener')}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={startRecording}>
                  🔄 {t('saneamiento_audio_regrabar')}
                </button>
                <button type="button" className="btn btn-primary" onClick={sendAudio} disabled={sending}>
                  {sending ? t('saneamiento_audio_enviando') : `📤 ${t('saneamiento_audio_enviar')}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
