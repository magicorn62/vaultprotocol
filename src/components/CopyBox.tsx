// CopyBox Component
import React from 'react';
import Icon from './Icon';

interface CopyBoxProps {
  label: string;
  value: string | null;
  color?: string;
  onCopy?: (text: string) => void;
}

const CopyBox: React.FC<CopyBoxProps> = ({
  label,
  value,
  color = 'indigo',
  onCopy,
}) => {
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      onCopy?.(value);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="mb-4 text-left">
      <label className="text-[10px] uppercase font-black text-slate-500 mb-1 block tracking-wider">
        {label}
      </label>
      <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex items-center justify-between group">
        <span
          className={`mono text-[11px] text-${color}-400 truncate pr-4 select-all`}
        >
          {value || 'Pending...'}
        </span>
        <button
          onClick={handleCopy}
          className="text-slate-500 hover:text-white transition"
          title="Copy to clipboard"
          aria-label="Copy value"
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
    </div>
  );
};

export default CopyBox;
