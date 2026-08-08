import { useState, type FormEvent } from "react";
import { ApiError, login } from "../api";

export function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (e) {
      // Distinguish a dead backend from a bad password. Telling someone their
      // password is wrong when Docker is not running sends them to the wrong fix.
      if (e instanceof ApiError && e.isUnreachable) {
        setError("Could not reach the backend. Is it running on " + location.hostname + ":8000?");
      } else {
        setError("Sign in failed. Check your email and password.");
      }
    }
  }

  return (
    <div className="sv-console login-wrap">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>ShipVoice</h1>
        <p className="mut" style={{ font: "var(--type-body-sm)", margin: 0 }}>
          Sign in with the account <code>/setup</code> created.
        </p>
        <input
          aria-label="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email"
        />
        <input
          aria-label="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
        />
        <button type="submit">Sign in</button>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
