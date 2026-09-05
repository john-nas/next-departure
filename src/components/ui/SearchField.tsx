import { Search, X } from 'lucide-react'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  autoFocus?: boolean
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
  autoFocus = false,
}: SearchFieldProps) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="search-field__clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </label>
  )
}
