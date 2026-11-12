import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

interface User {
  id: string;
  username: string;
  avatarUrl: string;
}

interface GuestbookMessage {
  id: string;
  username: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
}

interface MessagePage {
  messages: GuestbookMessage[];
  nextCursor: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Something went wrong. Please try again.');
  }
  return payload;
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="github-mark">
      <path
        fill="currentColor"
        d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.7.08-.69.08-.69 1.12.08 1.7 1.15 1.7 1.15.99 1.69 2.6 1.2 3.23.91.1-.72.39-1.2.7-1.48-2.48-.28-5.09-1.24-5.09-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.06 1.15a10.7 10.7 0 0 1 5.57 0c2.13-1.45 3.06-1.15 3.06-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.25-5.1 5.52.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"
      />
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<GuestbookMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadPage = async () => {
      try {
        const [sessionResponse, messageResponse] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/messages'),
        ]);
        const session = await readJson<{ user: User | null }>(sessionResponse);
        const page = await readJson<MessagePage>(messageResponse);
        if (active) {
          setUser(session.user);
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load the guestbook.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPage();
    return () => {
      active = false;
    };
  }, []);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPosting(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft }),
      });
      const result = await readJson<{ message: GuestbookMessage }>(response);
      setMessages((current) => [result.message, ...current]);
      setDraft('');
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : 'Unable to post your message.',
      );
    } finally {
      setPosting(false);
    }
  }

  async function loadOlderMessages() {
    if (!nextCursor) return;
    setError('');
    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/messages?before=${encodeURIComponent(nextCursor)}`,
      );
      const page = await readJson<MessagePage>(response);
      setMessages((current) => [...current, ...page.messages]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load older messages.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function signOut() {
    setError('');
    try {
      const response = await fetch('/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Unable to sign out. Please try again.');
      }
      setUser(null);
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : 'Unable to sign out.',
      );
    }
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="hero-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">A little corner of the internet</p>
        <h1>Guestbook</h1>
        <p className="hero-copy">
          Leave a note for everyone. Your words will find a home here.
        </p>
        {user ? (
          <div className="account">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="avatar" />
            ) : (
              <span className="avatar avatar-fallback" aria-hidden="true">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="account-label">
              Signed in as <strong>{user.username}</strong>
            </span>
            <button type="button" className="text-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <a className="github-button" href="/auth/github">
            <GitHubMark />
            <span>Sign in with GitHub</span>
          </a>
        )}
      </header>

      <section className="guestbook" aria-labelledby="messages-heading">
        {user ? (
          <form className="composer" onSubmit={submitMessage}>
            <label htmlFor="message">Add your note</label>
            <textarea
              id="message"
              name="message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What would you like to say?"
              maxLength={500}
              rows={4}
              required
            />
            <div className="composer-footer">
              <span className="character-count">{draft.length}/500</span>
              <button
                type="submit"
                className="post-button"
                disabled={posting || !draft.trim()}
              >
                {posting ? 'Posting…' : 'Post message'}
              </button>
            </div>
            <p className="permanence-note">
              Messages are permanent and visible to everyone.
            </p>
          </form>
        ) : (
          <div className="sign-in-prompt">
            <span className="prompt-icon" aria-hidden="true">
              ✳
            </span>
            <p>Sign in with GitHub to leave a message.</p>
          </div>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        <div className="messages-heading">
          <div>
            <p className="eyebrow">The conversation</p>
            <h2 id="messages-heading">Messages</h2>
          </div>
          <span className="message-count">
            {messages.length > 0
              ? `${messages.length}${nextCursor ? '+' : ''} ${
                  messages.length === 1 ? 'note' : 'notes'
                }`
              : ''}
          </span>
        </div>

        {loading ? (
          <p className="empty-state" role="status">
            Loading guestbook…
          </p>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">✎</span>
            <p>No notes yet. Be the first to leave one.</p>
          </div>
        ) : (
          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article className="message-card" key={message.id}>
                <div className="message-topline">
                  <div className="author">
                    {message.avatarUrl ? (
                      <img src={message.avatarUrl} alt="" className="avatar" />
                    ) : (
                      <span className="avatar avatar-fallback" aria-hidden="true">
                        {message.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <strong>{message.username}</strong>
                  </div>
                  <time dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(message.createdAt))}
                  </time>
                </div>
                <p className="message-text">{message.text}</p>
              </article>
            ))}
          </div>
        )}

        {nextCursor && (
          <button
            type="button"
            className="load-more"
            onClick={loadOlderMessages}
            disabled={loadingOlder}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}
      </section>

      <footer className="footer">
        <span>Every note makes this place a little more human.</span>
      </footer>
    </main>
  );
}
