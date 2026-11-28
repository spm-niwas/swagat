import React, { useEffect, useRef, useState } from 'react';
import {
  isValidIndianMobile,
  normalizeIndianMobile,
  processMobileInput,
} from '../utils/formatters';

interface MobileInputProps {
  value: string;
  onChange: (formattedValue: string, digits: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  errorClassName?: string;
  errorAlign?: 'left' | 'center';
  externalError?: string;
  onErrorChange?: (err: string) => void;
  disabled?: boolean;
}

export const MobileInput: React.FC<MobileInputProps> = ({
  value,
  onChange,
  placeholder = 'Mobile',
  ariaLabel = 'Mobile',
  className = '',
  errorClassName = '',
  errorAlign = 'left',
  externalError = '',
  onErrorChange,
  disabled = false,
}) => {
  const [internalError, setInternalError] = useState('');
  const prevValueRef = useRef(value);

  useEffect(() => {
    // Clear validation error when parent resets a non-empty field back to empty
    if (prevValueRef.current && !value) {
      setInternalError('');
      onErrorChange?.('');
    }
    prevValueRef.current = value;
  }, [value, onErrorChange]);

  const activeError = externalError || internalError;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const res = processMobileInput(e.target.value);
    setInternalError(res.error);
    onErrorChange?.(res.error);
    onChange(res.formatted, res.digits);
  };

  const handleBlur = () => {
    const digits = normalizeIndianMobile(value);
    if (digits.length > 0 && !isValidIndianMobile(digits)) {
      const msg = 'Enter a valid 10-digit Mobile starting with 6, 7, 8, or 9.';
      setInternalError(msg);
      onErrorChange?.(msg);
    } else if (digits.length === 0 || isValidIndianMobile(digits)) {
      if (internalError) {
        setInternalError('');
        onErrorChange?.('');
      }
    }
  };

  return (
    <div className="space-y-1">
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={16}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={Boolean(activeError)}
        className={`${className} ${
          activeError ? '!border-rose-400 focus:!ring-rose-500' : ''
        }`.trim()}
      />
      {activeError && (
        <p
          className={`text-[11px] font-semibold text-rose-600 px-1 ${
            errorAlign === 'center' ? 'text-center' : 'text-left'
          } ${errorClassName}`.trim()}
        >
          {activeError}
        </p>
      )}
    </div>
  );
};
