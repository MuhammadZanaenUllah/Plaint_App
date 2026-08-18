import { createContext, useContext, useMemo, useState, PropsWithChildren } from "react";

type SearchContextValue = {
  searchText: string;
  setSearchText: (text: string) => void;
  // Set by a screen (e.g. Tasks) based on its own list scroll position, read
  // by the shared AppHeader/tab layout to collapse the search bar to an icon.
  isHeaderCompact: boolean;
  setIsHeaderCompact: (compact: boolean) => void;
};

const SearchContext = createContext<SearchContextValue>({
  searchText: "",
  setSearchText: () => {},
  isHeaderCompact: false,
  setIsHeaderCompact: () => {},
});

export function SearchProvider({ children }: PropsWithChildren) {
  const [searchText, setSearchText] = useState("");
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const value = useMemo(
    () => ({ searchText, setSearchText, isHeaderCompact, setIsHeaderCompact }),
    [searchText, isHeaderCompact]
  );
  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  return useContext(SearchContext);
}
