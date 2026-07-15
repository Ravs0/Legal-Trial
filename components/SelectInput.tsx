import React from 'react';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  containerClassName?: string;
  placeholder?: string;
}

export const SelectInput: React.FC<SelectInputProps> = ({
  label,
  options,
  id,
  className = '',
  containerClassName = '',
  placeholder,
  ...props
}) => {
  const generatedId = React.useId().replace(/:/g, '');
  const selectId = id || props.name || `select-${generatedId}`;
  const baseInputStyle = `block w-full bg-brand-bg-primary rounded-xl py-3 px-4 
                          border border-brand-text-primary/30 focus:outline-none focus:ring-1 focus:ring-brand-accent 
                          text-brand-text-primary text-sm sm:text-base hover:border-brand-text-primary/60
                          transition-colors duration-300`;
  const labelColor = 'text-brand-text-secondary font-medium tracking-wide text-xs uppercase mb-2 ml-1';

  return (
    <div className={`mb-5 ${containerClassName}`}>
      {label && (
        <label htmlFor={selectId} className={`block ${labelColor}`}>
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`${baseInputStyle} appearance-none pr-10 cursor-pointer ${className}`}
          {...props}
        >
          {placeholder && <option value="" className="text-brand-text-secondary bg-brand-bg-primary">{placeholder}</option>}
          {options.map(option => {
            if (typeof option.value === 'string' && option.value.startsWith('__optgroup__')) {
              return (
                <option key={option.value} value={option.value} disabled className="text-brand-accent font-semibold bg-brand-bg-primary pb-1 pt-2">
                  {option.label}
                </option>
              );
            }
            return (
              <option key={option.value} value={option.value} disabled={option.disabled} className="bg-brand-bg-primary text-brand-text-primary py-2">
                {option.label}
              </option>
            );
          })}
        </select>

        {/* Custom Dropdown Arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-brand-accent/70">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
