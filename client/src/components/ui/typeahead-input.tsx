"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type FieldHint } from "@/lib/api";
import { useTheme } from "@/context/theme-context";

interface TypeaheadInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fieldKey: string;
  onValueChange?: (value: string) => void;
}

export function TypeaheadInput({ 
  fieldKey, 
  className, 
  onValueChange,
  value,
  onChange,
  ...props 
}: TypeaheadInputProps) {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState(value?.toString() || "");
  const [suggestions, setSuggestions] = useState<FieldHint[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external value
  useEffect(() => {
    if (value !== undefined && value !== inputValue) {
      setInputValue(value.toString());
    }
  }, [value, inputValue]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setSuggestions([]);
      return;
    }
    
    try {
      const hints = await api.brokers.getHints(fieldKey, query, 8);
      setSuggestions(hints);
    } catch (e) {
      setSuggestions([]);
    }
  }, [fieldKey]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedIndex(-1);
    
    // Call original onChange if provided
    if (onChange) {
      onChange(e);
    }
    
    if (onValueChange) {
      onValueChange(newValue);
    }

    // Debounce the API call
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 250);
  };

  const handleFocus = () => {
    setShowSuggestions(true);
    if (inputValue) {
      fetchSuggestions(inputValue);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
      }
    }, 150);
  };

  const selectSuggestion = (suggestion: FieldHint) => {
    setInputValue(suggestion.value);
    setSuggestions([]);
    setShowSuggestions(false);
    
    if (onValueChange) {
      onValueChange(suggestion.value);
    }
    
    // Trigger a synthetic change event for form compatibility
    if (inputRef.current) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputRef.current, suggestion.value);
        const event = new Event('input', { bubbles: true });
        inputRef.current.dispatchEvent(event);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-10 w-full rounded-md border px-3 py-2 text-sm",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div className={cn(
          "absolute z-50 w-full mt-1 border shadow-lg max-h-48 overflow-auto",
          theme === "arcade90s" 
            ? "bg-arc-panel border-arc-secondary rounded-none" 
            : "bg-brand-card border-brand-border rounded-md"
        )}>
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.value}-${index}`}
              onClick={() => selectSuggestion(suggestion)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer flex justify-between items-center",
                index === selectedIndex
                  ? theme === "arcade90s"
                    ? "bg-arc-secondary/20 text-arc-secondary"
                    : "bg-brand-gold/10 text-brand-gold"
                  : theme === "arcade90s"
                    ? "text-arc-text hover:bg-arc-secondary/10"
                    : "text-brand-text hover:bg-brand-border/30"
              )}
            >
              <span className={theme === "arcade90s" ? "arcade-pixel-font text-xs" : ""}>
                {suggestion.value}
              </span>
              <span className={cn(
                "text-[10px]",
                theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
              )}>
                {suggestion.usageCount}x
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
