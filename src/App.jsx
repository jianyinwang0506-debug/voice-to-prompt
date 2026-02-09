import { useState, useRef, useCallback, useEffect } from 'react'

const LANG_OPTIONS = [
  { key: 'zh-CN', label: '中文' },
  { key: 'en-US', label: 'English' },
  { key: 'mixed', label: '中英混合' },
]

// 自然语言 → AI 编程 Prompt 转换
function transformToPrompt(rawText) {
  if (!rawText.trim()) return ''

  const text = rawText.trim()

  if (text.length < 20) {
    return `请帮我实现以下功能：\n\n${text}\n\n要求：\n- 代码简洁、可读性强\n- 包含必要的错误处理\n- 符合最佳实践`
  }

  return `## 任务描述\n${text}\n\n## 技术要求\n- 代码结构清晰，遵循最佳实践\n- 包含必要的错误处理和边界情况\n- 添加关键注释说明实现思路\n- 如涉及多个文件，请分别列出`
}

// 音频波形可视化组件
function AudioVisualizer({ isActive }) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    if (!isActive) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.beginPath()
        ctx.moveTo(0, canvas.height / 2)
        ctx.lineTo(canvas.width, canvas.height / 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      return
    }

    let mounted = true

    async function startVisualizer() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        function draw() {
          if (!mounted) return
          animationRef.current = requestAnimationFrame(draw)
          analyser.getByteTimeDomainData(dataArray)

          const w = canvas.width
          const h = canvas.height
          ctx.clearRect(0, 0, w, h)

          // 白色波形线
          ctx.lineWidth = 2.5
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
          ctx.beginPath()

          const sliceWidth = w / bufferLength
          let x = 0
          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0
            const y = (v * h) / 2
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
            x += sliceWidth
          }
          ctx.lineTo(w, h / 2)
          ctx.stroke()

          // 发光
          ctx.lineWidth = 6
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
          ctx.beginPath()
          x = 0
          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0
            const y = (v * h) / 2
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
            x += sliceWidth
          }
          ctx.lineTo(w, h / 2)
          ctx.stroke()
        }

        draw()
      } catch (err) {
        console.error('无法获取麦克风:', err)
      }
    }

    startVisualizer()

    return () => {
      mounted = false
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [isActive])

  return (
    <canvas
      ref={canvasRef}
      className="audio-visualizer"
      width={900}
      height={48}
    />
  )
}

export default function App() {
  const [isListening, setIsListening] = useState(false)
  const [rawText, setRawText] = useState('')
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [lang, setLang] = useState('mixed')
  const recognitionRef = useRef(null)
  const prevTextRef = useRef('')

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('你的浏览器不支持语音识别，请使用 Chrome 浏览器。')
      return
    }

    const recognitionLang = lang === 'mixed' ? 'zh-CN' : lang

    const recognition = new SpeechRecognition()
    recognition.lang = recognitionLang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      const newText = finalTranscript || interimTranscript
      const prefix = prevTextRef.current
      setRawText(prefix ? prefix + newText : newText)
    }

    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [lang])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const handleToggle = () => {
    if (isListening) {
      stopListening()
    } else {
      prevTextRef.current = rawText
      startListening()
    }
  }

  const handleGenerate = () => {
    const result = transformToPrompt(rawText)
    setPrompt(result)
  }

  const handleCopy = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    setRawText('')
    setPrompt('')
  }

  return (
    <div className="app">
      {/* ===== 上半部分：天蓝色区域 ===== */}
      <div className="sky-section">
        <header className="header">
          <div className="brand">
            <div className="logo">
              <span className="logo-text">Nora<br/>AI</span>
            </div>
            <span className="brand-name">Voice → Prompt</span>
          </div>
          <div className="lang-selector">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`lang-btn ${lang === opt.key ? 'active' : ''}`}
                onClick={() => { if (!isListening) setLang(opt.key) }}
                disabled={isListening}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </header>

        <div className="voice-input-area">
          <div className="mic-row">
            {isListening && <span className="status-dot" />}
            <button
              className={`mic-button ${isListening ? 'listening' : ''}`}
              onClick={handleToggle}
              aria-label={isListening ? '停止录音' : '开始录音'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <span className="mic-hint">
              {isListening ? '正在聆听...' : '点击开始语音输入'}
            </span>
          </div>

          <AudioVisualizer isActive={isListening} />

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="语音识别文字将显示在这里，也可以直接输入..."
            rows={3}
          />
        </div>
      </div>

      {/* ===== 下半部分：白色区域 ===== */}
      <div className="content-section">
        <div className="action-bar">
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!rawText}
          >
            生成 Prompt
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleClear}
            disabled={!rawText && !prompt}
          >
            清空
          </button>
        </div>

        <section className="prompt-panel">
          <div className="panel-header">
            <span className="panel-label">
              <span className="panel-label-icon">&#9998;</span>
              生成的 Prompt
            </span>
            {prompt && (
              <button
                className={`btn-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '✓ 已复制' : '复制'}
              </button>
            )}
          </div>

          <div className="prompt-display">
            {prompt ? (
              <textarea
                className="prompt-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
              />
            ) : (
              <div className="prompt-placeholder">
                <p className="placeholder">生成的 Prompt 将显示在这里，生成后可直接编辑...</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="footer">
        <p>Nora AI — 使用 Chrome 浏览器获得最佳体验</p>
      </footer>
    </div>
  )
}
