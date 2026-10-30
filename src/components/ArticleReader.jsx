import { useEffect, useState } from 'react'
import { fetchArticle, fetchTranslation, timeAgo } from '../lib/news'
import { useLang } from '../lib/i18n'

// On-site article reader: clicking a story opens this modal with an
// excerpt fetched live through our /api/article relay — the reader
// never leaves TickPin and nothing is stored. A Translate button
// (Boss, 2026-10-29) re-renders the headline + excerpt in the chosen
// language via /api/translate. The full article lives at the source;
// following the link out always passes through a "you're leaving
// TickPin" warning first (Boss's rule, 2026-10-29).

const TRANSLATE_LANGS = [
  ['en', 'English'],
  ['th', 'ไทย'],
  ['es', 'Español'],
  ['zh-CN', '中文（简体）'],
  ['zh-TW', '中文（繁體）'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['vi', 'Tiếng Việt'],
  ['id', 'Bahasa Indonesia'],
  ['ms', 'Bahasa Melayu'],
  ['hi', 'हिन्दी'],
  ['ar', 'العربية'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
  ['it', 'Italiano'],
  ['lo', 'ລາວ'],
  ['my', 'မြန်မာ'],
  ['km', 'ខ្មែរ'],
]

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function ArticleReader({ story, onClose }) {
  const { t, lang } = useLang()
  const [state, setState] = useState('loading') // loading|ok|error
  const [article, setArticle] = useState(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [targetLang, setTargetLang] = useState(lang === 'th' ? 'th' : 'en')
  const [translated, setTranslated] = useState(null) // { title, paras } | null
  const [translating, setTranslating] = useState(false)
  const [translateFailed, setTranslateFailed] = useState(false)

  useEffect(() => {
    if (!story?.url) return
    let live = true
    setState('loading')
    setArticle(null)
    setConfirmLeave(false)
    setTranslated(null)
    setTranslateFailed(false)
    fetchArticle(story.url)
      .then((data) => {
        if (!live) return
        if (data?.ok) {
          setArticle(data)
          setState('ok')
        } else {
          setState('error')
        }
      })
      .catch(() => {
        if (live) setState('error')
      })
    return () => {
      live = false
    }
  }, [story?.url])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!story) return null
  const host = hostOf(story.url) || article?.host || ''
  const title = translated?.title || article?.title || story.title
  const paras = translated
    ? translated.paras
    : state === 'ok'
      ? article.excerpt.split('\n\n')
      : []

  const leaveNow = () => {
    window.open(story.url, '_blank', 'noreferrer')
    onClose()
  }

  const doTranslate = async () => {
    if (!article?.ok && state !== 'ok') return
    setTranslating(true)
    setTranslateFailed(false)
    try {
      const [newTitle, newBody] = await Promise.all([
        fetchTranslation(article.title || story.title, targetLang),
        fetchTranslation(article.excerpt, targetLang),
      ])
      const newParas = newBody
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
      setTranslated({ title: newTitle, paras: newParas.length ? newParas : [newBody] })
    } catch {
      setTranslateFailed(true)
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal reader-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {confirmLeave ? (
          <div className="leave-warning">
            <h3>{t('leave.title')}</h3>
            <p>{t('leave.body', { host })}</p>
            <div className="reader-actions">
              <button className="reader-btn primary" onClick={leaveNow}>
                {t('leave.continue')}
              </button>
              <button className="reader-btn" onClick={() => setConfirmLeave(false)}>
                {t('leave.stay')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="news-meta">
              <span className="news-publisher">{story.publisher}</span>
              {story.publishedAt > 0 && (
                <span className="news-time">{timeAgo(story.publishedAt)}</span>
              )}
            </div>
            <h3 className="reader-title">{title}</h3>
            {story.thumbnail && (
              <img className="reader-thumb" src={story.thumbnail} alt="" loading="lazy" />
            )}
            {state === 'loading' && <p>{t('reader.loading')}</p>}
            {state === 'error' && (
              <>
                <p>{t('reader.failed')}</p>
                <p className="reader-note">{t('reader.failedHint')}</p>
              </>
            )}
            {state === 'ok' && (
              <>
                <div className="reader-body">
                  {paras.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
                <p className="reader-note">{t('reader.excerptNote')}</p>
                <div className="reader-tools">
                  <select
                    className="reader-lang"
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    aria-label={t('reader.translate')}
                  >
                    {TRANSLATE_LANGS.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {translated ? (
                    <button className="reader-btn" onClick={() => setTranslated(null)}>
                      {t('reader.showOriginal')}
                    </button>
                  ) : (
                    <button
                      className="reader-btn"
                      onClick={doTranslate}
                      disabled={translating}
                    >
                      {translating ? t('reader.translating') : t('reader.translate')}
                    </button>
                  )}
                  {translateFailed && (
                    <span className="reader-note">{t('reader.translateFailed')}</span>
                  )}
                </div>
              </>
            )}
            <p className="reader-source">
              {t('reader.source', { publisher: story.publisher || host, host })}
            </p>
            <div className="reader-actions">
              <button className="reader-btn primary" onClick={() => setConfirmLeave(true)}>
                {t('reader.readFull')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
