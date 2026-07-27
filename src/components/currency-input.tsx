import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  min?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  /** Max decimal places allowed while typing. Defaults to 2. */
  decimals?: number;
  disabled?: boolean;
}

/** Format a raw typed string with thousand separators, keeping a trailing "." or decimals. */
export function formatCurrencyText(raw: string, decimals = 2): string {
  const cleaned = raw.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");
  if (cleaned === "") return "";
  const [whole, decimal] = cleaned.split(".");
  const formattedWhole = whole ? Number(whole).toLocaleString("en-US") : "0";
  if (decimal === undefined) return formattedWhole;
  return `${formattedWhole}.${decimal.slice(0, decimals)}`;
}

export function parseCurrencyText(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function CurrencyInput({
  value,
  onChange,
  id,
  min = 0,
  step = 1,
  className,
  placeholder,
  decimals = 2,
  disabled,
}: CurrencyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [text, setText] = useState(() => (value ? formatCurrencyText(String(value), decimals) : ""));

  // Keep display in sync when the value is changed from outside.
  useEffect(() => {
    if (parseCurrencyText(text) !== value) {
      setText(value ? formatCurrencyText(String(value), decimals) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = formatCurrencyText(e.target.value, decimals);
    setText(next);
    onChange(parseCurrencyText(next));
  };

  const handleBlur = () => {
    const parsed = Math.max(min, parseCurrencyText(text));
    setText(text === "" ? "" : formatCurrencyText(String(parsed), decimals));
    onChange(text === "" ? 0 : parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(min, value + (e.key === "ArrowUp" ? step : -step));
      setText(formatCurrencyText(String(next), decimals));
      onChange(next);
    }
  };

  return (
    <Input
      id={inputId}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}
