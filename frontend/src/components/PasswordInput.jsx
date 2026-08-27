import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Drop-in replacement for <input type="password">. Accepts the same props a
// normal controlled input would (value, onChange, required, id, etc.) and
// spreads anything extra straight through to the underlying <input>.
export default function PasswordInput({ style, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ width: '100%', paddingRight: 34, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        className="btn-ghost btn btn-sm"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 2,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: 4,
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
