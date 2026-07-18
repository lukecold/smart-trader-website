import { useEffect, useState } from "react";

// useDebouncedValue returns value after it has been stable for `delay` ms —
// the standard typeahead pattern (keeps a search request from firing per
// keystroke).
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
