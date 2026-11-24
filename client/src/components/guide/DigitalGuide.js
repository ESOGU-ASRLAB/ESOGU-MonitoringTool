import React, { useEffect, useMemo, useRef, useState } from 'react';
import GuideAvatar from './GuideAvatar';
import { REFERENCE_TOPICS, TOUR_STOPS } from './guideContent';
import { answerGuide, normalize } from './guideAnswers';
import { getGuideTopics } from './guidePresentation';
import { GUIDE_UI } from './guideLanguage';
import './DigitalGuide.css';

function Icon({ name }) {
  const paths = {
    play: <path d="m9 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    previous: <path d="M5 5v14m14-14-10 7 10 7z" />,
    next: <path d="M19 5v14M5 5l10 7-10 7z" />,
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z" />,
    list: <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />,
    sound: <path d="m11 4-6 5H2v6h3l6 5zM15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />,
    muted: <path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6" />,
    settings: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}

function TopicAnswer({ item, onFocus, compact, ui }) {
  return <article className="guide-answer-topic">
    <h4>{item.title}</h4>
    <p>{compact ? item.summary : item.intro}</p>
    <div className="guide-answer-actions">
      <button type="button" className="guide-text-button" onClick={() => onFocus(item.id)}><Icon name="play" />{ui.show}</button>
      <details className="guide-answer-details">
        <summary>{ui.details}</summary>
        <div className="guide-detail-content">
          {REFERENCE_TOPICS.includes(item.id) && <small className="guide-model-tag reference">{ui.reference}</small>}
          <p>{item.detail}</p>
          {item.sources?.length > 0 && <div className="guide-sources"><strong>{ui.sources}</strong><ul>{item.sources.map((source) => <li key={source.label}>{source.href ? <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a> : source.label}</li>)}</ul></div>}
        </div>
      </details>
    </div>
  </article>;
}

function Answer({ answer, onFocus, ui }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? answer.items : answer.items.slice(0, 3);
  return <div className="guide-answer">
    {answer.intro && <p>{answer.intro}</p>}
    {items.map((topic) => <TopicAnswer key={topic.id} item={topic} onFocus={onFocus} compact={answer.items.length > 1} ui={ui} />)}
    {answer.items.length > 3 && <button type="button" className="guide-more-button" aria-expanded={expanded} onClick={() => setExpanded((old) => !old)}>{expanded ? ui.less : `${ui.more} (${answer.items.length - 3})`}</button>}
    {answer.extra && <p className="guide-live-note">{answer.extra}</p>}
  </div>;
}

export default function DigitalGuide({ guide, inVR, liveStatus, animate, children }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const previousTopic = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const resumeAfterChat = useRef(false);
  const { session, item, narration, settings, active, pause } = guide;
  const language = settings.language;
  const ui = GUIDE_UI[language];
  const topics = useMemo(() => getGuideTopics(language), [language]);
  // Keep questions and their context; switching language updates all answers
  // without losing history or changing the historical connection status.
  const answers = useMemo(() => messages.map((message) => answerGuide(message.question, { ...message.options, language })), [messages, language]);
  const index = session ? TOUR_STOPS.indexOf(session.id) : 0;

  useEffect(() => { if (open && tab === 'chat') inputRef.current?.focus(); }, [open, tab]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }, [messages, open]);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      if (settingsOpen) setSettingsOpen(false);
      else if (routeOpen) setRouteOpen(false);
      else if (open) {
        setOpen(false);
        if (resumeAfterChat.current && session?.paused) pause();
        resumeAfterChat.current = false;
        requestAnimationFrame(() => launcherRef.current?.focus());
      }
      else if (active && !session?.paused) pause();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, settingsOpen, routeOpen, active, pause, session?.paused]);

  const openChat = () => {
    resumeAfterChat.current = guide.active && !session?.paused;
    if (resumeAfterChat.current) guide.pause();
    if (session?.id) previousTopic.current = session.id;
    setTab('chat');
    setRouteOpen(false);
    setSettingsOpen(false);
    setOpen(true);
  };
  const closeChat = () => {
    setOpen(false);
    if (resumeAfterChat.current && session?.paused) guide.pause();
    resumeAfterChat.current = false;
    requestAnimationFrame(() => launcherRef.current?.focus());
  };
  const focus = (id) => { setOpen(false); setRouteOpen(false); guide.go(id, 'focus'); };
  const ask = (question) => {
    const value = question.trim().slice(0, 600);
    if (!value) return;
    const options = { previousTopic: previousTopic.current, liveStatus, animate };
    const answer = answerGuide(value, { ...options, language });
    previousTopic.current = answer.focusId || previousTopic.current;
    setMessages((old) => [...old.slice(-39), { question: value, options }]);
    setQuery('');
  };
  const setOption = (key, value) => guide.setSettings((old) => ({ ...old, [key]: value }));
  const startTour = () => { setOpen(false); setSettingsOpen(false); setRouteOpen(false); guide.start(); };
  const filtered = topics.filter((topic) => normalize(`${topic.title} ${topic.group} ${topic.aliases.join(' ')}`).includes(normalize(filter)));

  const viewControls = (
    <div className="view-controls" role="group" aria-label="3D view controls">
      {children}
      {!inVR && !session && !open && (
        <div className="digital-guide guide-launchers" lang={language} data-guide-ui>
          <button className="guide-auto-button" type="button" onClick={startTour}>
            <Icon name="play" />{ui.autoTour}
          </button>
          <button ref={launcherRef} className="guide-chat-button" type="button" onClick={openChat} aria-expanded={open} aria-controls="asrlab-guide-panel">
            <Icon name="chat" /><span>{ui.guide}</span>
          </button>
        </div>
      )}
    </div>
  );

  return <>{viewControls}{!inVR && <div className="digital-guide" lang={language} data-guide-ui>

    {session && !open && <section className="guide-tour" aria-label={ui.tour} aria-busy={guide.active && !guide.cameraReady} data-shot={guide.request?.shot}>
      <div className="guide-tour-progress" role="progressbar" aria-label={ui.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((index + (session.phase === 'complete' ? 1 : narration.progress)) / TOUR_STOPS.length * 100)}><span style={{ width: `${(index + (session.phase === 'complete' ? 1 : narration.progress)) / TOUR_STOPS.length * 100}%` }} /></div>
      <div className="guide-tour-heading">
        <GuideAvatar small speaking={narration.speaking && !session.paused} />
        <h2 title={item.title}>{item.title}</h2>
        <button type="button" className="guide-icon-button" onClick={() => setRouteOpen((old) => !old)} aria-label={ui.topics} title={ui.topics} aria-expanded={routeOpen}><Icon name="list" /></button>
        <button className="guide-icon-button" type="button" onClick={guide.stop} aria-label={ui.closeTour}><Icon name="close" /></button>
      </div>
      <p className="guide-caption" aria-live="polite" aria-atomic="true">{(session.phase === 'moving' || session.phase === 'finishing') ? (session.paused ? ui.movingPaused : ui.moving) : session.phase === 'complete' ? (session.mode === 'tour' ? ui.complete : ui.focusComplete) : narration.caption || item.summary}</p>
      <div className="guide-tour-footer">
        <div className="guide-playback">
          <button className="guide-icon-button" type="button" onClick={guide.previous} disabled={index === 0} aria-label={ui.previous}><Icon name="previous" /></button>
          <button className="guide-resume-button" type="button" onClick={() => session.phase === 'complete' ? guide.go(item.id, session.mode) : guide.pause()}><Icon name={session.paused || session.phase === 'complete' ? 'play' : 'pause'} />{session.phase === 'complete' ? ui.replay : session.paused ? ui.resume : ui.pause}</button>
          <button className="guide-icon-button" type="button" onClick={guide.next} disabled={index === TOUR_STOPS.length - 1} aria-label={ui.next}><Icon name="next" /></button>
          <button className="guide-icon-button" type="button" onClick={() => setOption('muted', !settings.muted)} aria-label={settings.muted ? ui.unmute : ui.mute} aria-pressed={settings.muted}><Icon name={settings.muted ? 'muted' : 'sound'} /></button>
          <button className="guide-icon-button" type="button" onClick={() => setSettingsOpen((old) => !old)} aria-label={ui.settings} aria-expanded={settingsOpen}><Icon name="settings" /></button>
        </div>
        <button type="button" className="guide-ask-button" onClick={openChat} aria-label={ui.ask} title={ui.ask}><Icon name="chat" /><span>{ui.ask}</span></button>
      </div>
      {narration.speechError && <p className="guide-speech-note" role="status">{narration.speechError}</p>}
      {!narration.supported && <p className="guide-speech-note">{ui.noSpeech}</p>}
      {settingsOpen && <div className="guide-settings">
        {guide.hasDetail && <div className="guide-camera-mode">
          <span>{guide.cameraReady ? guide.shotLabel : ui.moving}</span>
          <div role="group" aria-label={ui.camera}>
            <button type="button" aria-pressed={guide.cameraView === 'auto'} onClick={() => guide.setCameraView('auto')}>{ui.auto}</button>
            <button type="button" aria-pressed={guide.cameraView === 'detail'} onClick={() => guide.setCameraView('detail')}>{ui.closeUp}</button>
            <button type="button" aria-pressed={guide.cameraView === 'context'} onClick={() => guide.setCameraView('context')}>{guide.contextLabel}</button>
          </div>
        </div>}
        <label>{ui.speed}<select value={settings.rate} onChange={(event) => setOption('rate', Number(event.target.value))}><option value="0.85">{ui.slow} · 0.85×</option><option value="1">{ui.normal} · 1×</option><option value="1.15">{ui.fast} · 1.15×</option><option value="1.3">{ui.faster} · 1.3×</option></select></label>
        {narration.supported && !narration.hasLanguageVoice && <p>{ui.noVoice}</p>}
      </div>}
    </section>}

    {routeOpen && !open && <section className="guide-route" aria-label={ui.topics}><div className="guide-panel-heading"><button className="guide-icon-button" type="button" onClick={() => setRouteOpen(false)} aria-label={ui.close}><Icon name="close" /></button></div><div className="guide-topic-list">{topics.map((topic, i) => <button type="button" key={topic.id} className={item?.id === topic.id ? 'selected' : ''} onClick={() => { setRouteOpen(false); guide.go(topic.id, session?.mode || 'tour'); }}><span>{i + 1}</span><div>{topic.title}</div></button>)}</div></section>}

    {open && <section id="asrlab-guide-panel" className="guide-panel" role="dialog" aria-modal="false" aria-label={ui.guide}>
      <div className="guide-panel-heading"><GuideAvatar small /><h2>{ui.guide}</h2><button className="guide-icon-button" type="button" onClick={closeChat} aria-label={ui.close}><Icon name="close" /></button></div>
      <div className="guide-tabs" role="tablist" aria-label={ui.guide}><button type="button" id="guide-chat-tab" role="tab" aria-selected={tab === 'chat'} aria-controls="guide-chat-content" onClick={() => setTab('chat')}>{ui.ask}</button><button type="button" id="guide-topics-tab" role="tab" aria-selected={tab === 'topics'} aria-controls="guide-topics-content" onClick={() => setTab('topics')}>{ui.explore}</button></div>
      {session && <div className="guide-paused-banner">{session.phase === 'complete' ? ui.focusComplete : ui.paused}<button type="button" onClick={() => { setOpen(false); if (session.paused) guide.pause(); }}>{ui.returnTour}</button></div>}
      {tab === 'chat' ? <>
        <div className="guide-messages" id="guide-chat-content" role="tabpanel" aria-labelledby="guide-chat-tab">
          {messages.length === 0 && <><div className="guide-welcome"><h3>{ui.welcome}</h3><p>{ui.welcomeText}</p><button type="button" className="guide-auto-button" onClick={startTour}><Icon name="play" />{ui.autoTour}</button></div><div className="guide-suggestions">{ui.suggestions.map((text) => <button type="button" key={text} onClick={() => ask(text)}>{text}</button>)}</div></>}
          {messages.map((message, i) => <React.Fragment key={i}><div className="guide-user-message">{message.question}</div><Answer answer={answers[i]} onFocus={focus} ui={ui} /></React.Fragment>)}
          <div ref={endRef} />
        </div>
        <form className="guide-form" onSubmit={(event) => { event.preventDefault(); ask(query); }}><label className="guide-sr-only" htmlFor="guide-question">{ui.placeholder}</label><input ref={inputRef} id="guide-question" value={query} maxLength={600} onChange={(event) => setQuery(event.target.value)} placeholder={ui.placeholder} autoComplete="off" /><button type="submit" disabled={!query.trim()}>{ui.ask}</button></form>
      </> : <div className="guide-topic-browser" id="guide-topics-content" role="tabpanel" aria-labelledby="guide-topics-tab"><label className="guide-sr-only" htmlFor="guide-topic-filter">{ui.search}</label><input id="guide-topic-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={ui.search} /><div className="guide-topic-list">{filtered.map((topic) => <button type="button" key={topic.id} onClick={() => focus(topic.id)}><Icon name="play" /><div>{topic.title}<small>{topic.group}</small></div></button>)}{!filtered.length && <p className="guide-empty">{ui.empty}</p>}</div></div>}
    </section>}
  </div>}</>;
}
