import { useDeferredValue, useEffect, useState } from "react";

export function useTaskSearch(query: string, delay = 300): string {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), delay);
    return () => clearTimeout(timer);
  }, [delay, query]);
  return useDeferredValue(debouncedQuery);
}
